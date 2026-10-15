"""A logged-in user's personal library: favorited tabs."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.msgspec_utils import MsgspecResponse, parse_json_body
from app.models.orm import Favorite, Tab, TabStatus, User, Vote
from app.schemas.schemas import TabListResponse, TabSummary
from app.services.converters import tab_to_summary

router = APIRouter(tags=["library"])


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
