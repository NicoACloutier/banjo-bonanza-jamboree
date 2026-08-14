/**
 * Fallback tuning definitions, mirroring `backend/app/core/tunings.py`.
 * The frontend normally fetches the authoritative list from
 * `GET /api/tabs/tunings`, but this local copy lets the UI render
 * immediately (and lets the tuner/editor work offline-first) before that
 * request resolves, and acts as a fallback if the request fails.
 */
import type { TuningOut } from "../types/api";

export const FALLBACK_TUNINGS: TuningOut[] = [
  {
    key: "standard_g",
    display_name: "Standard G (Open G)",
    open_strings: ["D4", "B3", "G3", "D3", "G4"],
    description: "The most common 5-string banjo tuning: gDGBD.",
  },
  {
    key: "double_c",
    display_name: "Double C",
    open_strings: ["D4", "C4", "G3", "C3", "G4"],
    description: "gCGCD -- popular for old-time clawhammer melodies.",
  },
  {
    key: "sawmill",
    display_name: "Sawmill (G Modal)",
    open_strings: ["D4", "C4", "G3", "D3", "G4"],
    description: "gDGCD -- a modal tuning used for tunes like 'Sail Away Ladies'.",
  },
  {
    key: "open_d",
    display_name: "Open D",
    open_strings: ["D4", "A3", "F#3", "D3", "F#4"],
    description: "f#DF#AD -- used for tunes in the key of D.",
  },
  {
    key: "double_d",
    display_name: "Double D",
    open_strings: ["D4", "A3", "D3", "D3", "A4"],
    description: "aDADE-family double D tuning.",
  },
  {
    key: "drop_c",
    display_name: "Drop C",
    open_strings: ["D4", "B3", "G3", "C3", "G4"],
    description: "gCGBD -- Open G with the 4th string dropped to C.",
  },
];

export function getFallbackTuning(key: string): TuningOut {
  const tuning = FALLBACK_TUNINGS.find((t) => t.key === key);
  if (!tuning) {
    throw new Error(`Unknown tuning key: ${key}`);
  }
  return tuning;
}
