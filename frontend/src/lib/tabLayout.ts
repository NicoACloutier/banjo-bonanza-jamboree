/**
 * Pure helpers for laying out a tab's notes into timed events (for
 * playback) and into visual lines (for rendering + lyric placement).
 * Kept free of DOM/Web Audio dependencies so it is easily unit-testable.
 */
import { frettedFrequency } from "./audioTheory";
import type { NoteOut, TimeSignature, TuningOut } from "../types/api";

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
  /**
   * How long this string rings, if different from its note's duration: a
   * sound that later notes are tied to keeps ringing through them.
   */
  durationSeconds?: number;
}

/** A note's length in beats (quarter notes), after its dotted/triplet modifiers. */
export function effectiveBeats(note: NoteOut): number {
  return note.duration_beats * (note.dotted ? 1.5 : 1) * (note.triplet ? 2 / 3 : 1);
}

/** Length of one bar in beats (quarter notes); 6/8 is six eighth notes, i.e. three beats. */
export function barLengthBeats(timeSignature: TimeSignature): number {
  return { "2/4": 2, "3/4": 3, "4/4": 4, "6/8": 3 }[timeSignature];
}

// Beat positions within this of a bar line (or of each other) count as equal,
// absorbing floating-point error from triplets (thirds of a beat).
const BEAT_EPSILON = 1e-6;

/**
 * Ids of the notes that start a new bar (other than the first), given the
 * time signature: a note starts a bar when the beats before it add up to a
 * whole number of bars.
 */
export function barStartNoteIds(notes: NoteOut[], timeSignature: TimeSignature): Set<string> {
  const barLength = barLengthBeats(timeSignature);
  const ids = new Set<string>();
  let beat = 0;
  for (const note of [...notes].sort((a, b) => a.position - b.position)) {
    const barsSoFar = beat / barLength;
    if (beat > BEAT_EPSILON && Math.abs(barsSoFar - Math.round(barsSoFar)) < BEAT_EPSILON) ids.add(note.id);
    beat += effectiveBeats(note);
  }
  return ids;
}

/**
 * Swing feel as a warp of beat positions: within each beat, the first eighth
 * note is stretched to two-thirds of the beat and the second squeezed into
 * the last third (a 2:1 long-short feel). Whole beats are unchanged.
 */
export function swingBeat(beat: number): number {
  const whole = Math.floor(beat + BEAT_EPSILON);
  const fraction = Math.max(0, beat - whole);
  return whole + (fraction < 0.5 ? (fraction * 4) / 3 : 2 / 3 + ((fraction - 0.5) * 2) / 3);
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
  /** Swing feel: eighth-note pairs play long-short. */
  swing?: boolean;
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
   * than one). Rests never appear in the schedule; this is only empty for a
   * note whose strings are all tied to earlier sounds.
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
 * Each note lasts `effectiveBeats` (its duration with dotted/triplet
 * applied); with `swing`, beat positions are warped by `swingBeat`.
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
 * A `tied` note doesn't re-pick strings it shares (at the same fret) with
 * the string's last sound: that sound rings on through it instead. If every
 * string is tied, the note's entry has no sounds (it still marks the time,
 * for playback highlighting).
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
  const { capoFret = 0, fifthStringCapoFret = null, clawhammerTiming = false, swing = false } = options;
  const secondsPerBeat = 60 / tempoBpm;
  const timeAt = (beat: number) => (swing ? swingBeat(beat) : beat) * secondsPerBeat;
  const capoFor = (stringNumber: number) =>
    stringNumber === 5 ? fifthStringRaise(capoFret, fifthStringCapoFret) : capoFret;

  const sorted = [...notes].sort((a, b) => a.position - b.position);
  let beat = 0;
  const timed: TimedNote[] = [];
  // The fret each string was last played at, for hammer-ons/pull-offs and ties.
  const lastFretByString = new Map<number, number>();
  // Each string's most recent sound and when it started, so ties can extend it.
  const lastSoundByString = new Map<number, { sound: SoundEvent; startTimeSeconds: number; durationSeconds: number }>();

  for (const note of sorted) {
    const beats = effectiveBeats(note);
    const startTimeSeconds = timeAt(beat);
    const endTimeSeconds = timeAt(beat + beats);
    const durationSeconds = endTimeSeconds - startTimeSeconds;
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

        const previous = lastSoundByString.get(stringNumber);
        if (note.tied && previous && lastFretByString.get(stringNumber) === fretEvent.fret) {
          // Tied: let the earlier sound ring on to the end of this note.
          previous.durationSeconds = endTimeSeconds - previous.startTimeSeconds;
          previous.sound.durationSeconds = previous.durationSeconds;
          continue;
        }

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
        lastSoundByString.set(stringNumber, { sound, startTimeSeconds, durationSeconds });
        sounds.push(sound);
      }
      if (sounds.length > 0 || note.tied) {
        timed.push({ ...note, startTimeSeconds, durationSeconds, sounds });
      }
    }
    if (clawhammerTiming && note.thumb_after) {
      const thumbStart = timeAt(beat + beats / 2);
      const sound: SoundEvent = {
        stringNumber: 5,
        fret: 0,
        technique: "normal",
        frequency: frettedFrequency(tuning.open_strings[4], capoFor(5), transposeSemitones),
      };
      lastFretByString.set(5, 0);
      lastSoundByString.set(5, { sound, startTimeSeconds: thumbStart, durationSeconds: endTimeSeconds - thumbStart });
      timed.push({ ...note, startTimeSeconds: thumbStart, durationSeconds: endTimeSeconds - thumbStart, sounds: [sound] });
    }
    beat += beats;
  }
  return timed;
}

export function totalDurationSeconds(notes: NoteOut[], tempoBpm: number, swing = false): number {
  const beats = notes.reduce((sum, n) => sum + effectiveBeats(n), 0);
  return (swing ? swingBeat(beats) : beats) * (60 / tempoBpm);
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
