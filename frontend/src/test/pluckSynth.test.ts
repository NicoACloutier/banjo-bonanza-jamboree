import { describe, expect, it } from "vitest";
import { applyFadeEnvelope, synthesizePitchChange, synthesizePluck } from "../lib/pluckSynth";
import { detectPitch } from "../lib/pitchDetection";

describe("pluckSynth", () => {
  it("produces a buffer of the requested duration/sample rate", () => {
    const samples = synthesizePluck({ frequency: 220, sampleRate: 44100, durationSeconds: 0.5 });
    expect(samples.length).toBe(Math.floor(44100 * 0.5));
  });

  it("produces bounded amplitude output (no runaway feedback)", () => {
    const samples = synthesizePluck({ frequency: 110, sampleRate: 44100, durationSeconds: 1 });
    for (const sample of samples) {
      expect(Math.abs(sample)).toBeLessThanOrEqual(1.01);
    }
  });

  it("decays in energy over time (plucked string, not sustained tone)", () => {
    const samples = synthesizePluck({ frequency: 220, sampleRate: 44100, durationSeconds: 1, damping: 0.6 });
    const firstQuarterEnergy = energyOf(samples.slice(0, samples.length / 4));
    const lastQuarterEnergy = energyOf(samples.slice((3 * samples.length) / 4));
    expect(lastQuarterEnergy).toBeLessThan(firstQuarterEnergy);
  });

  it("rejects non-positive frequency or sample rate", () => {
    expect(() => synthesizePluck({ frequency: 0, sampleRate: 44100, durationSeconds: 1 })).toThrow();
    expect(() => synthesizePluck({ frequency: 220, sampleRate: 0, durationSeconds: 1 })).toThrow();
  });
});

describe("applyFadeEnvelope", () => {
  it("fades the first and last samples toward zero", () => {
    const flat = new Float32Array(100).fill(1);
    const faded = applyFadeEnvelope(flat, 10);
    expect(faded[0]).toBeCloseTo(0, 5);
    expect(faded[99]).toBeCloseTo(0, 5);
    expect(faded[50]).toBeCloseTo(1, 5);
  });
});

function energyOf(samples: Float32Array): number {
  let sum = 0;
  for (const s of samples) sum += s * s;
  return sum;
}

describe("synthesizePitchChange", () => {
  const sampleRate = 44100;
  const pitchAround = (samples: Float32Array, fraction: number) => {
    const start = Math.floor(samples.length * fraction);
    return detectPitch(samples.slice(start, start + 2048), sampleRate)!;
  };

  it("holds the starting pitch, then jumps to the ending pitch halfway (hammer-on)", () => {
    const samples = synthesizePitchChange({
      startFrequency: 196,
      endFrequency: 220,
      sampleRate,
      durationSeconds: 1,
      changeAtFraction: 0.5,
      changeOverFraction: 0,
      reexcite: 0.3,
    });
    expect(samples.length).toBe(sampleRate);
    expect(Math.abs(pitchAround(samples, 0.2) - 196)).toBeLessThan(3);
    expect(Math.abs(pitchAround(samples, 0.7) - 220)).toBeLessThan(3);
  });

  it("keeps output within [-1, 1] even with re-excitation", () => {
    const samples = synthesizePitchChange({
      startFrequency: 220,
      endFrequency: 196,
      sampleRate,
      durationSeconds: 0.5,
      changeAtFraction: 0.5,
      changeOverFraction: 0,
      reexcite: 1,
    });
    for (const sample of samples) expect(Math.abs(sample)).toBeLessThanOrEqual(1);
  });
});
