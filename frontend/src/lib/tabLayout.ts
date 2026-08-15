/**
 * Pure helpers for laying out a tab's notes into timed events (for
 * playback) and into visual lines (for rendering + lyric placement).
 * Kept free of DOM/Web Audio dependencies so it is easily unit-testable.
 */
import { frettedFrequency } from "./audioTheory";
import type { NoteOut, TuningOut } from "../types/api";

/** One string's sounding event within a (possibly chordal) note slot. */
export interface SoundEvent {
  stringNumber: number;
  fret: number;
  technique: NoteOut["frets"][number]["technique"];
  frequency: number;
  /** Present only for slides: the frequency the pitch glides to. */
  slideToFrequency?: number;
  /** Present only for bends: the frequency the pitch bends up to. */
  bendToFrequency?: number;
}

export interface TimedNote extends NoteOut {
  /** Seconds from the start of playback that this note should sound. */
  startTimeSeconds: number;
  /**
   * All strings sounding simultaneously at this position (a chord has more
   * than one). Always non-empty for entries in the returned schedule
   * (rests never appear here at all).
   */
  sounds: SoundEvent[];
}

/**
 * Compute absolute start times (seconds) and per-string frequencies for
 * every *sounding* note, in position order. Rests advance the playback
 * clock but are intentionally excluded from the returned schedule -- they
 * produce no sound. A chord (a note with multiple frets) produces a single
 * schedule entry whose `sounds` array has one item per string, all sharing
 * the same start time so they ring out together.
 *
 * `capoFret` raises every string's sounding pitch by that many frets (a
 * physical capo shortens the vibrating string length), independent of
 * `transposeSemitones` (which is purely a playback preview, e.g. "hear
 * this tuning down 1 fret" -- it does not reflect a physical capo).
 */
export function computePlaybackSchedule(
  notes: NoteOut[],
  tuning: TuningOut,
  tempoBpm: number,
  transposeSemitones: number,
  capoFret = 0,
): TimedNote[] {
  const secondsPerBeat = 60 / tempoBpm;
  const sorted = [...notes].sort((a, b) => a.position - b.position);
  let elapsed = 0;
  const timed: TimedNote[] = [];
  for (const note of sorted) {
    if (!note.is_rest && note.frets.length > 0) {
      const sounds: SoundEvent[] = [];
      for (const fretEvent of note.frets) {
        const openString = tuning.open_strings[fretEvent.string_number - 1];
        // Defensive: an out-of-range string_number (which should never
        // happen given server-side validation, but could occur with
        // stale/malformed client-side data) must not crash the whole
        // schedule -- skip just this string's sound rather than throwing.
        if (openString === undefined) continue;
        const effectiveFret = fretEvent.fret + capoFret;
        const frequency = frettedFrequency(openString, effectiveFret, transposeSemitones);
        const sound: SoundEvent = {
          stringNumber: fretEvent.string_number,
          fret: fretEvent.fret,
          technique: fretEvent.technique,
          frequency,
        };
        if (fretEvent.technique === "slide" && fretEvent.slide_to_fret != null) {
          sound.slideToFrequency = frettedFrequency(
            openString,
            fretEvent.slide_to_fret + capoFret,
            transposeSemitones,
          );
        }
        if (fretEvent.technique === "bend" && fretEvent.bend_semitones != null) {
          sound.bendToFrequency = frequency * Math.pow(2, fretEvent.bend_semitones / 12);
        }
        sounds.push(sound);
      }
      if (sounds.length > 0) {
        timed.push({ ...note, startTimeSeconds: elapsed, sounds });
      }
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
