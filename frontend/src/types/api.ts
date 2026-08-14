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

export interface NoteIn {
  position: number;
  string_number: number;
  fret: number;
  duration_beats: number;
  line_break: boolean;
  lyric?: string | null;
  is_rest: boolean;
}

export interface NoteOut {
  id: string;
  position: number;
  string_number: number;
  fret: number;
  duration_beats: number;
  line_break: boolean;
  lyric: string | null;
  is_rest: boolean;
}

export interface TabCreateRequest {
  song_name: string;
  tuning_key: string;
  artist?: string | null;
  album?: string | null;
  tempo_bpm: number;
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
