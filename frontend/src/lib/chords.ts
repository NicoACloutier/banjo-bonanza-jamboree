/**
 * Chord names and banjo chord shapes.
 *
 * Shapes are computed from the tuning rather than looked up, so they work
 * for every tuning (and capo): each of strings 1-4 is fretted at a chord
 * tone, the shape must contain the chord's defining notes, and it must fit
 * under the hand (a small fret span). The short 5th string is a drone, so a
 * shape only notes whether it can ring open with the chord.
 */
import { noteNameToSemitoneOffset } from "./audioTheory";

const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6,
  G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

interface Quality {
  /** Semitones above the root. */
  intervals: number[];
  /** Intervals a shape must include (the fifth, and the root of a 9th's extensions, can be dropped). */
  required: number[];
}

// Keyed by the canonical suffix; ALIASES maps other spellings onto these.
const QUALITIES: Record<string, Quality> = {
  "": { intervals: [0, 4, 7], required: [0, 4] },
  m: { intervals: [0, 3, 7], required: [0, 3] },
  "7": { intervals: [0, 4, 7, 10], required: [0, 4, 10] },
  m7: { intervals: [0, 3, 7, 10], required: [0, 3, 10] },
  maj7: { intervals: [0, 4, 7, 11], required: [0, 4, 11] },
  "6": { intervals: [0, 4, 7, 9], required: [0, 4, 9] },
  m6: { intervals: [0, 3, 7, 9], required: [0, 3, 9] },
  "9": { intervals: [0, 4, 7, 10, 2], required: [4, 10, 2] },
  dim: { intervals: [0, 3, 6], required: [0, 3, 6] },
  dim7: { intervals: [0, 3, 6, 9], required: [0, 3, 6, 9] },
  aug: { intervals: [0, 4, 8], required: [0, 4, 8] },
  sus2: { intervals: [0, 2, 7], required: [0, 2] },
  sus4: { intervals: [0, 5, 7], required: [0, 5] },
};

const ALIASES: Record<string, string> = {
  maj: "", M: "", min: "m", "-": "m", mi: "m", M7: "maj7", "Δ7": "maj7", min7: "m7", "-7": "m7",
  "+": "aug", "°": "dim", o: "dim", "°7": "dim7", o7: "dim7", sus: "sus4",
};

/** The chord qualities the finder understands, for suggestions in the UI. */
export const CHORD_SUFFIXES = Object.keys(QUALITIES);

export interface ParsedChord {
  /** The chord as written, normalised (e.g. "Bbmaj7"). */
  name: string;
  root: string;
  rootPitchClass: number;
  suffix: string;
  pitchClasses: number[];
  requiredPitchClasses: number[];
}

/**
 * Parse a chord name like "G", "D7", "F#m", "Bbmaj7" or "C/G" (the bass note
 * after a slash is ignored). Returns null if it isn't a chord we understand.
 */
export function parseChord(input: string): ParsedChord | null {
  const match = /^([A-G])([#b]?)([^/]*)(?:\/[A-G][#b]?)?$/.exec(input.trim());
  if (!match) return null;
  const root = match[1] + match[2];
  const rawSuffix = match[3];
  const suffix = rawSuffix in QUALITIES ? rawSuffix : ALIASES[rawSuffix];
  if (suffix === undefined) return null;
  const rootPitchClass = PITCH_CLASS[root];
  const quality = QUALITIES[suffix];
  const toPitchClass = (interval: number) => (rootPitchClass + interval) % 12;
  return {
    name: root + suffix,
    root,
    rootPitchClass,
    suffix,
    pitchClasses: quality.intervals.map(toPitchClass),
    requiredPitchClasses: quality.required.map(toPitchClass),
  };
}

export interface ChordShape {
  /** Frets for strings 1-4 (index 0 = string 1), relative to the capo; 0 = open. */
  frets: [number, number, number, number];
  /** Whether the open 5th string (with its capo) is a chord tone, so it can ring with the shape. */
  fifthStringFits: boolean;
}

export interface ShapeOptions {
  /** Main capo fret; frets in the result are relative to it. */
  capoFret?: number;
  /** How far the 5th string is raised (its own capo/spike, or the main capo). */
  fifthStringRaise?: number;
  /** Highest fret to consider. */
  maxFret?: number;
  /** Largest allowed distance between the lowest and highest fretted notes. */
  maxSpan?: number;
  limit?: number;
}

/** Pitch class (C = 0) of a note like "D4", raised `semitonesUp`. */
export function pitchClassOf(note: string, semitonesUp = 0): number {
  // noteNameToSemitoneOffset is relative to A4 (A = 9 in C-based pitch classes).
  return (((noteNameToSemitoneOffset(note) + 9 + semitonesUp) % 12) + 12) % 12;
}

/**
 * Playable shapes for `chord` in a tuning (open strings 1-5, as in
 * `TuningOut.open_strings`), easiest first: lower on the neck, with a
 * smaller stretch and fewer fretted strings.
 */
export function findChordShapes(
  chord: ParsedChord,
  openStrings: readonly string[],
  options: ShapeOptions = {},
): ChordShape[] {
  const { capoFret = 0, fifthStringRaise = capoFret, maxFret = 12, maxSpan = 3, limit = 4 } = options;
  const chordTones = new Set(chord.pitchClasses);
  const openPitchClasses = openStrings.slice(0, 4).map((note) => pitchClassOf(note, capoFret));

  // The frets on each of strings 1-4 that sound a chord tone.
  const candidates = openPitchClasses.map((open) => {
    const frets: number[] = [];
    for (let fret = 0; fret <= maxFret; fret++) if (chordTones.has((open + fret) % 12)) frets.push(fret);
    return frets;
  });

  const scored: { frets: [number, number, number, number]; score: number }[] = [];
  const visit = (stringIndex: number, chosen: number[]) => {
    if (stringIndex === 4) {
      const fretted = chosen.filter((f) => f > 0);
      const low = fretted.length ? Math.min(...fretted) : 0;
      const high = fretted.length ? Math.max(...fretted) : 0;
      if (high - low > maxSpan) return;
      const sounding = new Set(chosen.map((fret, i) => (openPitchClasses[i] + fret) % 12));
      if (!chord.requiredPitchClasses.every((pc) => sounding.has(pc))) return;
      // Lower positions first, then smaller stretches, then fewer fretted strings.
      scored.push({ frets: chosen as [number, number, number, number], score: low * 4 + (high - low) * 2 + fretted.length });
      return;
    }
    for (const fret of candidates[stringIndex]) visit(stringIndex + 1, [...chosen, fret]);
  };
  visit(0, []);

  const fifthStringFits = chordTones.has(pitchClassOf(openStrings[4], fifthStringRaise));
  return scored
    .sort((a, b) => a.score - b.score || a.frets.join(",").localeCompare(b.frets.join(",")))
    .slice(0, limit)
    .map(({ frets }) => ({ frets, fifthStringFits }));
}

/** Keys for the "chords in a key" chart, spelled as musicians usually write them. */
export const MAJOR_KEYS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
export const MINOR_KEYS = ["Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "Bbm", "Bm"];

// Keys whose chords are spelled with flats; every other key uses sharps.
const FLAT_KEYS = new Set(["F", "Bb", "Eb", "Ab", "Db", "Dm", "Gm", "Cm", "Fm", "Bbm", "Ebm"]);
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** The chart's name for a key, e.g. ("Db", minor) -> "C#m"; null if the tonic isn't a note name. */
export function keyName(tonic: string, minor: boolean): string | null {
  const pitchClass = PITCH_CLASS[tonic];
  if (pitchClass === undefined) return null;
  return (minor ? MINOR_KEYS : MAJOR_KEYS)[pitchClass];
}

/**
 * The common chords of a key from MAJOR_KEYS or MINOR_KEYS. Major:
 * I, ii, iii, IV, V, V7, vi. Minor: i, III, iv, v, V7 (the major V7 that
 * leads back home), VI, VII.
 */
export function chordsInKey(key: string): string[] {
  const minor = MINOR_KEYS.includes(key);
  const root = PITCH_CLASS[minor ? key.slice(0, -1) : key];
  if (root === undefined) return [];
  const names = FLAT_KEYS.has(key) ? FLAT_NAMES : SHARP_NAMES;
  const at = (semitones: number, suffix = "") => names[(root + semitones) % 12] + suffix;
  return minor
    ? [at(0, "m"), at(3), at(5, "m"), at(7, "m"), at(7, "7"), at(8), at(10)]
    : [at(0), at(2, "m"), at(4, "m"), at(5), at(7), at(7, "7"), at(9, "m")];
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/**
 * The scale of a key from MAJOR_KEYS or MINOR_KEYS (major, or natural minor):
 * its pitch classes in degree order, so index 0 is degree 1 (the root).
 */
export function scaleForKey(key: string): number[] {
  const minor = MINOR_KEYS.includes(key);
  const root = PITCH_CLASS[minor ? key.slice(0, -1) : key];
  if (root === undefined) return [];
  return (minor ? NATURAL_MINOR_SCALE : MAJOR_SCALE).map((interval) => (root + interval) % 12);
}
