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
    let i = correlations.findIndex((c) => c >= threshold);
    // That first lag over the threshold is on the rising slope of its peak;
    // climb to the top, or the interpolation below lands off the peak and
    // every reading comes out biased (~20 cents flat on string-like tones).
    while (i + 1 < correlations.length && correlations[i + 1] > correlations[i]) i++;
    bestLag = minLag + i;
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

/** Root-mean-square level of a block of samples (0 = silence). */
export function rmsLevel(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}

/**
 * Detects note onsets (a string being plucked) from a sudden rise in level
 * compared with the last few frames. A decaying note only ever gets quieter,
 * so this tells a fresh pluck apart from a ringing note.
 */
export class OnsetDetector {
  private recentLevels: number[] = [];
  private readonly historyFrames: number;
  private readonly riseRatio: number;
  private readonly minLevel: number;

  constructor(historyFrames = 6, riseRatio = 1.8, minLevel = 0.02) {
    this.historyFrames = historyFrames;
    this.riseRatio = riseRatio;
    this.minLevel = minLevel;
  }

  /** Feed one frame's RMS level; returns true if it looks like a new pluck. */
  add(level: number): boolean {
    const history = this.recentLevels;
    const baseline = history.length > 0 ? history.reduce((sum, l) => sum + l, 0) / history.length : 0;
    history.push(level);
    if (history.length > this.historyFrames) history.shift();
    return level >= this.minLevel && level > baseline * this.riseRatio;
  }

  reset(): void {
    this.recentLevels = [];
  }
}

// Overtones a reading can jump to while the same note is still ringing, in
// cents above the fundamental: 2x, 3x and 4x the frequency, and an octave below.
const HARMONIC_OFFSETS_CENTS = [1200, 1200 * Math.log2(3), 2400, -1200];

/**
 * Averages detected pitches over a sliding time window so the tuner reading
 * is steady instead of flickering frame to frame.
 *
 * Averaging is done in cents (log scale). Readings far from the current
 * average are handled as follows:
 * - Overtone jumps (the detector briefly locking onto 2x/3x/4x of the note,
 *   common as a plucked string decays) are folded back onto the note.
 * - Shortly after a pluck (`onset`), a consistent new pitch quickly replaces
 *   the old one (a different string was plucked).
 * - Otherwise a new pitch must hold steady for `sustainedJumpMs` before it
 *   replaces the old one, so stray readings are ignored.
 */
export class PitchSmoother {
  private samples: { timeMs: number; cents: number }[] = [];
  private pendingJumps: { timeMs: number; cents: number }[] = [];
  private lastOnsetMs = -Infinity;
  private readonly windowMs: number;
  private readonly newNoteThresholdCents: number;
  private readonly onsetJumpReadings: number;
  private readonly onsetWindowMs: number;
  private readonly sustainedJumpMs: number;

  constructor(
    windowMs = 2500,
    newNoteThresholdCents = 100,
    onsetJumpReadings = 4,
    onsetWindowMs = 300,
    sustainedJumpMs = 500,
  ) {
    this.windowMs = windowMs;
    this.newNoteThresholdCents = newNoteThresholdCents;
    this.onsetJumpReadings = onsetJumpReadings;
    this.onsetWindowMs = onsetWindowMs;
    this.sustainedJumpMs = sustainedJumpMs;
  }

  /**
   * Add a detected frequency at `timeMs` and return the smoothed frequency.
   * Pass `onset` when a new pluck was detected on this frame.
   */
  add(frequency: number, timeMs: number, onset = false): number {
    if (onset) this.lastOnsetMs = timeMs;
    const cents = 1200 * Math.log2(frequency / 440);
    this.samples = this.samples.filter((s) => timeMs - s.timeMs <= this.windowMs);

    const average = this.averageCents();
    if (average === null || Math.abs(cents - average) <= this.newNoteThresholdCents) {
      this.pendingJumps = [];
      this.samples.push({ timeMs, cents });
    } else if (timeMs - this.lastOnsetMs <= this.onsetWindowMs) {
      // Just plucked: a new note is likely, so switch after a few consistent readings.
      this.addPendingJump(timeMs, cents);
      if (this.pendingJumps.length >= this.onsetJumpReadings) this.acceptPendingJump();
    } else {
      const harmonic = HARMONIC_OFFSETS_CENTS.find(
        (offset) => Math.abs(cents - offset - average) <= this.newNoteThresholdCents / 2,
      );
      if (harmonic !== undefined) {
        // Same note, detector locked onto an overtone: fold it back.
        this.pendingJumps = [];
        this.samples.push({ timeMs, cents: cents - harmonic });
      } else {
        this.addPendingJump(timeMs, cents);
        const pending = this.pendingJumps;
        if (pending.length > 1 && pending[pending.length - 1].timeMs - pending[0].timeMs >= this.sustainedJumpMs) {
          this.acceptPendingJump();
        }
      }
    }

    return 440 * Math.pow(2, this.averageCents()! / 1200);
  }

  reset(): void {
    this.samples = [];
    this.pendingJumps = [];
    this.lastOnsetMs = -Infinity;
  }

  /** Track a candidate new note; restart the candidate if readings disagree. */
  private addPendingJump(timeMs: number, cents: number): void {
    const first = this.pendingJumps[0];
    if (first && Math.abs(cents - first.cents) > this.newNoteThresholdCents) this.pendingJumps = [];
    this.pendingJumps.push({ timeMs, cents });
  }

  private acceptPendingJump(): void {
    this.samples = this.pendingJumps;
    this.pendingJumps = [];
  }

  private averageCents(): number | null {
    if (this.samples.length === 0) return null;
    return this.samples.reduce((sum, s) => sum + s.cents, 0) / this.samples.length;
  }
}
