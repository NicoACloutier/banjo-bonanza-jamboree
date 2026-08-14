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


class NoteIn(msgspec.Struct):
    position: int
    string_number: int
    fret: int
    duration_beats: float = 1.0
    line_break: bool = False
    lyric: str | None = None


class NoteOut(msgspec.Struct):
    id: str
    position: int
    string_number: int
    fret: int
    duration_beats: float
    line_break: bool
    lyric: str | None = None


# ---------------------------------------------------------------------------
# Tabs
# ---------------------------------------------------------------------------


class TabCreateRequest(msgspec.Struct):
    song_name: str
    tuning_key: str
    artist: str | None = None
    album: str | None = None
    tempo_bpm: int = 100
    notes: list[NoteIn] = msgspec.field(default_factory=list)
    publish: bool = False


class TabUpdateRequest(msgspec.Struct):
    song_name: str
    tuning_key: str
    artist: str | None = None
    album: str | None = None
    tempo_bpm: int = 100
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
