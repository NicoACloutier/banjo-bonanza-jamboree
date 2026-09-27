/**
 * TypeScript types mirroring the backend's msgspec Structs
 * (see backend/app/schemas/schemas.py). Keeping these in sync manually is
 * intentional: it keeps the frontend strongly, explicitly typed without a
 * codegen build step, matching the "as strict typing as possible" goal.
 */

export type TabStatus = "draft" | "published";

export interface UserPublic {
  id: string;
  username: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export type Technique = "normal" | "hammer_on" | "pull_off" | "slide" | "bend" | "drop_thumb";

/** Which right-hand digit plucks this string, for clawhammer roll-pattern annotation. */
export type RightHandFinger = "thumb" | "index" | "middle";

/** One string/fret (with optional technique) sounded within a note slot. */
export interface NoteFretIn {
  string_number: number;
  fret: number;
  technique: Technique;
  /** Only meaningful when technique === "slide": the fret slid *into*. */
  slide_to_fret: number | null;
  /** Only meaningful when technique === "bend": semitones the pitch rises to. */
  bend_semitones: number | null;
  /** Optional roll-pattern annotation; does not affect playback sound. */
  right_hand_finger: RightHandFinger | null;
}

export interface NoteFretOut {
  string_number: number;
  fret: number;
  technique: Technique;
  slide_to_fret: number | null;
  bend_semitones: number | null;
  right_hand_finger: RightHandFinger | null;
}

export interface NoteIn {
  position: number;
  duration_beats: number;
  line_break: boolean;
  lyric?: string | null;
  is_rest: boolean;
  /**
   * Clawhammer mode only: pluck the open 5th string halfway through this
   * note (on the off-beat), without taking extra time.
   */
  thumb_after: boolean;
  /** Rhythm modifiers on `duration_beats`: dotted (x1.5) and triplet (x2/3). */
  dotted: boolean;
  triplet: boolean;
  /** Continues the previous note: shared strings at the same fret ring on instead of being picked again. */
  tied: boolean;
  /** One entry per string sounded; more than one entry means a chord. Empty for a rest. */
  frets: NoteFretIn[];
}

export interface NoteOut {
  id: string;
  position: number;
  duration_beats: number;
  line_break: boolean;
  lyric: string | null;
  is_rest: boolean;
  thumb_after: boolean;
  dotted: boolean;
  triplet: boolean;
  tied: boolean;
  frets: NoteFretOut[];
}

export type TimeSignature = "2/4" | "3/4" | "4/4" | "6/8";

/** Tab-level settings shared by create/update requests, tab details and revisions. */
export interface TabSettings {
  /** Bar lines fall at measure boundaries; null (older tabs) keeps fixed `bars_per_line` dividers. */
  time_signature: TimeSignature | null;
  /** Pairs of eighth notes play long-short. */
  swing: boolean;
  /** 5th-string capo fret (6-12); null = match the main capo; 0 = the 5th string stays open. */
  fifth_string_capo_fret: number | null;
}

export interface TabCreateRequest extends TabSettings {
  song_name: string;
  tuning_key: string;
  artist?: string | null;
  album?: string | null;
  tempo_bpm: number;
  /** Capo position in frets (0 = no capo). */
  capo_fret: number;
  /** How many bars each rendered line of 16 notes is visually divided into (1, 2, or 4). */
  bars_per_line: number;
  /** Clawhammer mode: enables notes' `thumb_after` 5th-string plucks. */
  clawhammer_timing: boolean;
  notes: NoteIn[];
  publish: boolean;
}

export type TabUpdateRequest = TabCreateRequest;

export interface TabSummary {
  id: string;
  song_name: string;
  artist: string | null;
  album: string | null;
  tuning_key: string;
  status: TabStatus;
  vote_count: number;
  owner_username: string;
  created_at: string;
  updated_at: string;
}

export interface TabDetail extends TabSettings {
  id: string;
  song_name: string;
  artist: string | null;
  album: string | null;
  tuning_key: string;
  tempo_bpm: number;
  capo_fret: number;
  bars_per_line: number;
  clawhammer_timing: boolean;
  status: TabStatus;
  vote_count: number;
  owner_id: string;
  owner_username: string;
  has_voted: boolean;
  created_at: string;
  updated_at: string;
  notes: NoteOut[];
}

export interface TabListResponse {
  items: TabSummary[];
  total: number;
  page: number;
  page_size: number;
}

export interface VoteResponse {
  tab_id: string;
  vote_count: number;
  has_voted: boolean;
}

export interface TuningOut {
  key: string;
  display_name: string;
  open_strings: [string, string, string, string, string];
  description: string;
}

export interface ApiError {
  detail: string;
}

/** One entry in a tab's revision history list (see `TabRevisionSummary` on the backend). */
export interface TabRevisionSummary {
  id: string;
  created_at: string;
  song_name: string;
  note_count: number;
}

/** Full snapshot of a past revision, restorable via the restore endpoint. */
export interface TabRevisionDetail extends TabSettings {
  id: string;
  tab_id: string;
  created_at: string;
  song_name: string;
  artist: string | null;
  album: string | null;
  tuning_key: string;
  tempo_bpm: number;
  capo_fret: number;
  bars_per_line: number;
  clawhammer_timing: boolean;
  notes: NoteOut[];
}
