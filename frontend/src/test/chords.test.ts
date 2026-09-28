import { describe, expect, it } from "vitest";
import { chordsInKey, findChordShapes, keyName, MAJOR_KEYS, MINOR_KEYS, parseChord, scaleForKey } from "../lib/chords";
import { buildPattern, PATTERNS } from "../lib/patterns";
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

describe("buildPattern", () => {
  const tuning = getFallbackTuning("standard_g");

  it("builds a bar of eighth-note rolls over the chord's shape, with finger marks", () => {
    const { notes, needsClawhammer } = buildPattern("alternating_thumb", "C", tuning);
    expect(needsClawhammer).toBe(false);
    expect(notes).toHaveLength(8);
    expect(notes.every((n) => n.duration_beats === 0.5)).toBe(true);
    expect(notes.map((n) => `${n.frets[0].string_number}:${n.frets[0].fret}`)).toEqual([
      "3:0", "2:1", "5:0", "1:2", "4:2", "2:1", "5:0", "1:2",
    ]);
    expect(notes.map((n) => n.frets[0].right_hand_finger?.[0].toUpperCase()).join("")).toBe("TITMTITM");
    expect(notes[0].chord).toBe("C");
    expect(notes.slice(1).every((n) => n.chord === null)).toBe(true);
  });

  it("builds clawhammer bum-ditty: melody notes and brushes with thumb plucks", () => {
    const { notes, needsClawhammer } = buildPattern("bum_ditty", "G", tuning);
    expect(needsClawhammer).toBe(true);
    expect(notes.map((n) => [n.frets.map((f) => f.string_number), n.thumb_after])).toEqual([
      [[3], false],
      [[1, 2, 3], true],
      [[4], false],
      [[1, 2, 3], true],
    ]);
  });

  it("every pattern builds for a common chord", () => {
    for (const pattern of PATTERNS) expect(buildPattern(pattern.id, "D", tuning).notes.length).toBeGreaterThan(0);
  });

  it("explains unknown chords", () => {
    expect(() => buildPattern("forward", "Hm", tuning)).toThrow(/isn't a chord name/);
  });
});

describe("chordsInKey", () => {
  it("lists a major key's common chords: I ii iii IV V V7 vi", () => {
    expect(chordsInKey("G")).toEqual(["G", "Am", "Bm", "C", "D", "D7", "Em"]);
  });

  it("lists a minor key's common chords: i III iv v V7 VI VII", () => {
    expect(chordsInKey("Am")).toEqual(["Am", "C", "Dm", "Em", "E7", "F", "G"]);
    expect(chordsInKey("Em")).toEqual(["Em", "G", "Am", "Bm", "B7", "C", "D"]);
  });

  it("spells sharp keys with sharps and flat keys with flats", () => {
    expect(chordsInKey("E")).toEqual(["E", "F#m", "G#m", "A", "B", "B7", "C#m"]);
    expect(chordsInKey("F#m")).toEqual(["F#m", "A", "Bm", "C#m", "C#7", "D", "E"]);
    expect(chordsInKey("Bb")).toEqual(["Bb", "Cm", "Dm", "Eb", "F", "F7", "Gm"]);
    expect(chordsInKey("Gm")).toEqual(["Gm", "Bb", "Cm", "Dm", "D7", "Eb", "F"]);
  });

  it("gives every listed key seven chords the chord finder understands", () => {
    for (const key of [...MAJOR_KEYS, ...MINOR_KEYS]) {
      const chords = chordsInKey(key);
      expect(chords, key).toHaveLength(7);
      for (const chord of chords) expect(parseChord(chord), `${key}: ${chord}`).not.toBeNull();
    }
  });

  it("names keys by pitch, whichever way the tonic is spelled", () => {
    expect(keyName("Db", true)).toBe("C#m");
    expect(keyName("A#", false)).toBe("Bb");
    expect(keyName("G", true)).toBe("Gm");
    expect(keyName("H", false)).toBeNull();
  });
});

describe("scaleForKey", () => {
  it("gives a major key's scale in degree order", () => {
    expect(scaleForKey("G")).toEqual([7, 9, 11, 0, 2, 4, 6]); // G A B C D E F#
  });

  it("gives a minor key's natural minor scale", () => {
    expect(scaleForKey("Am")).toEqual([9, 11, 0, 2, 4, 5, 7]); // A B C D E F G
  });
});
