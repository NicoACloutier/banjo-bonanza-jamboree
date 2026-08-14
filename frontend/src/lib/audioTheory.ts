/**
 * Music-theory helpers: convert scientific pitch notation (e.g. "D4") to
 * frequencies in Hz, with support for semitone transposition. This mirrors
 * `backend/app/services/audio_theory.py` so the frontend can compute exact
 * pitches for playback/tuning without a network round-trip per note.
 */

const NOTE_OFFSETS: Record<string, number> = {
  C: -9,
  "C#": -8,
  DB: -8,
  D: -7,
  "D#": -6,
  EB: -6,
  E: -5,
  F: -4,
  "F#": -3,
  GB: -3,
  G: -2,
  "G#": -1,
  AB: -1,
  A: 0,
  "A#": 1,
  BB: 1,
  B: 2,
};

const NOTE_PATTERN = /^([A-Ga-g])([#b]?)(-?\d+)$/;

/** Convert a note name like "A4" to its semitone offset from A4 (A4 -> 0). */
export function noteNameToSemitoneOffset(note: string): number {
  const match = NOTE_PATTERN.exec(note.trim());
  if (!match) {
    throw new Error(`Invalid note name: ${note}`);
  }
  const [, letter, accidental, octaveStr] = match;
  const key = (letter + accidental).toUpperCase();
  const offset = NOTE_OFFSETS[key];
  if (offset === undefined) {
    throw new Error(`Invalid note name: ${note}`);
  }
  const octave = parseInt(octaveStr, 10);
  return offset + (octave - 4) * 12;
}

/** Convert a note name (optionally transposed by semitones) to a frequency in Hz. */
export function noteNameToFrequency(note: string, transposeSemitones = 0): number {
  const semitoneOffset = noteNameToSemitoneOffset(note) + transposeSemitones;
  return 440 * Math.pow(2, semitoneOffset / 12);
}

/** Frequency of a given fret on a string tuned to `openStringNote`. */
export function frettedFrequency(
  openStringNote: string,
  fret: number,
  transposeSemitones = 0,
): number {
  return noteNameToFrequency(openStringNote, transposeSemitones + fret);
}

/** Human-readable note name (nearest semitone) for a frequency, e.g. for tuner display. */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function frequencyToNearestNote(frequency: number): { name: string; octave: number; cents: number } {
  const semitonesFromA4 = 12 * Math.log2(frequency / 440);
  const rounded = Math.round(semitonesFromA4);
  const cents = Math.round((semitonesFromA4 - rounded) * 100);
  // A4 is semitone index 9 in octave 4 (C=0 offset within its octave).
  const semitoneIndex = ((9 + rounded) % 12 + 12) % 12;
  const octave = 4 + Math.floor((9 + rounded) / 12);
  return { name: NOTE_NAMES[semitoneIndex], octave, cents };
}
