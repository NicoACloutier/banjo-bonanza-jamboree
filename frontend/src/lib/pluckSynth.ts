/**
 * Karplus-Strong plucked-string synthesis.
 *
 * This produces a simple but convincingly "twangy" banjo-like timbre: white
 * noise seeded into a delay line of length (sampleRate / frequency), which
 * is then repeatedly averaged and fed back on itself, causing higher
 * frequencies to decay faster than the fundamental -- the same principle
 * physical plucked strings exhibit.
 *
 * This is a pure function over numbers/arrays (no Web Audio API calls), so
 * it can be unit-tested directly in Node/vitest without needing a browser
 * AudioContext.
 */

export interface PluckOptions {
  frequency: number;
  sampleRate: number;
  durationSeconds: number;
  /** 0-1, how quickly the string decays. Higher = quicker decay (more muted/damped). */
  damping?: number;
}

export function synthesizePluck(options: PluckOptions): Float32Array {
  const { frequency, sampleRate, durationSeconds } = options;
  const damping = options.damping ?? 0.5;
  if (frequency <= 0) throw new Error("frequency must be positive");
  if (sampleRate <= 0) throw new Error("sampleRate must be positive");

  const totalSamples = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const delayLineLength = Math.max(2, Math.round(sampleRate / frequency));

  // Seed the delay line with white noise (the "pluck" excitation).
  const delayLine = new Float32Array(delayLineLength);
  for (let i = 0; i < delayLineLength; i++) {
    delayLine[i] = Math.random() * 2 - 1;
  }

  const output = new Float32Array(totalSamples);
  const decayFactor = 1 - damping * 0.02; // keeps damping in a musically useful range

  let readIndex = 0;
  for (let i = 0; i < totalSamples; i++) {
    const current = delayLine[readIndex];
    const next = delayLine[(readIndex + 1) % delayLineLength];
    // Low-pass filter + decay: average adjacent samples and attenuate slightly.
    const averaged = 0.5 * (current + next) * decayFactor;
    delayLine[readIndex] = averaged;
    output[i] = current;
    readIndex = (readIndex + 1) % delayLineLength;
  }

  return output;
}

/** Apply a short linear fade-in/out to avoid audible clicks at buffer edges. */
export function applyFadeEnvelope(samples: Float32Array, fadeSamples = 32): Float32Array {
  const result = Float32Array.from(samples);
  const n = Math.min(fadeSamples, Math.floor(result.length / 2));
  for (let i = 0; i < n; i++) {
    const gain = i / n;
    result[i] *= gain;
    result[result.length - 1 - i] *= gain;
  }
  return result;
}

export interface PitchChangeOptions {
  /** Frequency (Hz) the note is plucked at. */
  startFrequency: number;
  /** Frequency (Hz) the pitch ends up at. */
  endFrequency: number;
  sampleRate: number;
  durationSeconds: number;
  damping?: number;
  /** When the pitch starts to change, as a fraction of the duration (0 = immediately). */
  changeAtFraction?: number;
  /** How long the change takes, as a fraction of the duration (0 = instant, as in a hammer-on). */
  changeOverFraction?: number;
  /**
   * Extra energy (0-1) put into the string when the change starts: a
   * hammer-on's fretting finger striking the string, or a pull-off's finger
   * plucking it as it leaves. 0 for a slide (no new attack).
   */
  reexcite?: number;
}

/**
 * Synthesize a single pluck whose pitch changes partway through, without a
 * second pick attack: slides, hammer-ons, pull-offs and bends.
 *
 * Implemented as a Karplus-Strong delay line (like `synthesizePluck`) whose
 * effective length follows the pitch sample-by-sample, which re-tunes the
 * resonant pitch while reusing the same excitation/feedback loop (so the
 * sound stays connected, as on a real string, rather than sounding like two
 * separate notes).
 */
export function synthesizePitchChange(options: PitchChangeOptions): Float32Array {
  const { startFrequency, endFrequency, sampleRate, durationSeconds } = options;
  const damping = options.damping ?? 0.4;
  const changeAt = options.changeAtFraction ?? 0;
  const changeOver = options.changeOverFraction ?? 1;
  const reexcite = options.reexcite ?? 0;
  if (startFrequency <= 0 || endFrequency <= 0) throw new Error("frequencies must be positive");
  if (sampleRate <= 0) throw new Error("sampleRate must be positive");

  const totalSamples = Math.max(1, Math.floor(sampleRate * durationSeconds));
  // Use a delay line long enough for the lower of the two frequencies (longer period).
  const maxDelayLength = Math.max(2, Math.round(sampleRate / Math.min(startFrequency, endFrequency)));

  const delayLine = new Float32Array(maxDelayLength);
  for (let i = 0; i < maxDelayLength; i++) {
    delayLine[i] = Math.random() * 2 - 1;
  }

  const output = new Float32Array(totalSamples);
  const decayFactor = 1 - damping * 0.02;
  let reexcited = reexcite === 0;

  let readIndex = 0;
  for (let i = 0; i < totalSamples; i++) {
    const t = totalSamples <= 1 ? 1 : i / (totalSamples - 1);
    if (!reexcited && t >= changeAt) {
      for (let j = 0; j < maxDelayLength; j++) delayLine[j] += (Math.random() * 2 - 1) * reexcite;
      reexcited = true;
    }
    const progress = changeOver <= 0 ? (t >= changeAt ? 1 : 0) : Math.min(1, Math.max(0, (t - changeAt) / changeOver));
    const currentFrequency = startFrequency + (endFrequency - startFrequency) * progress;
    const effectiveLength = Math.max(2, Math.min(maxDelayLength, Math.round(sampleRate / currentFrequency)));

    const current = delayLine[readIndex % effectiveLength];
    const next = delayLine[(readIndex + 1) % effectiveLength];
    const averaged = 0.5 * (current + next) * decayFactor;
    delayLine[readIndex % effectiveLength] = averaged;
    output[i] = current;
    readIndex = (readIndex + 1) % effectiveLength;
  }

  // Re-excitation can push the peak above 1; scale back into range.
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) peak = Math.max(peak, Math.abs(output[i]));
  if (peak > 1) for (let i = 0; i < totalSamples; i++) output[i] /= peak;

  return output;
}

export interface SlideOptions {
  /** Frequency (Hz) at the start of the slide (the fretted note played). */
  startFrequency: number;
  /** Frequency (Hz) the pitch glides to by the end of the note's duration. */
  endFrequency: number;
  sampleRate: number;
  durationSeconds: number;
  damping?: number;
}

/** A pitch glide spanning the whole note (used for bends). */
export function synthesizeSlide(options: SlideOptions): Float32Array {
  return synthesizePitchChange({ ...options, changeAtFraction: 0, changeOverFraction: 1 });
}
