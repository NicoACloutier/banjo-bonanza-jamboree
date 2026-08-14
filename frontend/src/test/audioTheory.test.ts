import { describe, expect, it } from "vitest";
import { frequencyToNearestNote, frettedFrequency, noteNameToFrequency, noteNameToSemitoneOffset } from "../lib/audioTheory";

describe("audioTheory", () => {
  it("computes semitone offsets relative to A4", () => {
    expect(noteNameToSemitoneOffset("A4")).toBe(0);
    expect(noteNameToSemitoneOffset("C4")).toBe(-9);
    expect(noteNameToSemitoneOffset("A5")).toBe(12);
  });

  it("computes A4 as 440Hz", () => {
    expect(noteNameToFrequency("A4")).toBeCloseTo(440, 5);
  });

  it("computes standard G banjo open strings correctly", () => {
    // Standard G tuning: string 1 = D4
    expect(noteNameToFrequency("D4")).toBeCloseTo(293.6648, 2);
  });

  it("transposes up an octave (12 semitones) doubles frequency", () => {
    const base = noteNameToFrequency("D3");
    const transposed = noteNameToFrequency("D3", 12);
    expect(transposed).toBeCloseTo(base * 2, 3);
  });

  it("computes fretted frequency for a given open string and fret", () => {
    const open = noteNameToFrequency("G3");
    const fretted2 = frettedFrequency("G3", 2);
    // 2 semitones up = multiply by 2^(2/12)
    expect(fretted2).toBeCloseTo(open * Math.pow(2, 2 / 12), 3);
  });

  it("round-trips frequency back to the nearest note name", () => {
    const result = frequencyToNearestNote(440);
    expect(result).toEqual({ name: "A", octave: 4, cents: 0 });
  });

  it("throws on invalid note names", () => {
    expect(() => noteNameToSemitoneOffset("H4")).toThrow();
    expect(() => noteNameToSemitoneOffset("garbage")).toThrow();
  });
});
