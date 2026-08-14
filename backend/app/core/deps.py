"""
FastAPI dependencies for authentication.

`get_current_user` requires a valid access token.
`get_optional_user` allows anonymous access (returns None if no/invalid
token) -- used by endpoints that support both logged-in and anonymous
users (browsing, playback), per the product requirement that anyone can
view/play tabs and create tabs anonymously (attributed to "Anonymous"),
but only authenticated users can vote or save drafts.
"""

from __future__ import annotations

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.orm import User

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ANONYMOUS_USERNAME = "Anonymous"


async def _load_user(db: AsyncSession, user_id: str) -> User | None:
    result = await db.execute(select(User).where(User.id == user_id))
    return result.scalar_one_or_none()


async def get_optional_user(
    token: str | None = Depends(_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    return await _load_user(db, user_id)


async def get_current_user(
    token: str | None = Depends(_oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError as exc:
        raise credentials_error from exc
    user_id = payload.get("sub")
    if not user_id:
        raise credentials_error
    user = await _load_user(db, user_id)
    if user is None:
        raise credentials_error
    return user
