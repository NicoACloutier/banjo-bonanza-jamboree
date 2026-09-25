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
    open_strings: ["E4", "D4", "A3", "D3", "A4"],
    description: "aDADE -- Double C raised a whole step; popular for old-time tunes in D.",
  },
  {
    key: "drop_c",
    display_name: "Drop C",
    open_strings: ["D4", "B3", "G3", "C3", "G4"],
    description: "gCGBD -- Open G with the 4th string dropped to C.",
  },
  {
    key: "open_c",
    display_name: "Open C",
    open_strings: ["E4", "C4", "G3", "C3", "G4"],
    description: "gCGCE -- Double C with the 1st string lowered to E; rings an open C major chord.",
  },
  {
    key: "g_minor",
    display_name: "G Minor",
    open_strings: ["D4", "Bb3", "G3", "D3", "G4"],
    description: "gDGBbD -- Open G with the 2nd string lowered to Bb; for minor-key tunes.",
  },
  {
    key: "d_minor",
    display_name: "D Minor",
    open_strings: ["D4", "A3", "F3", "D3", "A4"],
    description: "aDFAD -- open D minor chord; for minor-key tunes in D.",
  },
  {
    key: "open_a",
    display_name: "Open A",
    open_strings: ["E4", "C#4", "A3", "E3", "A4"],
    description: "aEAC#E -- Open G raised a whole step; common in old-time and bluegrass fiddle keys.",
  },
  {
    key: "a_modal",
    display_name: "A Modal (Sawmill in A)",
    open_strings: ["E4", "D4", "A3", "E3", "A4"],
    description: "aEADE -- Sawmill raised a whole step; used for modal fiddle tunes in A.",
  },
];

export function getFallbackTuning(key: string): TuningOut {
  const tuning = FALLBACK_TUNINGS.find((t) => t.key === key);
  if (!tuning) {
    throw new Error(`Unknown tuning key: ${key}`);
  }
  return tuning;
}

/**
 * The key each tuning is "home" in when played open: the chord the open
 * strings ring out, i.e. the key tunes in that tuning are usually played in.
 * Modal tunings (like Sawmill) ring neither a major nor a minor chord, so
 * they're marked modal.
 */
export interface TuningKey {
  tonic: string;
  quality: "major" | "minor" | "modal";
}

const TUNING_HOME_KEYS: Record<string, TuningKey> = {
  standard_g: { tonic: "G", quality: "major" },
  double_c: { tonic: "C", quality: "major" },
  sawmill: { tonic: "G", quality: "modal" },
  open_d: { tonic: "D", quality: "major" },
  double_d: { tonic: "D", quality: "major" },
  drop_c: { tonic: "C", quality: "major" },
  open_c: { tonic: "C", quality: "major" },
  g_minor: { tonic: "G", quality: "minor" },
  d_minor: { tonic: "D", quality: "minor" },
  open_a: { tonic: "A", quality: "major" },
  a_modal: { tonic: "A", quality: "modal" },
};

// Key names as musicians usually spell them (Bb rather than A#, etc.).
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

/**
 * The key a tuning plays in, shifted by `transposeSemitones` (e.g. Standard G
 * tuned up 2 frets plays in A). Returns null for tunings without a known key.
 */
export function keyForTuning(tuningKeyId: string, transposeSemitones = 0): TuningKey | null {
  const home = TUNING_HOME_KEYS[tuningKeyId];
  if (!home) return null;
  const index = KEY_NAMES.indexOf(home.tonic);
  const tonic = KEY_NAMES[(((index + transposeSemitones) % 12) + 12) % 12];
  return { tonic, quality: home.quality };
}
