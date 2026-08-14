import { describe, expect, it } from "vitest";
import { applyFadeEnvelope, synthesizePluck } from "../lib/pluckSynth";

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
