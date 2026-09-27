/**
 * Labels and helpers for tab-level settings (time signature, style, key,
 * difficulty, 5th-string capo), shared by the editor, viewer and browse page.
 */
import type { PlayOptions } from "./playbackEngine";
import type { Difficulty, NoteOut, TabSettings, TabStyle, TimeSignature } from "../types/api";

export const TIME_SIGNATURES: TimeSignature[] = ["4/4", "3/4", "2/4", "6/8"];

export const STYLE_LABELS: Record<TabStyle, string> = {
  scruggs: "Scruggs / bluegrass",
  clawhammer: "Clawhammer",
  melodic: "Melodic",
  single_string: "Single-string",
  old_time: "Old-time (other)",
  other: "Other",
};

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

/** Keys offered for a tab's key (majors, then minors). */
export const SONG_KEYS = [
  ..."C Db D Eb E F F# G Ab A Bb B".split(" "),
  ..."Cm C#m Dm Ebm Em Fm F#m Gm G#m Am Bbm Bm".split(" "),
];

/** 5th-string capo choices: match the main capo (null), open (0), or a spike at fret 6-12. */
export const FIFTH_STRING_CAPO_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Match main capo" },
  { value: 0, label: "Open (no 5th-string capo)" },
  ...[6, 7, 8, 9, 10, 11, 12].map((fret) => ({ value: fret, label: `Spike/capo at fret ${fret}` })),
];

/** Settings for a brand-new tab. */
export const DEFAULT_TAB_SETTINGS: TabSettings = {
  time_signature: "4/4",
  swing: false,
  fifth_string_capo_fret: null,
  style: null,
  song_key: null,
  difficulty: null,
};

/** Playback options for a tab's settings. */
export function playOptionsFor(
  tab: Pick<TabSettings, "swing" | "fifth_string_capo_fret"> & { capo_fret: number; clawhammer_timing: boolean },
): PlayOptions {
  return {
    capoFret: tab.capo_fret,
    fifthStringCapoFret: tab.fifth_string_capo_fret,
    clawhammerTiming: tab.clawhammer_timing,
    swing: tab.swing,
  };
}

/** Distinct chord names used in a tab, in order of first appearance. */
export function chordsUsed(notes: NoteOut[]): string[] {
  const names: string[] = [];
  for (const note of [...notes].sort((a, b) => a.position - b.position)) {
    if (note.chord && !names.includes(note.chord)) names.push(note.chord);
  }
  return names;
}
