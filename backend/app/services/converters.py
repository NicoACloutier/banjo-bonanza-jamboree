"""Converters between SQLAlchemy ORM models and msgspec API schemas."""

from __future__ import annotations

from app.models.orm import Note, NoteFret, Tab, User
from app.schemas.schemas import NoteFretOut, NoteOut, TabDetail, TabSummary, TabStatusOut, TechniqueOut, UserPublic


def user_to_public(user: User) -> UserPublic:
    return UserPublic(id=user.id, username=user.username, created_at=user.created_at)


def note_fret_to_out(fret: NoteFret) -> NoteFretOut:
    return NoteFretOut(
        string_number=fret.string_number,
        fret=fret.fret,
        technique=TechniqueOut(fret.technique.value),
        slide_to_fret=fret.slide_to_fret,
    )


def note_to_out(note: Note) -> NoteOut:
    return NoteOut(
        id=note.id,
        position=note.position,
        duration_beats=note.duration_beats,
        line_break=note.line_break,
        lyric=note.lyric.text if note.lyric else None,
        is_rest=note.is_rest,
        frets=[note_fret_to_out(f) for f in sorted(note.frets, key=lambda f: f.string_number)],
    )


def tab_to_summary(tab: Tab, vote_count: int) -> TabSummary:
    return TabSummary(
        id=tab.id,
        song_name=tab.song_name,
        artist=tab.artist,
        album=tab.album,
        tuning_key=tab.tuning_key,
        status=TabStatusOut(tab.status.value),
        vote_count=vote_count,
        owner_username=tab.owner.username,
        created_at=tab.created_at,
        updated_at=tab.updated_at,
    )


def tab_to_detail(tab: Tab, vote_count: int, has_voted: bool) -> TabDetail:
    return TabDetail(
        id=tab.id,
        song_name=tab.song_name,
        artist=tab.artist,
        album=tab.album,
        tuning_key=tab.tuning_key,
        tempo_bpm=tab.tempo_bpm,
        status=TabStatusOut(tab.status.value),
        vote_count=vote_count,
        owner_id=tab.owner_id,
        owner_username=tab.owner.username,
        has_voted=has_voted,
        created_at=tab.created_at,
        updated_at=tab.updated_at,
        notes=[note_to_out(n) for n in sorted(tab.notes, key=lambda n: n.position)],
    )
