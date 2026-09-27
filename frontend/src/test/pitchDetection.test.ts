import { describe, expect, it } from "vitest";
import { centsOff, detectPitch, findClosestTarget, OnsetDetector, PitchSmoother } from "../lib/pitchDetection";

function generateSineWave(frequency: number, sampleRate: number, seconds: number): Float32Array {
  const length = Math.floor(sampleRate * seconds);
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 0.8;
  }
  return buffer;
}

describe("detectPitch", () => {
  it("detects the frequency of a pure sine wave", () => {
    const sampleRate = 44100;
    const buffer = generateSineWave(220, sampleRate, 0.2);
    const detected = detectPitch(buffer, sampleRate);
    expect(detected).not.toBeNull();
    expect(Math.abs(detected! - 220)).toBeLessThan(2);
  });

  // A string-like tone: a fundamental plus overtones (1/k amplitudes, fixed
  // phases), decaying, as the live tuner sees it (a 2048-sample window).
  function stringTone(frequency: number, sampleRate: number): Float32Array {
    const buffer = new Float32Array(2048);
    for (let i = 0; i < buffer.length; i++) {
      const t = i / sampleRate;
      let sample = 0;
      for (let k = 1; k <= 8; k++) sample += Math.sin(2 * Math.PI * frequency * k * t + k) / k;
      buffer[i] = 0.3 * sample * Math.exp(-1.5 * t);
    }
    return buffer;
  }

  it("is accurate to within 3 cents on string-like tones across the banjo's range", () => {
    for (const sampleRate of [44100, 48000]) {
      for (let frequency = 130; frequency <= 600; frequency *= 1.037) {
        const detected = detectPitch(stringTone(frequency, sampleRate), sampleRate);
        expect(Math.abs(centsOff(detected!, frequency)), `${frequency.toFixed(1)} Hz @ ${sampleRate}`).toBeLessThan(3);
      }
    }
  });

  it("has no systematic sharp/flat bias", () => {
    let totalCents = 0;
    let count = 0;
    for (let frequency = 130; frequency <= 600; frequency *= 1.037) {
      totalCents += centsOff(detectPitch(stringTone(frequency, 48000), 48000)!, frequency);
      count++;
    }
    expect(Math.abs(totalCents / count)).toBeLessThan(0.5);
  });

  it("returns null for silence", () => {
    const buffer = new Float32Array(4096); // all zeros
    expect(detectPitch(buffer, 44100)).toBeNull();
  });
});

describe("findClosestTarget", () => {
  it("finds the nearest tuning target by pitch distance", () => {
    const targets = [
      { stringNumber: 1, label: "String 1", targetFrequency: 293.66 }, // D4
      { stringNumber: 2, label: "String 2", targetFrequency: 246.94 }, // B3
    ];
    const closest = findClosestTarget(295, targets);
    expect(closest.label).toBe("String 1");
  });
});

describe("centsOff", () => {
  it("returns 0 cents for an exact match", () => {
    expect(centsOff(440, 440)).toBeCloseTo(0, 5);
  });

  it("returns positive cents when sharp, negative when flat", () => {
    expect(centsOff(450, 440)).toBeGreaterThan(0);
    expect(centsOff(430, 440)).toBeLessThan(0);
  });
});

describe("PitchSmoother", () => {
  it("averages readings in cents over the window", () => {
    const smoother = new PitchSmoother();
    smoother.add(440, 0);
    // 440 and ~452.9 Hz are 0 and +50 cents from A4; the average is +25 cents.
    const smoothed = smoother.add(440 * Math.pow(2, 50 / 1200), 100);
    expect(centsOff(smoothed, 440)).toBeCloseTo(25, 5);
  });

  it("drops readings older than the window", () => {
    const smoother = new PitchSmoother(1000);
    smoother.add(440 * Math.pow(2, 40 / 1200), 0);
    const smoothed = smoother.add(440, 1500);
    expect(smoothed).toBeCloseTo(440, 5);
  });

  it("ignores a single stray reading far from the average", () => {
    const smoother = new PitchSmoother();
    smoother.add(440, 0);
    smoother.add(440, 16);
    const smoothed = smoother.add(600, 32);
    expect(smoothed).toBeCloseTo(440, 5);
  });

  it("folds overtone jumps back onto a ringing note", () => {
    // A D3 string 4 cents flat rings for a second, then the detector locks
    // onto its octave (and briefly the 3rd harmonic) as the note decays.
    const d3 = 146.83;
    const flat = d3 * Math.pow(2, -4 / 1200);
    const smoother = new PitchSmoother();
    let t = 0;
    for (; t < 1000; t += 16) smoother.add(flat, t);
    let smoothed = 0;
    for (; t < 2000; t += 16) smoothed = smoother.add(flat * 2, t);
    for (; t < 2200; t += 16) smoothed = smoother.add(flat * 3, t);
    expect(centsOff(smoothed, d3)).toBeCloseTo(-4, 5);
  });

  it("switches to a new note a few readings after a pluck", () => {
    const smoother = new PitchSmoother();
    for (let t = 0; t < 1000; t += 16) smoother.add(440, t);
    smoother.add(293.66, 1000, true);
    smoother.add(293.66, 1016);
    smoother.add(293.66, 1032);
    const smoothed = smoother.add(293.66, 1048);
    expect(smoothed).toBeCloseTo(293.66, 5);
  });

  it("switches to a new note without a pluck only once it holds steady", () => {
    const smoother = new PitchSmoother();
    for (let t = 0; t < 1000; t += 16) smoother.add(440, t);
    let smoothed = 0;
    let t = 1000;
    for (; t < 1300; t += 16) smoothed = smoother.add(293.66, t);
    expect(smoothed).toBeCloseTo(440, 5);
    for (; t < 1600; t += 16) smoothed = smoother.add(293.66, t);
    expect(smoothed).toBeCloseTo(293.66, 5);
  });

  it("starts fresh after reset", () => {
    const smoother = new PitchSmoother();
    smoother.add(440, 0);
    smoother.reset();
    expect(smoother.add(293.66, 16)).toBeCloseTo(293.66, 5);
  });
});

describe("OnsetDetector", () => {
  it("flags a sudden rise in level as a pluck", () => {
    const detector = new OnsetDetector();
    for (let i = 0; i < 6; i++) expect(detector.add(0.01)).toBe(false);
    expect(detector.add(0.2)).toBe(true);
  });

  it("does not flag a decaying note", () => {
    const detector = new OnsetDetector();
    detector.add(0.3);
    let level = 0.3;
    for (let i = 0; i < 60; i++) {
      level *= 0.95;
      expect(detector.add(level)).toBe(false);
    }
  });

  it("ignores rises that stay below the minimum level", () => {
    const detector = new OnsetDetector();
    detector.add(0.001);
    expect(detector.add(0.01)).toBe(false);
  });
});
