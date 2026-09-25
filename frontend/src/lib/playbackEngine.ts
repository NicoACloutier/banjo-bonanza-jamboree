/**
 * Web Audio playback engine for a tab: schedules a plucked-string sound
 * (see `pluckSynth.ts`) for each note at its computed start time, honoring
 * an adjustable tempo (via `tempoBpm`) and transposition (semitones).
 *
 * Playback position updates are reported via `onProgress`, which callers
 * (e.g. the auto-scroll feature) can use to know which note is currently
 * sounding.
 */
import { applyFadeEnvelope, synthesizePitchChange, synthesizePluck, synthesizeSlide } from "./pluckSynth";
import { computePlaybackSchedule, totalDurationSeconds, type SoundEvent, type TimedNote } from "./tabLayout";
import type { NoteOut, TuningOut } from "../types/api";

/** Render one string's sound for a note, shaped by its technique. */
function synthesizeSound(sound: SoundEvent, sampleRate: number, durationSeconds: number): Float32Array {
  const common = { sampleRate, durationSeconds, damping: 0.4 };
  if (sound.technique === "slide" && sound.slideToFrequency !== undefined) {
    // Pluck, then slide into the target fret around the middle of the note.
    return synthesizePitchChange({
      ...common,
      startFrequency: sound.frequency,
      endFrequency: sound.slideToFrequency,
      changeAtFraction: 0.4,
      changeOverFraction: 0.2,
    });
  }
  if (sound.technique === "bend" && sound.bendToFrequency !== undefined) {
    return synthesizeSlide({ ...common, startFrequency: sound.frequency, endFrequency: sound.bendToFrequency });
  }
  if ((sound.technique === "hammer_on" || sound.technique === "pull_off") && sound.fromFrequency !== undefined) {
    // Pluck the previous fret, then hammer/pull to this one halfway through.
    return synthesizePitchChange({
      ...common,
      startFrequency: sound.fromFrequency,
      endFrequency: sound.frequency,
      changeAtFraction: 0.5,
      changeOverFraction: 0,
      reexcite: sound.technique === "pull_off" ? 0.5 : 0.3,
    });
  }
  return synthesizePluck({ ...common, frequency: sound.frequency });
}

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
  /**
   * When set, playback restarts the same (looped) region on completion
   * instead of stopping -- used by the section loop/repeat feature.
   */
  private loopOptions: {
    notes: NoteOut[];
    tuning: TuningOut;
    tempoBpm: number;
    transposeSemitones: number;
    capoFret: number;
    clawhammerTiming: boolean;
    startPosition: number;
    endPosition: number;
  } | null = null;

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
    options: {
      capoFret?: number;
      clawhammerTiming?: boolean;
      loop?: { startPosition: number; endPosition: number };
    } = {},
  ): void {
    this.stop();
    const ctx = this.ensureContext();
    const capoFret = options.capoFret ?? 0;
    const clawhammerTiming = options.clawhammerTiming ?? false;
    let scheduleNotes = notes;
    if (options.loop) {
      const { startPosition, endPosition } = options.loop;
      scheduleNotes = notes.filter((n) => n.position >= startPosition && n.position <= endPosition);
    }
    this.schedule = computePlaybackSchedule(
      scheduleNotes,
      tuning,
      tempoBpm,
      transposeSemitones,
      capoFret,
      clawhammerTiming,
    );
    this.durationSeconds = totalDurationSeconds(scheduleNotes, tempoBpm);
    this.loopOptions = options.loop
      ? { notes, tuning, tempoBpm, transposeSemitones, capoFret, clawhammerTiming, ...options.loop }
      : null;
    this.startedAtContextTime = ctx.currentTime + 0.05;
    this.playing = true;

    for (const note of this.schedule) {
      const noteDurationSeconds = Math.max(0.05, note.durationSeconds);
      for (const sound of note.sounds) {
        const rawSamples = synthesizeSound(sound, ctx.sampleRate, noteDurationSeconds);
        const samples = applyFadeEnvelope(rawSamples);
        const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        // A hammer-on/pull-off with nothing to hammer/pull from is played
        // legato only (fretting hand, no pick attack), so it's softer.
        const legatoOnly =
          (sound.technique === "hammer_on" || sound.technique === "pull_off") && sound.fromFrequency === undefined;
        gain.gain.value = legatoOnly ? 0.35 : 0.6;
        source.connect(gain).connect(ctx.destination);
        source.start(this.startedAtContextTime + note.startTimeSeconds);
        this.sources.push(source);
      }
    }

    this.tick();

    const totalMs = this.durationSeconds * 1000 + 200;
    window.setTimeout(() => {
      if (!this.playing) return;
      if (this.loopOptions) {
        // Restart the same looped region seamlessly rather than stopping.
        const { notes: loopNotes, tuning: loopTuning, tempoBpm: loopTempo, transposeSemitones: loopTranspose, capoFret: loopCapo, clawhammerTiming: loopClawhammer, startPosition, endPosition } =
          this.loopOptions;
        this.play(loopNotes, loopTuning, loopTempo, loopTranspose, {
          capoFret: loopCapo,
          clawhammerTiming: loopClawhammer,
          loop: { startPosition, endPosition },
        });
      } else {
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
