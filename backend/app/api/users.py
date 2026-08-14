"""User profile / user-scoped tab listing endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_optional_user
from app.core.msgspec_utils import MsgspecResponse
from app.models.orm import Tab, TabStatus, User, Vote
from app.schemas.schemas import TabListResponse, UserPublic
from app.services.converters import tab_to_summary, user_to_public

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("/{username}")
async def get_user(username: str, db: AsyncSession = Depends(get_db)) -> MsgspecResponse:
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")
    return MsgspecResponse(user_to_public(user))


@router.get("/{username}/tabs")
async def get_user_tabs(
    username: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    viewer: User | None = Depends(get_optional_user),
) -> MsgspecResponse:
    """
    List a user's tabs. Published tabs are visible to everyone; drafts are
    only visible to the owner viewing their own profile.
    """
    result = await db.execute(select(User).where(User.username == username))
    owner = result.scalar_one_or_none()
    if owner is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found.")

    is_self = viewer is not None and viewer.id == owner.id
    query = select(Tab).where(Tab.owner_id == owner.id).options(selectinload(Tab.owner))
    count_query = select(func.count()).select_from(Tab).where(Tab.owner_id == owner.id)
    if not is_self:
        query = query.where(Tab.status == TabStatus.published)
        count_query = count_query.where(Tab.status == TabStatus.published)

    total = int((await db.execute(count_query)).scalar_one())
    query = query.order_by(Tab.updated_at.desc()).offset((page - 1) * page_size).limit(page_size)
    tabs = (await db.execute(query)).scalars().all()

    items = []
    for tab in tabs:
        vote_count = int(
            (
                await db.execute(select(func.count()).select_from(Vote).where(Vote.tab_id == tab.id))
            ).scalar_one()
        )
        items.append(tab_to_summary(tab, vote_count))

    return MsgspecResponse(TabListResponse(items=items, total=total, page=page, page_size=page_size))
