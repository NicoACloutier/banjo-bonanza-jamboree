/**
 * Plays plucked reference notes (e.g. the open strings of the selected
 * tuning) so users can tune by ear, using the same Karplus-Strong synth as
 * tab playback.
 */
import { applyFadeEnvelope, synthesizePluck } from "./pluckSynth";

let audioContext: AudioContext | null = null;

function ensureContext(): AudioContext {
  if (!audioContext) {
    const AudioCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioContext = new AudioCtor();
  }
  return audioContext;
}

function schedulePluck(ctx: AudioContext, frequency: number, startTime: number, durationSeconds: number, volume: number): void {
  // Low damping so the note rings long enough to tune against.
  const samples = applyFadeEnvelope(
    synthesizePluck({ frequency, sampleRate: ctx.sampleRate, durationSeconds, damping: 0.1 }),
  );
  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0);

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start(startTime);
}

export function playReferenceNote(frequency: number, durationSeconds = 2.5): void {
  const ctx = ensureContext();
  schedulePluck(ctx, frequency, ctx.currentTime, durationSeconds, 0.6);
}

/**
 * Simulate a strum: pluck each frequency in order, staggered slightly, so the
 * strings ring together. Pass frequencies in strum order (e.g. string 5 down
 * to string 1 for a downstroke).
 */
export function playStrum(frequencies: number[], staggerSeconds = 0.035, durationSeconds = 3): void {
  const ctx = ensureContext();
  const start = ctx.currentTime + 0.02;
  // Quieter per string so the summed strum doesn't clip.
  frequencies.forEach((frequency, i) => {
    schedulePluck(ctx, frequency, start + i * staggerSeconds, durationSeconds, 0.3);
  });
}

/** How long the "in tune" chime lasts, in seconds. */
export const TUNED_CHIME_SECONDS = 0.6;

/** A short, soft two-note bell (a rising fifth) to celebrate a string in tune. */
export function playTunedChime(): void {
  const ctx = ensureContext();
  const start = ctx.currentTime + 0.01;
  [
    { frequency: 880, offset: 0 }, // A5
    { frequency: 1318.51, offset: 0.1 }, // E6
  ].forEach(({ frequency, offset }) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    const noteStart = start + offset;
    const noteEnd = start + TUNED_CHIME_SECONDS;
    // Quick attack, then a bell-like exponential decay.
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
    osc.connect(gain).connect(ctx.destination);
    osc.start(noteStart);
    osc.stop(noteEnd);
  });
}
