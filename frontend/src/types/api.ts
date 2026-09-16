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
  frets: NoteFretOut[];
}

export interface TabCreateRequest {
  song_name: string;
  tuning_key: string;
  artist?: string | null;
  album?: string | null;
  tempo_bpm: number;
  /** Capo position in frets (0 = no capo). */
  capo_fret: number;
  /** How many bars each rendered line of 16 notes is visually divided into (1, 2, or 4). */
  bars_per_line: number;
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

export interface TabDetail {
  id: string;
  song_name: string;
  artist: string | null;
  album: string | null;
  tuning_key: string;
  tempo_bpm: number;
  capo_fret: number;
  bars_per_line: number;
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
export interface TabRevisionDetail {
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
  notes: NoteOut[];
}
