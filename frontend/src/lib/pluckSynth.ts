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
