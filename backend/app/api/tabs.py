"""Tab CRUD, publishing, voting, and search endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import ANONYMOUS_USERNAME, get_current_user, get_optional_user
from app.core.msgspec_utils import MsgspecResponse, parse_json_body
from app.core.tunings import TUNINGS, get_tuning
from app.models.orm import Lyric, Note, Tab, TabStatus, User, Vote
from app.schemas.schemas import (
    TabCreateRequest,
    TabDetail,
    TabListResponse,
    TabSummary,
    TabUpdateRequest,
    VoteResponse,
)
from app.services.converters import tab_to_detail, tab_to_summary
from app.services.moderation import find_offending_fields

router = APIRouter(prefix="/api/tabs", tags=["tabs"])

_TAB_LOAD_OPTIONS = (selectinload(Tab.owner), selectinload(Tab.notes).selectinload(Note.lyric))


async def _get_or_create_anonymous_user(db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.username == ANONYMOUS_USERNAME))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(username=ANONYMOUS_USERNAME, email=None, hashed_password=None)
        db.add(user)
        await db.flush()
    return user


async def _vote_count(db: AsyncSession, tab_id: str) -> int:
    result = await db.execute(select(func.count()).select_from(Vote).where(Vote.tab_id == tab_id))
    return int(result.scalar_one())


async def _has_voted(db: AsyncSession, tab_id: str, user_id: str | None) -> bool:
    if not user_id:
        return False
    result = await db.execute(
        select(Vote).where(Vote.tab_id == tab_id, Vote.user_id == user_id)
    )
    return result.scalar_one_or_none() is not None


def _validate_tuning(tuning_key: str) -> None:
    if tuning_key not in TUNINGS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown tuning: {tuning_key}")


def _validate_notes(notes_in) -> None:
    """
    Validate note fields server-side so malformed data (e.g. an out-of-range
    string number) can never be persisted and later crash frontend playback
    scheduling, which indexes `tuning.open_strings[string_number - 1]` with
    no bounds check of its own.
    """
    for i, note in enumerate(notes_in):
        if not (1 <= note.string_number <= 5):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Note {i}: string_number must be between 1 and 5.",
            )
        if note.fret < 0 or note.fret > 24:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Note {i}: fret must be between 0 and 24.",
            )
        if note.duration_beats <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Note {i}: duration_beats must be positive.",
            )


async def _replace_notes(db: AsyncSession, tab: Tab, notes_in) -> None:
    """
    Replace all notes (and their lyrics) belonging to `tab`.

    We delete existing rows with an explicit DELETE statement and insert new
    ones directly, rather than mutating the `tab.notes` ORM relationship
    collection -- this avoids triggering an implicit lazy-load of that
    collection, which is disallowed on an AsyncSession outside of an
    explicit `await`/eager-load.
    """
    await db.execute(Note.__table__.delete().where(Note.tab_id == tab.id))
    for note_in in notes_in:
        note = Note(
            tab_id=tab.id,
            position=note_in.position,
            string_number=note_in.string_number,
            fret=note_in.fret,
            duration_beats=note_in.duration_beats,
            line_break=note_in.line_break,
            is_rest=note_in.is_rest,
        )
        db.add(note)
        await db.flush()
        if note_in.lyric:
            db.add(Lyric(tab_id=tab.id, note_id=note.id, text=note_in.lyric))


def _check_moderation(song_name: str, artist: str | None, album: str | None, notes_in) -> None:
    fields = {"song_name": song_name, "artist": artist, "album": album}
    for i, note in enumerate(notes_in):
        if note.lyric:
            fields[f"lyric[{i}]"] = note.lyric
    offending = find_offending_fields(fields)
    if offending:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                "This tab contains language that is not allowed (offensive or insensitive "
                f"content detected in: {', '.join(offending)}). Please edit and try again."
            ),
        )


@router.post("")
async def create_tab(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> MsgspecResponse:
    body = await parse_json_body(request, TabCreateRequest)
    _validate_tuning(body.tuning_key)
    _validate_notes(body.notes)

    if user is None:
        # Anonymous users may only create tabs directly (published immediately);
        # they cannot save drafts.
        if not body.publish:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Log in to save drafts. Anonymous tabs are published immediately.",
            )
        owner = await _get_or_create_anonymous_user(db)
    else:
        owner = user

    if body.publish:
        _check_moderation(body.song_name, body.artist, body.album, body.notes)

    tab = Tab(
        owner_id=owner.id,
        song_name=body.song_name.strip(),
        artist=(body.artist or None),
        album=(body.album or None),
        tuning_key=body.tuning_key,
        tempo_bpm=max(20, min(400, body.tempo_bpm)),
        status=TabStatus.published if body.publish else TabStatus.draft,
    )
    db.add(tab)
    await db.flush()
    await _replace_notes(db, tab, body.notes)
    await db.commit()

    result = await db.execute(
        select(Tab).where(Tab.id == tab.id).options(*_TAB_LOAD_OPTIONS)
    )
    tab = result.scalar_one()
    return MsgspecResponse(
        tab_to_detail(tab, vote_count=0, has_voted=False), status_code=status.HTTP_201_CREATED
    )


@router.get("")
async def search_tabs(
    q: str | None = Query(default=None, description="Search text for song name"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> MsgspecResponse:
    """Search published tabs by song name, sorted by vote count (descending)."""
    vote_count_subq = (
        select(Vote.tab_id, func.count().label("vote_count")).group_by(Vote.tab_id).subquery()
    )
    base_query = (
        select(Tab, func.coalesce(vote_count_subq.c.vote_count, 0))
        .outerjoin(vote_count_subq, Tab.id == vote_count_subq.c.tab_id)
        .where(Tab.status == TabStatus.published)
        .options(selectinload(Tab.owner))
    )
    if q:
        base_query = base_query.where(or_(Tab.song_name.ilike(f"%{q}%")))

    count_query = select(func.count()).select_from(Tab).where(Tab.status == TabStatus.published)
    if q:
        count_query = count_query.where(Tab.song_name.ilike(f"%{q}%"))
    total = int((await db.execute(count_query)).scalar_one())

    base_query = (
        base_query.order_by(func.coalesce(vote_count_subq.c.vote_count, 0).desc(), Tab.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(base_query)).all()
    items = [tab_to_summary(tab, vote_count) for tab, vote_count in rows]
    return MsgspecResponse(
        TabListResponse(items=items, total=total, page=page, page_size=page_size)
    )


@router.get("/tunings")
async def list_tunings() -> MsgspecResponse:
    from app.schemas.schemas import TuningOut

    return MsgspecResponse(
        [
            TuningOut(
                key=t.key, display_name=t.display_name, open_strings=t.open_strings, description=t.description
            )
            for t in TUNINGS.values()
        ]
    )


@router.get("/{tab_id}")
async def get_tab(
    tab_id: str,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> MsgspecResponse:
    result = await db.execute(select(Tab).where(Tab.id == tab_id).options(*_TAB_LOAD_OPTIONS))
    tab = result.scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")
    if tab.status == TabStatus.draft and (user is None or user.id != tab.owner_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")

    votes = await _vote_count(db, tab.id)
    voted = await _has_voted(db, tab.id, user.id if user else None)
    return MsgspecResponse(tab_to_detail(tab, vote_count=votes, has_voted=voted))


@router.put("/{tab_id}")
async def update_tab(
    tab_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MsgspecResponse:
    body = await parse_json_body(request, TabUpdateRequest)
    _validate_tuning(body.tuning_key)
    _validate_notes(body.notes)

    result = await db.execute(select(Tab).where(Tab.id == tab_id).options(*_TAB_LOAD_OPTIONS))
    tab = result.scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")
    if tab.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tab.")

    if body.publish:
        _check_moderation(body.song_name, body.artist, body.album, body.notes)

    tab.song_name = body.song_name.strip()
    tab.artist = body.artist or None
    tab.album = body.album or None
    tab.tuning_key = body.tuning_key
    tab.tempo_bpm = max(20, min(400, body.tempo_bpm))
    tab.status = TabStatus.published if body.publish else TabStatus.draft
    await _replace_notes(db, tab, body.notes)
    await db.commit()

    result = await db.execute(select(Tab).where(Tab.id == tab_id).options(*_TAB_LOAD_OPTIONS))
    tab = result.scalar_one()
    votes = await _vote_count(db, tab.id)
    voted = await _has_voted(db, tab.id, user.id)
    return MsgspecResponse(tab_to_detail(tab, vote_count=votes, has_voted=voted))


@router.delete("/{tab_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_tab(
    tab_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    result = await db.execute(select(Tab).where(Tab.id == tab_id))
    tab = result.scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")
    if tab.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tab.")
    await db.delete(tab)
    await db.commit()


@router.post("/{tab_id}/vote")
async def vote_tab(
    tab_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> MsgspecResponse:
    """Toggle the current user's thumbs-up vote on a published tab."""
    result = await db.execute(select(Tab).where(Tab.id == tab_id))
    tab = result.scalar_one_or_none()
    if tab is None or tab.status != TabStatus.published:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")

    existing = await db.execute(
        select(Vote).where(Vote.tab_id == tab_id, Vote.user_id == user.id)
    )
    existing_vote = existing.scalar_one_or_none()
    if existing_vote is not None:
        await db.delete(existing_vote)
        has_voted = False
        await db.commit()
    else:
        db.add(Vote(tab_id=tab_id, user_id=user.id))
        has_voted = True
        try:
            await db.commit()
        except IntegrityError:
            # A concurrent request (e.g. a double-click or retried request)
            # already inserted this user's vote for this tab between our
            # SELECT and INSERT. Roll back and treat the vote as already
            # present, so the toggle stays idempotent instead of raising a
            # 500 for what is really just a race, not a real error.
            await db.rollback()
            has_voted = True

    votes = await _vote_count(db, tab_id)
    return MsgspecResponse(VoteResponse(tab_id=tab_id, vote_count=votes, has_voted=has_voted))
