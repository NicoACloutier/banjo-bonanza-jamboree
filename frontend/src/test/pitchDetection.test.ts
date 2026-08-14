import { describe, expect, it } from "vitest";
import { centsOff, detectPitch, findClosestTarget } from "../lib/pitchDetection";

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
