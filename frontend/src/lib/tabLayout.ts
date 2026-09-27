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
  /**
   * Present only for hammer-ons/pull-offs: the frequency the note is plucked
   * at before hammering/pulling to `frequency` halfway through.
   */
  fromFrequency?: number;
}

/** How far the 5th string is raised: its own capo/spike if it has one, otherwise the main capo. */
export function fifthStringRaise(capoFret: number, fifthStringCapoFret: number | null): number {
  if (fifthStringCapoFret === null) return capoFret;
  return fifthStringCapoFret === 0 ? 0 : fifthStringCapoFret - 5;
}

export interface ScheduleOptions {
  /** Main capo fret (0 = none); raises strings 1-4 (and the 5th, unless it has its own capo). */
  capoFret?: number;
  /** 5th-string capo/spike fret: null = match the main capo, 0 = open, 6-12 = spiked there. */
  fifthStringCapoFret?: number | null;
  /** Clawhammer mode: notes' `thumb_after` plucks sound. */
  clawhammerTiming?: boolean;
}

/**
 * The fret a hammer-on/pull-off to `fret` starts from: the last fret played
 * on that string, or, with nothing (different) before it, the open string for
 * a hammer-on and two frets higher for a pull-off.
 */
function legatoFromFret(technique: "hammer_on" | "pull_off", fret: number, previousFret: number | undefined): number | null {
  if (previousFret !== undefined && previousFret !== fret) return previousFret;
  if (technique === "pull_off") return fret + 2;
  return fret > 0 ? 0 : null;
}

export interface TimedNote extends NoteOut {
  /** Seconds from the start of playback that this note should sound. */
  startTimeSeconds: number;
  /** How long the note sounds for, in seconds. */
  durationSeconds: number;
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
 * The capo raises every string's sounding pitch by that many frets (a
 * physical capo shortens the vibrating string length), except that the 5th
 * string follows its own capo/spike when it has one (see
 * `fifthStringRaise`). This is independent of `transposeSemitones`, which
 * is purely a playback preview (e.g. "hear this tuning down 1 fret").
 *
 * Hammer-ons and pull-offs take the same time as a plain note, but are
 * plucked at the previous fret on that string and change to the written
 * fret halfway through (see `SoundEvent.fromFrequency`).
 *
 * With `clawhammerTiming`, a note with `thumb_after` also gets a clawhammer
 * thumb stroke: the open 5th string, plucked halfway through the note (on
 * the off-beat). It takes no extra time. The stroke's entry shares the
 * note's id, so playback highlighting stays on that note.
 */
export function computePlaybackSchedule(
  notes: NoteOut[],
  tuning: TuningOut,
  tempoBpm: number,
  transposeSemitones: number,
  options: ScheduleOptions = {},
): TimedNote[] {
  const { capoFret = 0, fifthStringCapoFret = null, clawhammerTiming = false } = options;
  const secondsPerBeat = 60 / tempoBpm;
  const capoFor = (stringNumber: number) =>
    stringNumber === 5 ? fifthStringRaise(capoFret, fifthStringCapoFret) : capoFret;

  const sorted = [...notes].sort((a, b) => a.position - b.position);
  let elapsed = 0;
  const timed: TimedNote[] = [];
  // The fret each string was last played at, for hammer-ons/pull-offs.
  const lastFretByString = new Map<number, number>();
  for (const note of sorted) {
    const durationSeconds = note.duration_beats * secondsPerBeat;
    if (!note.is_rest && note.frets.length > 0) {
      const sounds: SoundEvent[] = [];
      for (const fretEvent of note.frets) {
        const stringNumber = fretEvent.string_number;
        const openString = tuning.open_strings[stringNumber - 1];
        // Defensive: an out-of-range string_number (which should never
        // happen given server-side validation, but could occur with
        // stale/malformed client-side data) must not crash the whole
        // schedule -- skip just this string's sound rather than throwing.
        if (openString === undefined) continue;
        const capo = capoFor(stringNumber);
        const frequency = frettedFrequency(openString, fretEvent.fret + capo, transposeSemitones);
        const sound: SoundEvent = {
          stringNumber,
          fret: fretEvent.fret,
          technique: fretEvent.technique,
          frequency,
        };
        if (fretEvent.technique === "slide" && fretEvent.slide_to_fret != null) {
          sound.slideToFrequency = frettedFrequency(openString, fretEvent.slide_to_fret + capo, transposeSemitones);
        }
        if (fretEvent.technique === "bend" && fretEvent.bend_semitones != null) {
          sound.bendToFrequency = frequency * Math.pow(2, fretEvent.bend_semitones / 12);
        }
        if (fretEvent.technique === "hammer_on" || fretEvent.technique === "pull_off") {
          const fromFret = legatoFromFret(fretEvent.technique, fretEvent.fret, lastFretByString.get(stringNumber));
          if (fromFret !== null) {
            sound.fromFrequency = frettedFrequency(openString, fromFret + capo, transposeSemitones);
          }
        }
        lastFretByString.set(
          stringNumber,
          fretEvent.technique === "slide" && fretEvent.slide_to_fret != null ? fretEvent.slide_to_fret : fretEvent.fret,
        );
        sounds.push(sound);
      }
      if (sounds.length > 0) {
        timed.push({ ...note, startTimeSeconds: elapsed, durationSeconds, sounds });
      }
    }
    if (clawhammerTiming && note.thumb_after) {
      lastFretByString.set(5, 0);
      timed.push({
        ...note,
        startTimeSeconds: elapsed + durationSeconds / 2,
        durationSeconds: durationSeconds / 2,
        sounds: [
          {
            stringNumber: 5,
            fret: 0,
            technique: "normal",
            frequency: frettedFrequency(tuning.open_strings[4], capoFor(5), transposeSemitones),
          },
        ],
      });
    }
    elapsed += durationSeconds;
  }
  return timed;
}

export function totalDurationSeconds(notes: NoteOut[], tempoBpm: number): number {
  const secondsPerBeat = 60 / tempoBpm;
  return notes.reduce((sum, n) => sum + n.duration_beats * secondsPerBeat, 0);
}

/** Notes per rendered tab line before an automatic line break is inserted. */
export const NOTES_PER_LINE = 16;

/**
 * Split notes (in position order) into lines. A line breaks automatically
 * every `NOTES_PER_LINE` notes, or earlier if a note is explicitly flagged
 * `line_break` (kept for any pre-existing tabs authored before automatic
 * line breaks were introduced).
 */
export function splitIntoLines(notes: NoteOut[]): NoteOut[][] {
  const sorted = [...notes].sort((a, b) => a.position - b.position);
  const lines: NoteOut[][] = [];
  let current: NoteOut[] = [];
  for (const note of sorted) {
    current.push(note);
    if (note.line_break || current.length >= NOTES_PER_LINE) {
      lines.push(current);
      current = [];
    }
  }
  if (current.length > 0) lines.push(current);
  return lines;
}
