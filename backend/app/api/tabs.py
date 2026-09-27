"""Tab CRUD, publishing, voting, and search endpoints."""

from __future__ import annotations

import re

import msgspec
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import ANONYMOUS_USERNAME, get_current_user, get_optional_user
from app.core.msgspec_utils import MsgspecResponse, parse_json_body
from app.core.tunings import TUNINGS, get_tuning
from app.models.orm import (
    Favorite,
    Lyric,
    Note,
    NoteFret,
    NoteTechnique,
    RightHandFinger,
    Tab,
    TabRevision,
    TabStatus,
    User,
    Vote,
)
from app.schemas.schemas import (
    NoteFretIn,
    NoteIn,
    RightHandFingerOut,
    FavoriteResponse,
    TabCreateRequest,
    TabDetail,
    TabListResponse,
    TabRevisionDetail,
    TabRevisionSummary,
    TabSummary,
    TabUpdateRequest,
    TechniqueOut,
    VoteResponse,
)
from app.services.converters import (
    tab_revision_to_detail,
    tab_revision_to_summary,
    tab_to_detail,
    tab_to_summary,
)

router = APIRouter(prefix="/api/tabs", tags=["tabs"])

_TAB_LOAD_OPTIONS = (
    selectinload(Tab.owner),
    selectinload(Tab.notes).selectinload(Note.lyric),
    selectinload(Tab.notes).selectinload(Note.frets),
    selectinload(Tab.forked_from).selectinload(Tab.owner),
)

_MAX_REVISIONS_PER_TAB = 50
_MAX_CAPO_FRET = 12
_VALID_BARS_PER_LINE = {1, 2, 4}
TIME_SIGNATURES = {"2/4", "3/4", "4/4", "6/8"}
STYLES = {"scruggs", "clawhammer", "melodic", "single_string", "old_time", "other"}
DIFFICULTIES = {"beginner", "intermediate", "advanced"}
# A key is a tonic, optionally sharp/flat, optionally minor: "G", "Bb", "F#m".
_KEY_PATTERN = re.compile(r"^[A-G][#b]?m?$")
_MAX_CHORD_NAME_LENGTH = 16


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


async def _is_favorited(db: AsyncSession, tab_id: str, user_id: str | None) -> bool:
    if not user_id:
        return False
    result = await db.execute(select(Favorite.id).where(Favorite.tab_id == tab_id, Favorite.user_id == user_id))
    return result.scalar_one_or_none() is not None


async def _load_tab(db: AsyncSession, tab_id: str) -> Tab | None:
    result = await db.execute(
        select(Tab).where(Tab.id == tab_id).options(*_TAB_LOAD_OPTIONS).execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


async def _detail_response(
    db: AsyncSession, tab: Tab, user: User | None, status_code: int = status.HTTP_200_OK
) -> MsgspecResponse:
    user_id = user.id if user else None
    return MsgspecResponse(
        tab_to_detail(
            tab,
            vote_count=await _vote_count(db, tab.id),
            has_voted=await _has_voted(db, tab.id, user_id),
            is_favorited=await _is_favorited(db, tab.id, user_id),
        ),
        status_code=status_code,
    )


def _validate_tuning(tuning_key: str) -> None:
    if tuning_key not in TUNINGS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown tuning: {tuning_key}")


def _validate_capo(capo_fret: int) -> None:
    if not (0 <= capo_fret <= _MAX_CAPO_FRET):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"capo_fret must be between 0 and {_MAX_CAPO_FRET}.",
        )


def _validate_bars_per_line(bars_per_line: int) -> None:
    if bars_per_line not in _VALID_BARS_PER_LINE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="bars_per_line must be 1, 2, or 4.",
        )


def _bad_request(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


def _validate_tab_request(body: TabCreateRequest | TabUpdateRequest) -> None:
    """Validate every field of a create/update request (or a revision snapshot)."""
    _validate_tuning(body.tuning_key)
    _validate_capo(body.capo_fret)
    _validate_bars_per_line(body.bars_per_line)
    if body.time_signature is not None and body.time_signature not in TIME_SIGNATURES:
        raise _bad_request(f"time_signature must be one of {sorted(TIME_SIGNATURES)}.")
    fifth = body.fifth_string_capo_fret
    if fifth is not None and fifth != 0 and not (6 <= fifth <= _MAX_CAPO_FRET):
        raise _bad_request(f"fifth_string_capo_fret must be 0 (open) or between 6 and {_MAX_CAPO_FRET}.")
    if body.style is not None and body.style not in STYLES:
        raise _bad_request(f"style must be one of {sorted(STYLES)}.")
    if body.song_key is not None and not _KEY_PATTERN.match(body.song_key):
        raise _bad_request('song_key must look like "G", "Bb" or "F#m".')
    if body.difficulty is not None and body.difficulty not in DIFFICULTIES:
        raise _bad_request(f"difficulty must be one of {sorted(DIFFICULTIES)}.")
    _validate_notes(body.notes)


def _apply_tab_request(tab: Tab, body: TabCreateRequest | TabUpdateRequest) -> None:
    """Copy a validated request's tab-level fields onto `tab` (notes are handled by `_replace_notes`)."""
    tab.song_name = body.song_name.strip()
    tab.artist = body.artist or None
    tab.album = body.album or None
    tab.tuning_key = body.tuning_key
    tab.tempo_bpm = max(20, min(400, body.tempo_bpm))
    tab.capo_fret = body.capo_fret
    tab.bars_per_line = body.bars_per_line
    tab.clawhammer_timing = body.clawhammer_timing
    tab.time_signature = body.time_signature
    tab.swing = body.swing
    tab.fifth_string_capo_fret = body.fifth_string_capo_fret
    tab.style = body.style
    tab.song_key = body.song_key
    tab.difficulty = body.difficulty
    tab.status = TabStatus.published if body.publish else TabStatus.draft


def _validate_notes(notes_in) -> None:
    """
    Validate note fields server-side so malformed data (e.g. an out-of-range
    string number, duplicate strings in a chord, or a nonsensical slide) can
    never be persisted and later crash frontend playback scheduling/
    rendering.
    """
    for i, note in enumerate(notes_in):
        if note.duration_beats <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Note {i}: duration_beats must be positive.",
            )
        if note.chord is not None and len(note.chord) > _MAX_CHORD_NAME_LENGTH:
            raise _bad_request(f"Note {i}: chord names can be at most {_MAX_CHORD_NAME_LENGTH} characters.")
        if note.is_rest:
            if note.frets:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Note {i}: a rest cannot have any frets.",
                )
            continue
        # A non-rest note with zero frets is allowed: it is simply an
        # unfilled placeholder slot (e.g. a freshly-added empty note the
        # user hasn't tabbed yet). It sounds nothing during playback --
        # identical to a rest -- but is displayed as dashes rather than a
        # blank gap, and can still be published in that state.
        if not note.frets:
            continue
        if len(note.frets) > 5:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Note {i}: a banjo only has 5 strings.",
            )
        seen_strings: set[int] = set()
        for fret_in in note.frets:
            if not (1 <= fret_in.string_number <= 5):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Note {i}: string_number must be between 1 and 5.",
                )
            if fret_in.string_number in seen_strings:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Note {i}: string {fret_in.string_number} is used more than once (a string can only sound once per chord).",
                )
            seen_strings.add(fret_in.string_number)
            if fret_in.fret < 0 or fret_in.fret > 24:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Note {i}: fret must be between 0 and 24.",
                )
            if fret_in.technique.value == "slide":
                if fret_in.slide_to_fret is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Note {i}: a slide must specify slide_to_fret.",
                    )
                if fret_in.slide_to_fret < 0 or fret_in.slide_to_fret > 24:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Note {i}: slide_to_fret must be between 0 and 24.",
                    )
                if fret_in.slide_to_fret == fret_in.fret:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Note {i}: a slide must move to a different fret.",
                    )
            elif fret_in.slide_to_fret is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Note {i}: slide_to_fret is only valid when technique is 'slide'.",
                )
            if fret_in.technique.value == "bend":
                if fret_in.bend_semitones is None:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Note {i}: a bend must specify bend_semitones.",
                    )
                if not (1 <= fret_in.bend_semitones <= 12):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Note {i}: bend_semitones must be between 1 and 12.",
                    )
            elif fret_in.bend_semitones is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Note {i}: bend_semitones is only valid when technique is 'bend'.",
                )


async def _replace_notes(db: AsyncSession, tab: Tab, notes_in) -> None:
    """
    Replace all notes (and their frets/lyrics) belonging to `tab`.

    We delete existing rows with an explicit DELETE statement and insert new
    ones directly, rather than mutating the `tab.notes` ORM relationship
    collection -- this avoids triggering an implicit lazy-load of that
    collection, which is disallowed on an AsyncSession outside of an
    explicit `await`/eager-load. `note_frets` rows cascade-delete with their
    parent `notes` row at the database level (ondelete="CASCADE").
    """
    await db.execute(Note.__table__.delete().where(Note.tab_id == tab.id))
    for note_in in notes_in:
        note = Note(
            tab_id=tab.id,
            position=note_in.position,
            duration_beats=note_in.duration_beats,
            line_break=note_in.line_break,
            is_rest=note_in.is_rest,
            thumb_after=note_in.thumb_after,
            dotted=note_in.dotted,
            triplet=note_in.triplet,
            tied=note_in.tied,
            chord=note_in.chord or None,
        )
        db.add(note)
        await db.flush()
        for fret_in in note_in.frets:
            db.add(
                NoteFret(
                    note_id=note.id,
                    string_number=fret_in.string_number,
                    fret=fret_in.fret,
                    technique=NoteTechnique(fret_in.technique.value),
                    slide_to_fret=fret_in.slide_to_fret,
                    bend_semitones=fret_in.bend_semitones,
                    right_hand_finger=(
                        RightHandFinger(fret_in.right_hand_finger.value) if fret_in.right_hand_finger else None
                    ),
                )
            )
        if note_in.lyric:
            db.add(Lyric(tab_id=tab.id, note_id=note.id, text=note_in.lyric))


def _tab_as_request(tab: Tab) -> TabUpdateRequest:
    """The tab's current editable state, in request form (`tab.notes` must be eager-loaded)."""
    return TabUpdateRequest(
        song_name=tab.song_name,
        tuning_key=tab.tuning_key,
        artist=tab.artist,
        album=tab.album,
        tempo_bpm=tab.tempo_bpm,
        capo_fret=tab.capo_fret,
        bars_per_line=tab.bars_per_line,
        clawhammer_timing=tab.clawhammer_timing,
        time_signature=tab.time_signature,
        swing=tab.swing,
        fifth_string_capo_fret=tab.fifth_string_capo_fret,
        style=tab.style,
        song_key=tab.song_key,
        difficulty=tab.difficulty,
        notes=[
            NoteIn(
                position=n.position,
                duration_beats=n.duration_beats,
                line_break=n.line_break,
                lyric=n.lyric.text if n.lyric else None,
                is_rest=n.is_rest,
                thumb_after=n.thumb_after,
                dotted=n.dotted,
                triplet=n.triplet,
                tied=n.tied,
                chord=n.chord,
                frets=[
                    NoteFretIn(
                        string_number=f.string_number,
                        fret=f.fret,
                        technique=TechniqueOut(f.technique.value),
                        slide_to_fret=f.slide_to_fret,
                        bend_semitones=f.bend_semitones,
                        right_hand_finger=(
                            RightHandFingerOut(f.right_hand_finger.value) if f.right_hand_finger else None
                        ),
                    )
                    for f in sorted(n.frets, key=lambda f: f.string_number)
                ],
            )
            for n in sorted(tab.notes, key=lambda n: n.position)
        ],
        publish=tab.status == TabStatus.published,
    )


async def _save_revision_snapshot(db: AsyncSession, tab: Tab) -> None:
    """
    Persist a JSON snapshot of the tab's *current* editable state (before
    the caller applies new changes to it), so the owner can browse/restore
    history later. Also prunes the oldest revisions beyond
    `_MAX_REVISIONS_PER_TAB` to bound storage.
    """
    encoded = msgspec.json.encode(_tab_as_request(tab))
    db.add(TabRevision(tab_id=tab.id, snapshot_json=encoded.decode("utf-8")))
    await db.flush()

    result = await db.execute(
        select(TabRevision.id)
        .where(TabRevision.tab_id == tab.id)
        .order_by(TabRevision.created_at.desc())
        .offset(_MAX_REVISIONS_PER_TAB)
    )
    stale_ids = [row[0] for row in result.all()]
    if stale_ids:
        await db.execute(TabRevision.__table__.delete().where(TabRevision.id.in_(stale_ids)))


@router.post("")
async def create_tab(
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
) -> MsgspecResponse:
    body = await parse_json_body(request, TabCreateRequest)
    _validate_tab_request(body)

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

    tab = Tab(owner_id=owner.id)
    _apply_tab_request(tab, body)
    db.add(tab)
    await db.flush()
    await _replace_notes(db, tab, body.notes)
    await db.commit()

    return await _detail_response(db, await _load_tab(db, tab.id), user, status_code=status.HTTP_201_CREATED)


@router.get("")
async def search_tabs(
    q: str | None = Query(default=None, description="Search text for song name"),
    style: str | None = Query(default=None),
    difficulty: str | None = Query(default=None),
    tuning: str | None = Query(default=None, description="Tuning key, e.g. standard_g"),
    song_key: str | None = Query(default=None, description='Song key, e.g. "G" or "Am"'),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
) -> MsgspecResponse:
    """Search published tabs by song name (and optional filters), sorted by vote count (descending)."""
    filters = [Tab.status == TabStatus.published]
    if q:
        filters.append(Tab.song_name.ilike(f"%{q}%"))
    if style:
        filters.append(Tab.style == style)
    if difficulty:
        filters.append(Tab.difficulty == difficulty)
    if tuning:
        filters.append(Tab.tuning_key == tuning)
    if song_key:
        filters.append(Tab.song_key == song_key)

    vote_count_subq = (
        select(Vote.tab_id, func.count().label("vote_count")).group_by(Vote.tab_id).subquery()
    )
    base_query = (
        select(Tab, func.coalesce(vote_count_subq.c.vote_count, 0))
        .outerjoin(vote_count_subq, Tab.id == vote_count_subq.c.tab_id)
        .where(*filters)
        .options(selectinload(Tab.owner))
    )
    count_query = select(func.count()).select_from(Tab).where(*filters)
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

    return await _detail_response(db, tab, user)


@router.put("/{tab_id}")
async def update_tab(
    tab_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MsgspecResponse:
    body = await parse_json_body(request, TabUpdateRequest)
    _validate_tab_request(body)

    result = await db.execute(select(Tab).where(Tab.id == tab_id).options(*_TAB_LOAD_OPTIONS))
    tab = result.scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")
    if tab.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tab.")

    # Snapshot the tab's state *before* applying the incoming changes, so
    # this becomes a restorable point in its revision history.
    await _save_revision_snapshot(db, tab)

    _apply_tab_request(tab, body)
    await _replace_notes(db, tab, body.notes)
    await db.commit()

    return await _detail_response(db, await _load_tab(db, tab_id), user)


@router.get("/{tab_id}/revisions")
async def list_tab_revisions(
    tab_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MsgspecResponse:
    """List revision history (newest first) for a tab the caller owns."""
    tab = (await db.execute(select(Tab).where(Tab.id == tab_id))).scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")
    if tab.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tab.")

    result = await db.execute(
        select(TabRevision).where(TabRevision.tab_id == tab_id).order_by(TabRevision.created_at.desc())
    )
    revisions = result.scalars().all()
    return MsgspecResponse([tab_revision_to_summary(r) for r in revisions])


@router.get("/{tab_id}/revisions/{revision_id}")
async def get_tab_revision(
    tab_id: str,
    revision_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MsgspecResponse:
    """Fetch the full snapshot of one past revision, for preview before restoring."""
    tab = (await db.execute(select(Tab).where(Tab.id == tab_id))).scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")
    if tab.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tab.")

    revision = (
        await db.execute(
            select(TabRevision).where(TabRevision.id == revision_id, TabRevision.tab_id == tab_id)
        )
    ).scalar_one_or_none()
    if revision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revision not found.")
    return MsgspecResponse(tab_revision_to_detail(revision))


@router.post("/{tab_id}/revisions/{revision_id}/restore")
async def restore_tab_revision(
    tab_id: str,
    revision_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MsgspecResponse:
    """
    Restore a tab to a past revision's content. The tab's *current* state is
    itself snapshotted first, so restoring is non-destructive and can
    always be undone by restoring the newly-created "pre-restore" revision.
    """
    result = await db.execute(select(Tab).where(Tab.id == tab_id).options(*_TAB_LOAD_OPTIONS))
    tab = result.scalar_one_or_none()
    if tab is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")
    if tab.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not own this tab.")

    revision = (
        await db.execute(
            select(TabRevision).where(TabRevision.id == revision_id, TabRevision.tab_id == tab_id)
        )
    ).scalar_one_or_none()
    if revision is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Revision not found.")

    snapshot = msgspec.json.decode(revision.snapshot_json, type=TabUpdateRequest)
    _validate_tab_request(snapshot)

    await _save_revision_snapshot(db, tab)

    _apply_tab_request(tab, snapshot)
    await _replace_notes(db, tab, snapshot.notes)
    await db.commit()

    return await _detail_response(db, await _load_tab(db, tab_id), user)


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


@router.post("/{tab_id}/favorite")
async def favorite_tab(
    tab_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> MsgspecResponse:
    """Toggle the current user's favorite (bookmark) on a tab they can see."""
    tab = (await db.execute(select(Tab).where(Tab.id == tab_id))).scalar_one_or_none()
    if tab is None or (tab.status != TabStatus.published and tab.owner_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")

    existing = (
        await db.execute(select(Favorite).where(Favorite.tab_id == tab_id, Favorite.user_id == user.id))
    ).scalar_one_or_none()
    if existing is not None:
        await db.delete(existing)
        await db.commit()
        return MsgspecResponse(FavoriteResponse(tab_id=tab_id, is_favorited=False))
    db.add(Favorite(tab_id=tab_id, user_id=user.id))
    try:
        await db.commit()
    except IntegrityError:
        # A concurrent request already favorited it (see vote_tab).
        await db.rollback()
    return MsgspecResponse(FavoriteResponse(tab_id=tab_id, is_favorited=True))


@router.post("/{tab_id}/fork")
async def fork_tab(
    tab_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> MsgspecResponse:
    """Copy a tab (published, or the caller's own) into a new draft owned by the caller."""
    source = await _load_tab(db, tab_id)
    if source is None or (source.status != TabStatus.published and source.owner_id != user.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tab not found.")

    copy = _tab_as_request(source)
    copy.publish = False
    fork = Tab(owner_id=user.id, forked_from_id=source.id)
    _apply_tab_request(fork, copy)
    db.add(fork)
    await db.flush()
    await _replace_notes(db, fork, copy.notes)
    await db.commit()

    return await _detail_response(db, await _load_tab(db, fork.id), user, status_code=status.HTTP_201_CREATED)
