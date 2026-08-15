"""SQLAlchemy ORM models for users, tabs, notes, lyrics, and votes."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def _uuid_str() -> str:
    return str(uuid.uuid4())


class TabStatus(str, enum.Enum):
    draft = "draft"
    published = "published"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    username: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, index=True, nullable=True)
    # Nullable because Google-only accounts have no local password.
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)
    google_subject_id: Mapped[str | None] = mapped_column(
        String(255), unique=True, index=True, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tabs: Mapped[list["Tab"]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    votes: Mapped[list["Vote"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class RefreshToken(Base):
    """Stores only the SHA-256 hash of a refresh token, never the raw value."""

    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped[User] = relationship(back_populates="refresh_tokens")


class Tab(Base):
    __tablename__ = "tabs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    song_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    artist: Mapped[str | None] = mapped_column(String(200), nullable=True)
    album: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tuning_key: Mapped[str] = mapped_column(String(32), nullable=False)
    tempo_bpm: Mapped[int] = mapped_column(Integer, default=100)
    # Capo position in frets (0 = no capo). Raises the sounding pitch of
    # every string by this many frets, independent of the "transpose to
    # hear a different tuning" playback control.
    capo_fret: Mapped[int] = mapped_column(Integer, default=0)

    status: Mapped[TabStatus] = mapped_column(
        Enum(TabStatus, native_enum=False), default=TabStatus.draft, index=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner: Mapped[User] = relationship(back_populates="tabs")
    notes: Mapped[list["Note"]] = relationship(
        back_populates="tab", cascade="all, delete-orphan", order_by="Note.position"
    )
    lyrics: Mapped[list["Lyric"]] = relationship(back_populates="tab", cascade="all, delete-orphan")
    votes: Mapped[list["Vote"]] = relationship(back_populates="tab", cascade="all, delete-orphan")
    revisions: Mapped[list["TabRevision"]] = relationship(
        back_populates="tab", cascade="all, delete-orphan", order_by="TabRevision.created_at"
    )


class Note(Base):
    """
    A single playback "slot" (one moment in time) in a tab, in playback
    order. A slot may contain zero frets (a rest), one fret (a normal single
    note), or several frets played simultaneously (a chord) -- see
    `NoteFret` below.

    `position` is a strictly increasing integer defining play order.
    `line_break` marks that a new tab line/system should start *after* this
    note (used for rendering + auto-scroll pagination).
    """

    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tab_id: Mapped[str] = mapped_column(ForeignKey("tabs.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    # Duration expressed in quarter-note beats (0.25 = 16th, 0.5 = 8th, 1 = quarter, etc.)
    duration_beats: Mapped[float] = mapped_column(default=1.0)
    line_break: Mapped[bool] = mapped_column(Boolean, default=False)
    # A rest: takes up time (advances playback) but produces no sound and no
    # fret numbers in the rendered tab -- just extra space before the next
    # note. A rest has no NoteFret rows.
    is_rest: Mapped[bool] = mapped_column(Boolean, default=False)

    tab: Mapped[Tab] = relationship(back_populates="notes")
    lyric: Mapped["Lyric | None"] = relationship(back_populates="note", uselist=False)
    frets: Mapped[list["NoteFret"]] = relationship(
        back_populates="note", cascade="all, delete-orphan", order_by="NoteFret.string_number"
    )


class NoteTechnique(str, enum.Enum):
    """How a fretted note is sounded, relative to the previous note on the same string."""

    normal = "normal"
    hammer_on = "hammer_on"
    pull_off = "pull_off"
    slide = "slide"
    bend = "bend"
    # Clawhammer "drop-thumb": the thumb leaves the 5th string to strike a
    # lower string mid-roll, rather than the usual thumb-on-5th-string roll.
    drop_thumb = "drop_thumb"


class RightHandFinger(str, enum.Enum):
    """Which right-hand digit plucks this string, for clawhammer/roll-pattern annotation."""

    thumb = "thumb"
    index = "index"
    middle = "middle"


class NoteFret(Base):
    """
    One fretted (or open) string within a `Note` slot. A slot with more than
    one `NoteFret` row is a chord (several strings struck simultaneously).

    `technique` marks how this fret is sounded: a plain pick/pluck
    ("normal"), a hammer-on or pull-off from the previous note on the same
    string (played legato, with a softer/quicker attack and no separate
    pick-pluck sound), a slide into `slide_to_fret` (a continuous pitch
    glide from `fret` to `slide_to_fret` over the note's duration), a
    string "bend" (a pitch rise of `bend_semitones` without changing fret),
    or a clawhammer "drop-thumb" stroke (annotation only; sounds like a
    normal pluck but marks a specific right-hand technique in the tab).

    `right_hand_finger` is an optional annotation (thumb/index/middle) used
    to notate clawhammer roll patterns; it does not affect playback sound.
    """

    __tablename__ = "note_frets"
    __table_args__ = (UniqueConstraint("note_id", "string_number", name="uq_note_fret_string"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    note_id: Mapped[str] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), index=True)
    string_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    fret: Mapped[int] = mapped_column(Integer, nullable=False)  # 0 = open string
    technique: Mapped[NoteTechnique] = mapped_column(
        Enum(NoteTechnique, native_enum=False), default=NoteTechnique.normal
    )
    # Only meaningful when technique == slide: the fret slid *into*.
    slide_to_fret: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Only meaningful when technique == bend: how many semitones the pitch
    # rises to, over the note's duration (e.g. 1 = a half-step bend).
    bend_semitones: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Optional right-hand annotation for roll patterns (thumb/index/middle).
    right_hand_finger: Mapped[RightHandFinger | None] = mapped_column(
        Enum(RightHandFinger, native_enum=False), nullable=True
    )

    note: Mapped[Note] = relationship(back_populates="frets")


class Lyric(Base):
    """A lyric snippet anchored to a specific note in the tab."""

    __tablename__ = "lyrics"
    __table_args__ = (UniqueConstraint("note_id", name="uq_lyric_note"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tab_id: Mapped[str] = mapped_column(ForeignKey("tabs.id", ondelete="CASCADE"), index=True)
    note_id: Mapped[str] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(String(64), nullable=False)

    tab: Mapped[Tab] = relationship(back_populates="lyrics")
    note: Mapped[Note] = relationship(back_populates="lyric")


class Vote(Base):
    """A thumbs-up vote by a user on a published tab. There is no down-vote."""

    __tablename__ = "votes"
    __table_args__ = (UniqueConstraint("tab_id", "user_id", name="uq_vote_tab_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tab_id: Mapped[str] = mapped_column(ForeignKey("tabs.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tab: Mapped[Tab] = relationship(back_populates="votes")
    user: Mapped[User] = relationship(back_populates="votes")


class TabRevision(Base):
    """
    A snapshot of a tab's editable fields (metadata + notes), taken every
    time an owner saves an update. Lets an owner browse history and restore
    an earlier version (e.g. after accidentally overwriting a verse).

    The snapshot is stored as a single JSON-encoded text blob (msgspec's
    `TabUpdateRequest` shape) rather than normalized rows, since revisions
    are read/restored wholesale and never queried piecemeal.
    """

    __tablename__ = "tab_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tab_id: Mapped[str] = mapped_column(ForeignKey("tabs.id", ondelete="CASCADE"), index=True)
    snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

    tab: Mapped[Tab] = relationship(back_populates="revisions")
