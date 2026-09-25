import { describe, expect, it } from "vitest";
import { FALLBACK_TUNINGS, keyForTuning } from "../lib/tunings";

describe("keyForTuning", () => {
  it("returns the home key of an untransposed tuning", () => {
    expect(keyForTuning("standard_g")).toEqual({ tonic: "G", quality: "major" });
    expect(keyForTuning("sawmill")).toEqual({ tonic: "G", quality: "modal" });
  });

  it("reports minor tunings as minor", () => {
    expect(keyForTuning("g_minor")).toEqual({ tonic: "G", quality: "minor" });
    expect(keyForTuning("d_minor", 2)).toEqual({ tonic: "E", quality: "minor" });
  });

  it("has a key for every fallback tuning", () => {
    for (const tuning of FALLBACK_TUNINGS) {
      expect(keyForTuning(tuning.key), tuning.key).not.toBeNull();
    }
  });

  it("shifts the key when transposed", () => {
    expect(keyForTuning("standard_g", 2)?.tonic).toBe("A");
    expect(keyForTuning("double_c", 2)?.tonic).toBe("D");
    expect(keyForTuning("standard_g", 3)?.tonic).toBe("Bb");
  });

  it("wraps around the octave in both directions", () => {
    expect(keyForTuning("standard_g", 12)?.tonic).toBe("G");
    expect(keyForTuning("double_c", -1)?.tonic).toBe("B");
    expect(keyForTuning("open_d", -12)?.tonic).toBe("D");
  });

  it("returns null for an unknown tuning", () => {
    expect(keyForTuning("not_a_tuning")).toBeNull();
  });
});
