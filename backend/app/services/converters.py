"""Converters between SQLAlchemy ORM models and msgspec API schemas."""

from __future__ import annotations

import msgspec

from app.models.orm import Note, NoteFret, RightHandFinger, Setlist, Tab, TabRevision, User
from app.schemas.schemas import (
    ForkSource,
    NoteFretOut,
    NoteIn,
    NoteOut,
    RightHandFingerOut,
    SetlistSummary,
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
        thumb_after=note.thumb_after,
        dotted=note.dotted,
        triplet=note.triplet,
        tied=note.tied,
        chord=note.chord,
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
        style=tab.style,
        song_key=tab.song_key,
        difficulty=tab.difficulty,
    )


def tab_to_detail(tab: Tab, vote_count: int, has_voted: bool, is_favorited: bool = False) -> TabDetail:
    """`tab.forked_from` (and its owner) must be eager-loaded."""
    source = tab.forked_from
    return TabDetail(
        id=tab.id,
        song_name=tab.song_name,
        artist=tab.artist,
        album=tab.album,
        tuning_key=tab.tuning_key,
        tempo_bpm=tab.tempo_bpm,
        capo_fret=tab.capo_fret,
        bars_per_line=tab.bars_per_line,
        clawhammer_timing=tab.clawhammer_timing,
        status=TabStatusOut(tab.status.value),
        vote_count=vote_count,
        owner_id=tab.owner_id,
        owner_username=tab.owner.username,
        has_voted=has_voted,
        created_at=tab.created_at,
        updated_at=tab.updated_at,
        notes=[note_to_out(n) for n in sorted(tab.notes, key=lambda n: n.position)],
        time_signature=tab.time_signature,
        swing=tab.swing,
        fifth_string_capo_fret=tab.fifth_string_capo_fret,
        style=tab.style,
        song_key=tab.song_key,
        difficulty=tab.difficulty,
        is_favorited=is_favorited,
        forked_from=(
            ForkSource(id=source.id, song_name=source.song_name, owner_username=source.owner.username)
            if source is not None
            else None
        ),
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
            thumb_after=n.thumb_after,
            dotted=n.dotted,
            triplet=n.triplet,
            tied=n.tied,
            chord=n.chord,
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
        clawhammer_timing=snapshot.get("clawhammer_timing", False),
        notes=notes_out,
        time_signature=snapshot.get("time_signature"),
        swing=snapshot.get("swing", False),
        fifth_string_capo_fret=snapshot.get("fifth_string_capo_fret"),
        style=snapshot.get("style"),
        song_key=snapshot.get("song_key"),
        difficulty=snapshot.get("difficulty"),
    )


def setlist_to_summary(setlist: Setlist) -> SetlistSummary:
    """`setlist.items` must be eager-loaded."""
    return SetlistSummary(
        id=setlist.id, name=setlist.name, tab_count=len(setlist.items), updated_at=setlist.updated_at
    )
