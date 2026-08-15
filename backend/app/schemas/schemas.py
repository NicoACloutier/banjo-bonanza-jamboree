"""
msgspec Struct definitions used as strictly-typed request/response schemas.

These are intentionally decoupled from the SQLAlchemy ORM models: converters
in `app/services/converters.py` map between the two layers. This keeps the
persistence layer free to evolve independently of the public API contract.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum

import msgspec


class TabStatusOut(str, Enum):
    draft = "draft"
    published = "published"


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class RegisterRequest(msgspec.Struct):
    username: str
    email: str
    password: str


class LoginRequest(msgspec.Struct):
    username: str
    password: str


class TokenResponse(msgspec.Struct):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(msgspec.Struct):
    refresh_token: str


class GoogleAuthRequest(msgspec.Struct):
    """The frontend exchanges Google's auth code for our own JWT via this."""

    code: str


class UserPublic(msgspec.Struct):
    id: str
    username: str
    created_at: datetime


# ---------------------------------------------------------------------------
# Notes / Lyrics
# ---------------------------------------------------------------------------


class TechniqueOut(str, Enum):
    normal = "normal"
    hammer_on = "hammer_on"
    pull_off = "pull_off"
    slide = "slide"
    bend = "bend"
    drop_thumb = "drop_thumb"


class RightHandFingerOut(str, Enum):
    thumb = "thumb"
    index = "index"
    middle = "middle"


class NoteFretIn(msgspec.Struct):
    """One string/fret (with optional technique) within a note slot."""

    string_number: int
    fret: int
    technique: TechniqueOut = TechniqueOut.normal
    # Only meaningful when technique == slide: the fret slid *into*.
    slide_to_fret: int | None = None
    # Only meaningful when technique == bend: semitones the pitch rises to.
    bend_semitones: int | None = None
    # Optional roll-pattern annotation; does not affect playback sound.
    right_hand_finger: RightHandFingerOut | None = None


class NoteFretOut(msgspec.Struct):
    string_number: int
    fret: int
    technique: TechniqueOut = TechniqueOut.normal
    slide_to_fret: int | None = None
    bend_semitones: int | None = None
    right_hand_finger: RightHandFingerOut | None = None


class NoteIn(msgspec.Struct):
    position: int
    duration_beats: float = 1.0
    line_break: bool = False
    lyric: str | None = None
    # A rest: no sound, no fret numbers shown -- just extra time/space before
    # the next note. `frets` must be empty for a rest.
    is_rest: bool = False
    # One entry per string sounded at this position; more than one entry
    # means a chord (multiple strings struck simultaneously). Must contain
    # exactly one entry per distinct string_number (1-5), and must be empty
    # when `is_rest` is true.
    frets: list[NoteFretIn] = msgspec.field(default_factory=list)


class NoteOut(msgspec.Struct):
    id: str
    position: int
    duration_beats: float
    line_break: bool
    lyric: str | None = None
    is_rest: bool = False
    frets: list[NoteFretOut] = msgspec.field(default_factory=list)


# ---------------------------------------------------------------------------
# Tabs
# ---------------------------------------------------------------------------


class TabCreateRequest(msgspec.Struct):
    song_name: str
    tuning_key: str
    artist: str | None = None
    album: str | None = None
    tempo_bpm: int = 100
    # Capo position in frets (0 = no capo).
    capo_fret: int = 0
    notes: list[NoteIn] = msgspec.field(default_factory=list)
    publish: bool = False


class TabUpdateRequest(msgspec.Struct):
    song_name: str
    tuning_key: str
    artist: str | None = None
    album: str | None = None
    tempo_bpm: int = 100
    capo_fret: int = 0
    notes: list[NoteIn] = msgspec.field(default_factory=list)
    publish: bool = False


class TabSummary(msgspec.Struct):
    """Lightweight tab representation used in list/search results."""

    id: str
    song_name: str
    artist: str | None
    album: str | None
    tuning_key: str
    status: TabStatusOut
    vote_count: int
    owner_username: str
    created_at: datetime
    updated_at: datetime


class TabDetail(msgspec.Struct):
    """Full tab representation including notes/lyrics, used for editing/playback."""

    id: str
    song_name: str
    artist: str | None
    album: str | None
    tuning_key: str
    tempo_bpm: int
    capo_fret: int
    status: TabStatusOut
    vote_count: int
    owner_id: str
    owner_username: str
    has_voted: bool
    created_at: datetime
    updated_at: datetime
    notes: list[NoteOut]


class TabListResponse(msgspec.Struct):
    items: list[TabSummary]
    total: int
    page: int
    page_size: int


class VoteResponse(msgspec.Struct):
    tab_id: str
    vote_count: int
    has_voted: bool


class TuningOut(msgspec.Struct):
    key: str
    display_name: str
    open_strings: tuple[str, str, str, str, str]
    description: str


class ErrorResponse(msgspec.Struct):
    detail: str


# ---------------------------------------------------------------------------
# Revision history
# ---------------------------------------------------------------------------


class TabRevisionSummary(msgspec.Struct):
    """One entry in a tab's revision history list (no note detail, for a compact list view)."""

    id: str
    created_at: datetime
    song_name: str
    note_count: int


class TabRevisionDetail(msgspec.Struct):
    """Full snapshot of a past revision, restorable via the restore endpoint."""

    id: str
    tab_id: str
    created_at: datetime
    song_name: str
    artist: str | None
    album: str | None
    tuning_key: str
    tempo_bpm: int
    capo_fret: int
    notes: list[NoteOut]
