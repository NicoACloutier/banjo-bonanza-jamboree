import { describe, expect, it } from "vitest";
import { findChordShapes, parseChord } from "../lib/chords";
import { getFallbackTuning } from "../lib/tunings";

const openG = getFallbackTuning("standard_g").open_strings;

describe("parseChord", () => {
  it("parses roots, accidentals and qualities", () => {
    expect(parseChord("G")).toMatchObject({ name: "G", root: "G", pitchClasses: [7, 11, 2] });
    expect(parseChord("F#m")).toMatchObject({ name: "F#m", pitchClasses: [6, 9, 1] });
    expect(parseChord("Bbmaj7")).toMatchObject({ name: "Bbmaj7", pitchClasses: [10, 2, 5, 9] });
    expect(parseChord("D7")?.requiredPitchClasses).toEqual([2, 6, 0]);
  });

  it("accepts common alternative spellings and ignores a slash bass note", () => {
    expect(parseChord("Amin")?.name).toBe("Am");
    expect(parseChord("C-7")?.name).toBe("Cm7");
    expect(parseChord("E+")?.name).toBe("Eaug");
    expect(parseChord("Dsus")?.name).toBe("Dsus4");
    expect(parseChord("C/G")?.name).toBe("C");
  });

  it("rejects things that aren't chords", () => {
    for (const input of ["", "H", "g", "Gxyz", "G/Q"]) expect(parseChord(input)).toBeNull();
  });
});

describe("findChordShapes", () => {
  const shapes = (name: string, options = {}, tuning = openG) =>
    findChordShapes(parseChord(name)!, tuning, { limit: 10, ...options }).map((s) => s.frets.join(""));

  it("plays G open in open G tuning", () => {
    expect(shapes("G")[0]).toBe("0000");
  });

  it("finds the standard first-position shapes in open G", () => {
    expect(shapes("C")[0]).toBe("2102"); // strings 1-4: E C G E
    expect(shapes("D")).toContain("4320"); // F# D A D
    expect(shapes("D7")).toContain("0124"); // D C A F#
    expect(shapes("Em")[0]).toBe("2002"); // E B G E
  });

  it("only returns shapes containing the chord's defining notes and within the span", () => {
    for (const name of ["C", "D7", "Am", "F", "Bbmaj7"]) {
      for (const shape of findChordShapes(parseChord(name)!, openG, { limit: 10 })) {
        const fretted = shape.frets.filter((f) => f > 0);
        if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
      }
    }
  });

  it("works in other tunings and with a capo (frets relative to the capo)", () => {
    const doubleC = getFallbackTuning("double_c").open_strings;
    expect(shapes("C", {}, doubleC)[0]).toBe("2000"); // gCGCD: 1st string D -> E
    // Open G capoed at 2 sounds as open A: an A chord is all open strings.
    expect(shapes("A", { capoFret: 2 })[0]).toBe("0000");
  });

  it("reports whether the open 5th string belongs to the chord", () => {
    expect(findChordShapes(parseChord("G")!, openG)[0].fifthStringFits).toBe(true);
    expect(findChordShapes(parseChord("D")!, openG)[0].fifthStringFits).toBe(false);
    // Spiking the 5th string up to A makes it fit a D chord.
    expect(findChordShapes(parseChord("D")!, openG, { fifthStringRaise: 2 })[0].fifthStringFits).toBe(true);
  });
});
