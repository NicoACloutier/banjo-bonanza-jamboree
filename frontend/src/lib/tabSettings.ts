/**
 * Labels and helpers for tab-level settings (time signature, 5th-string
 * capo), shared by the editor and viewer.
 */
import type { PlayOptions } from "./playbackEngine";
import type { TabSettings, TimeSignature } from "../types/api";

export const TIME_SIGNATURES: TimeSignature[] = ["4/4", "3/4", "2/4", "6/8"];

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
