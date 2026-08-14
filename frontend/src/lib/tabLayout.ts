/**
 * Pure helpers for laying out a tab's notes into timed events (for
 * playback) and into visual lines (for rendering + lyric placement).
 * Kept free of DOM/Web Audio dependencies so it is easily unit-testable.
 */
import { frettedFrequency } from "./audioTheory";
import type { NoteOut, TuningOut } from "../types/api";

export interface TimedNote extends NoteOut {
  /** Seconds from the start of playback that this note should sound. */
  startTimeSeconds: number;
  frequency: number;
}

/**
 * Compute absolute start times (seconds) and frequencies for every
 * *sounding* note, in position order. Rests advance the playback clock but
 * are intentionally excluded from the returned schedule -- they produce no
 * sound.
 */
export function computePlaybackSchedule(
  notes: NoteOut[],
  tuning: TuningOut,
  tempoBpm: number,
  transposeSemitones: number,
): TimedNote[] {
  const secondsPerBeat = 60 / tempoBpm;
  const sorted = [...notes].sort((a, b) => a.position - b.position);
  let elapsed = 0;
  const timed: TimedNote[] = [];
  for (const note of sorted) {
    if (!note.is_rest) {
      const openString = tuning.open_strings[note.string_number - 1];
      const frequency = frettedFrequency(openString, note.fret, transposeSemitones);
      timed.push({ ...note, startTimeSeconds: elapsed, frequency });
    }
    elapsed += note.duration_beats * secondsPerBeat;
  }
  return timed;
}

export function totalDurationSeconds(notes: NoteOut[], tempoBpm: number): number {
  const secondsPerBeat = 60 / tempoBpm;
  return notes.reduce((sum, n) => sum + n.duration_beats * secondsPerBeat, 0);
}

/** Split notes (in position order) into lines, breaking after any note flagged `line_break`. */
export function splitIntoLines(notes: NoteOut[]): NoteOut[][] {
  const sorted = [...notes].sort((a, b) => a.position - b.position);
  const lines: NoteOut[][] = [];
  let current: NoteOut[] = [];
  for (const note of sorted) {
    current.push(note);
    if (note.line_break) {
      lines.push(current);
      current = [];
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
