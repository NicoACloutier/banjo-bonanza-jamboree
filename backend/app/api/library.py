"""A logged-in user's personal library: favorited tabs and setlists."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.msgspec_utils import MsgspecResponse, parse_json_body
from app.models.orm import Favorite, Setlist, SetlistItem, Tab, TabStatus, User, Vote
from app.schemas.schemas import (
    SetlistAddTabRequest,
    SetlistCreateRequest,
    SetlistDetail,
    SetlistUpdateRequest,
    TabListResponse,
    TabSummary,
)
from app.services.converters import setlist_to_summary, tab_to_summary

router = APIRouter(tags=["library"])

_MAX_SETLIST_NAME_LENGTH = 100
_MAX_SETLIST_TABS = 200


async def _summaries(db: AsyncSession, tabs: list[Tab]) -> list[TabSummary]:
    """Tab summaries with vote counts, in the given order (`tab.owner` must be loaded)."""
    if not tabs:
        return []
    counts = dict(
        (
            await db.execute(
                select(Vote.tab_id, func.count())
                .where(Vote.tab_id.in_({t.id for t in tabs}))
                .group_by(Vote.tab_id)
            )
        ).all()
    )
    return [tab_to_summary(t, int(counts.get(t.id, 0))) for t in tabs]


def _visible_to(tab: Tab, user: User) -> bool:
    return tab.status == TabStatus.published or tab.owner_id == user.id


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------


@router.get("/api/me/favorites")
async def list_favorites(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> MsgspecResponse:
    """The current user's favorited tabs, most recently favorited first."""
    result = await db.execute(
        select(Tab)
        .join(Favorite, Favorite.tab_id == Tab.id)
        .where(Favorite.user_id == user.id)
        .order_by(Favorite.created_at.desc())
        .options(selectinload(Tab.owner))
    )
    tabs = [t for t in result.scalars().all() if _visible_to(t, user)]
    items = await _summaries(db, tabs)
    return MsgspecResponse(TabListResponse(items=items, total=len(items), page=1, page_size=len(items)))


# ---------------------------------------------------------------------------
# Setlists (private to their owner)
# ---------------------------------------------------------------------------


def _validate_name(name: str) -> str:
    name = name.strip()
    if not name or len(name) > _MAX_SETLIST_NAME_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Setlist names must be 1-{_MAX_SETLIST_NAME_LENGTH} characters.",
        )
    return name


async def _load_own_setlist(db: AsyncSession, setlist_id: str, user: User) -> Setlist:
    result = await db.execute(
        select(Setlist)
        .where(Setlist.id == setlist_id)
        .options(selectinload(Setlist.items).selectinload(SetlistItem.tab).selectinload(Tab.owner))
        .execution_options(populate_existing=True)
    )
    setlist = result.scalar_one_or_none()
    # Someone else's setlist is reported as missing rather than forbidden, so
    # setlist ids can't be probed.
    if setlist is None or setlist.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setlist not found.")
    return setlist


async def _setlist_detail(db: AsyncSession, setlist: Setlist, user: User) -> SetlistDetail:
    # A tab its owner has since unpublished is hidden (its item remains until
    # the setlist is next saved with a new `tab_ids` list, which won't include it).
    tabs = [item.tab for item in setlist.items if _visible_to(item.tab, user)]
    return SetlistDetail(
        id=setlist.id, name=setlist.name, updated_at=setlist.updated_at, tabs=await _summaries(db, tabs)
    )


async def _check_tabs_addable(db: AsyncSession, tab_ids: list[str], user: User) -> None:
    if len(tab_ids) > _MAX_SETLIST_TABS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"A setlist can hold at most {_MAX_SETLIST_TABS} tabs."
        )
    if not tab_ids:
        return
    found = (await db.execute(select(Tab).where(Tab.id.in_(set(tab_ids))))).scalars().all()
    addable = {t.id for t in found if _visible_to(t, user)}
    missing = [tab_id for tab_id in tab_ids if tab_id not in addable]
    if missing:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Tab not found: {missing[0]}")


@router.get("/api/setlists")
async def list_setlists(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)) -> MsgspecResponse:
    result = await db.execute(
        select(Setlist)
        .where(Setlist.owner_id == user.id)
        .order_by(Setlist.updated_at.desc())
        .options(selectinload(Setlist.items))
    )
    return MsgspecResponse([setlist_to_summary(s) for s in result.scalars().all()])


@router.post("/api/setlists")
async def create_setlist(
    request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> MsgspecResponse:
    body = await parse_json_body(request, SetlistCreateRequest)
    setlist = Setlist(owner_id=user.id, name=_validate_name(body.name))
    db.add(setlist)
    await db.commit()
    setlist = await _load_own_setlist(db, setlist.id, user)
    return MsgspecResponse(await _setlist_detail(db, setlist, user), status_code=status.HTTP_201_CREATED)


@router.get("/api/setlists/{setlist_id}")
async def get_setlist(
    setlist_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> MsgspecResponse:
    setlist = await _load_own_setlist(db, setlist_id, user)
    return MsgspecResponse(await _setlist_detail(db, setlist, user))


@router.put("/api/setlists/{setlist_id}")
async def update_setlist(
    setlist_id: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> MsgspecResponse:
    """Rename a setlist and replace its contents with `tab_ids`, in order."""
    body = await parse_json_body(request, SetlistUpdateRequest)
    setlist = await _load_own_setlist(db, setlist_id, user)
    setlist.name = _validate_name(body.name)
    await _check_tabs_addable(db, body.tab_ids, user)

    await db.execute(SetlistItem.__table__.delete().where(SetlistItem.setlist_id == setlist.id))
    for position, tab_id in enumerate(body.tab_ids):
        db.add(SetlistItem(setlist_id=setlist.id, tab_id=tab_id, position=position))
    setlist.updated_at = func.now()
    await db.commit()
    return MsgspecResponse(await _setlist_detail(db, await _load_own_setlist(db, setlist_id, user), user))


@router.post("/api/setlists/{setlist_id}/tabs")
async def add_tab_to_setlist(
    setlist_id: str, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> MsgspecResponse:
    """Append a tab to the end of a setlist."""
    body = await parse_json_body(request, SetlistAddTabRequest)
    setlist = await _load_own_setlist(db, setlist_id, user)
    await _check_tabs_addable(db, [*(item.tab_id for item in setlist.items), body.tab_id], user)

    next_position = max((item.position for item in setlist.items), default=-1) + 1
    db.add(SetlistItem(setlist_id=setlist.id, tab_id=body.tab_id, position=next_position))
    setlist.updated_at = func.now()
    await db.commit()
    return MsgspecResponse(await _setlist_detail(db, await _load_own_setlist(db, setlist_id, user), user))


@router.delete("/api/setlists/{setlist_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_setlist(
    setlist_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    setlist = await _load_own_setlist(db, setlist_id, user)
    await db.delete(setlist)
    await db.commit()
