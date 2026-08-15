/**
 * Web Audio playback engine for a tab: schedules a plucked-string sound
 * (see `pluckSynth.ts`) for each note at its computed start time, honoring
 * an adjustable tempo (via `tempoBpm`) and transposition (semitones).
 *
 * Playback position updates are reported via `onProgress`, which callers
 * (e.g. the auto-scroll feature) can use to know which note is currently
 * sounding.
 */
import { applyFadeEnvelope, synthesizePluck, synthesizeSlide } from "./pluckSynth";
import { computePlaybackSchedule, totalDurationSeconds, type TimedNote } from "./tabLayout";
import type { NoteOut, TuningOut } from "../types/api";

export interface PlaybackCallbacks {
  onProgress?: (currentNoteId: string | null, elapsedSeconds: number) => void;
  onEnded?: () => void;
}

export class TabPlaybackEngine {
  private audioContext: AudioContext | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private rafHandle: number | null = null;
  private startedAtContextTime = 0;
  private schedule: TimedNote[] = [];
  private durationSeconds = 0;
  private callbacks: PlaybackCallbacks;
  private playing = false;

  constructor(callbacks: PlaybackCallbacks = {}) {
    this.callbacks = callbacks;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  private ensureContext(): AudioContext {
    if (!this.audioContext) {
      const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioCtor();
    }
    return this.audioContext;
  }

  play(
    notes: NoteOut[],
    tuning: TuningOut,
    tempoBpm: number,
    transposeSemitones: number,
  ): void {
    this.stop();
    const ctx = this.ensureContext();
    this.schedule = computePlaybackSchedule(notes, tuning, tempoBpm, transposeSemitones);
    this.durationSeconds = totalDurationSeconds(notes, tempoBpm);
    this.startedAtContextTime = ctx.currentTime + 0.05;
    this.playing = true;

    for (const note of this.schedule) {
      const noteDurationSeconds = Math.max(0.05, note.duration_beats * (60 / tempoBpm));
      for (const sound of note.sounds) {
        const rawSamples =
          sound.technique === "slide" && sound.slideToFrequency !== undefined
            ? synthesizeSlide({
                startFrequency: sound.frequency,
                endFrequency: sound.slideToFrequency,
                sampleRate: ctx.sampleRate,
                durationSeconds: noteDurationSeconds,
                damping: 0.4,
              })
            : synthesizePluck({
                frequency: sound.frequency,
                sampleRate: ctx.sampleRate,
                durationSeconds: noteDurationSeconds,
                damping: 0.4,
              });
        const samples = applyFadeEnvelope(rawSamples);
        const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        // Hammer-ons and pull-offs are played legato (fretting-hand only,
        // no pick attack), so they should sound noticeably softer than a
        // picked note; a plain note or slide keeps full pick volume.
        gain.gain.value = sound.technique === "hammer_on" || sound.technique === "pull_off" ? 0.35 : 0.6;
        source.connect(gain).connect(ctx.destination);
        source.start(this.startedAtContextTime + note.startTimeSeconds);
        this.sources.push(source);
      }
    }

    this.tick();

    const totalMs = this.durationSeconds * 1000 + 200;
    window.setTimeout(() => {
      if (this.playing) {
        this.playing = false;
        this.callbacks.onEnded?.();
      }
    }, totalMs);
  }

  private tick = (): void => {
    if (!this.playing || !this.audioContext) return;
    const elapsed = this.audioContext.currentTime - this.startedAtContextTime;
    let currentNoteId: string | null = null;
    for (const note of this.schedule) {
      if (note.startTimeSeconds <= elapsed) currentNoteId = note.id;
    }
    this.callbacks.onProgress?.(currentNoteId, Math.max(0, elapsed));
    if (elapsed < this.durationSeconds) {
      this.rafHandle = window.requestAnimationFrame(this.tick);
    }
  };

  stop(): void {
    this.playing = false;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // Already stopped/ended; ignore.
      }
    }
    this.sources = [];
    if (this.rafHandle !== null) {
      window.cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }

  dispose(): void {
    this.stop();
    this.audioContext?.close();
    this.audioContext = null;
  }
}
