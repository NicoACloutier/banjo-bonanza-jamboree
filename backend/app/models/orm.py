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


class Note(Base):
    """
    A single fretted (or open/muted) note in a tab, in playback order.

    `position` is a strictly increasing integer defining play order.
    `line_break` marks that a new tab line/system should start *after* this
    note (used for rendering + auto-scroll pagination).
    """

    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid_str)
    tab_id: Mapped[str] = mapped_column(ForeignKey("tabs.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    string_number: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5 (ignored for rests)
    fret: Mapped[int] = mapped_column(Integer, nullable=False)  # 0 = open string (ignored for rests)
    # Duration expressed in quarter-note beats (0.25 = 16th, 0.5 = 8th, 1 = quarter, etc.)
    duration_beats: Mapped[float] = mapped_column(default=1.0)
    line_break: Mapped[bool] = mapped_column(Boolean, default=False)
    # A rest: takes up time (advances playback) but produces no sound and no
    # fret number in the rendered tab -- just extra space before the next note.
    is_rest: Mapped[bool] = mapped_column(Boolean, default=False)

    tab: Mapped[Tab] = relationship(back_populates="notes")
    lyric: Mapped["Lyric | None"] = relationship(back_populates="note", uselist=False)


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
