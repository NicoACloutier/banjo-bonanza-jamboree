"""Converters between SQLAlchemy ORM models and msgspec API schemas."""

from __future__ import annotations

import msgspec

from app.models.orm import Note, NoteFret, RightHandFinger, Tab, TabRevision, User
from app.schemas.schemas import (
    NoteFretOut,
    NoteIn,
    NoteOut,
    RightHandFingerOut,
    TabDetail,
    TabRevisionDetail,
    TabRevisionSummary,
    TabSummary,
    TabStatusOut,
    TechniqueOut,
    UserPublic,
)


def user_to_public(user: User) -> UserPublic:
    return UserPublic(id=user.id, username=user.username, created_at=user.created_at)


def note_fret_to_out(fret: NoteFret) -> NoteFretOut:
    return NoteFretOut(
        string_number=fret.string_number,
        fret=fret.fret,
        technique=TechniqueOut(fret.technique.value),
        slide_to_fret=fret.slide_to_fret,
        bend_semitones=fret.bend_semitones,
        right_hand_finger=RightHandFingerOut(fret.right_hand_finger.value) if fret.right_hand_finger else None,
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
        capo_fret=tab.capo_fret,
        bars_per_line=tab.bars_per_line,
        status=TabStatusOut(tab.status.value),
        vote_count=vote_count,
        owner_id=tab.owner_id,
        owner_username=tab.owner.username,
        has_voted=has_voted,
        created_at=tab.created_at,
        updated_at=tab.updated_at,
        notes=[note_to_out(n) for n in sorted(tab.notes, key=lambda n: n.position)],
    )


def tab_revision_to_summary(revision: TabRevision) -> TabRevisionSummary:
    snapshot = msgspec.json.decode(revision.snapshot_json, type=dict)
    return TabRevisionSummary(
        id=revision.id,
        created_at=revision.created_at,
        song_name=snapshot["song_name"],
        note_count=len(snapshot.get("notes", [])),
    )


def tab_revision_to_detail(revision: TabRevision) -> TabRevisionDetail:
    snapshot = msgspec.json.decode(revision.snapshot_json, type=dict)
    notes_in = msgspec.convert(snapshot.get("notes", []), type=list[NoteIn])
    notes_out = [
        NoteOut(
            id=f"revision-{revision.id}-{i}",
            position=n.position,
            duration_beats=n.duration_beats,
            line_break=n.line_break,
            lyric=n.lyric,
            is_rest=n.is_rest,
            frets=[
                NoteFretOut(
                    string_number=f.string_number,
                    fret=f.fret,
                    technique=f.technique,
                    slide_to_fret=f.slide_to_fret,
                    bend_semitones=f.bend_semitones,
                    right_hand_finger=f.right_hand_finger,
                )
                for f in n.frets
            ],
        )
        for i, n in enumerate(notes_in)
    ]
    return TabRevisionDetail(
        id=revision.id,
        tab_id=revision.tab_id,
        created_at=revision.created_at,
        song_name=snapshot["song_name"],
        artist=snapshot.get("artist"),
        album=snapshot.get("album"),
        tuning_key=snapshot["tuning_key"],
        tempo_bpm=snapshot.get("tempo_bpm", 100),
        capo_fret=snapshot.get("capo_fret", 0),
        bars_per_line=snapshot.get("bars_per_line", 4),
        notes=notes_out,
    )
