/**
 * Autocorrelation-based pitch detection (a standard, simple, and fairly
 * robust technique for monophonic instrument tuning). Pure function over a
 * Float32Array of PCM samples, so it's directly unit-testable with
 * synthetic sine waves -- no microphone/AudioContext required in tests.
 */

/** Returns the detected fundamental frequency in Hz, or null if no clear pitch was found. */
export function detectPitch(buffer: Float32Array, sampleRate: number): number | null {
  const size = buffer.length;

  // Compute RMS to bail out on silence and to normalize.
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.01) return null;

  const minFrequency = 50; // banjo strings won't reasonably sound below this
  const maxFrequency = 1200;
  const maxLag = Math.floor(sampleRate / minFrequency);
  const minLag = Math.floor(sampleRate / maxFrequency);

  let bestLag = -1;
  let bestCorrelation = 0;
  const correlations: number[] = [];

  for (let lag = minLag; lag <= maxLag && lag < size; lag++) {
    let correlation = 0;
    for (let i = 0; i < size - lag; i++) {
      correlation += buffer[i] * buffer[i + lag];
    }
    correlation /= size - lag;
    correlations.push(correlation);
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  // Prefer the *smallest* lag whose correlation is nearly as strong as the
  // global best. Pure/near-pure tones correlate almost equally well at
  // integer multiples of the true period (octave-below false positives),
  // so without this bias we'd tend to lock onto a sub-harmonic.
  if (bestLag > 0) {
    const threshold = bestCorrelation * 0.9;
    for (let i = 0; i < correlations.length; i++) {
      if (correlations[i] >= threshold) {
        bestLag = minLag + i;
        break;
      }
    }
  }

  if (bestLag <= 0) return null;

  // Parabolic interpolation around the best lag for sub-sample precision.
  const s0 = autocorrelationAt(buffer, bestLag - 1);
  const s1 = autocorrelationAt(buffer, bestLag);
  const s2 = autocorrelationAt(buffer, bestLag + 1);
  const denom = s0 - 2 * s1 + s2;
  const shift = denom !== 0 ? (0.5 * (s0 - s2)) / denom : 0;
  const refinedLag = bestLag + shift;

  return sampleRate / refinedLag;
}

function autocorrelationAt(buffer: Float32Array, lag: number): number {
  if (lag < 0 || lag >= buffer.length) return 0;
  let sum = 0;
  for (let i = 0; i < buffer.length - lag; i++) {
    sum += buffer[i] * buffer[i + lag];
  }
  return sum / (buffer.length - lag);
}

export interface TunerTarget {
  stringNumber: number;
  label: string;
  targetFrequency: number;
}

/** Find the closest tuning target (string) to a detected frequency. */
export function findClosestTarget(frequency: number, targets: TunerTarget[]): TunerTarget {
  let closest = targets[0];
  let smallestDistance = Infinity;
  for (const target of targets) {
    // Compare in cents (log scale) so the "closeness" matches human pitch perception.
    const cents = Math.abs(1200 * Math.log2(frequency / target.targetFrequency));
    if (cents < smallestDistance) {
      smallestDistance = cents;
      closest = target;
    }
  }
  return closest;
}

/** Signed cents deviation of `frequency` from `targetFrequency` (positive = sharp). */
export function centsOff(frequency: number, targetFrequency: number): number {
  return 1200 * Math.log2(frequency / targetFrequency);
}
