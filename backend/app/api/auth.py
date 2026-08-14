"""Authentication endpoints: register, login, refresh, Google OAuth2."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.msgspec_utils import MsgspecResponse, parse_json_body
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models.orm import RefreshToken, User
from app.schemas.schemas import (
    GoogleAuthRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserPublic,
)
from app.services.converters import user_to_public
from app.services.google_oauth import exchange_code_for_userinfo

router = APIRouter(prefix="/api/auth", tags=["auth"])
settings = get_settings()

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")


async def _issue_tokens(db: AsyncSession, user: User) -> TokenResponse:
    access_token = create_access_token(subject=user.id)
    raw_refresh, refresh_hash = generate_refresh_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await db.commit()
    return TokenResponse(access_token=access_token, refresh_token=raw_refresh)


@router.post("/register")
async def register(request: Request, db: AsyncSession = Depends(get_db)) -> MsgspecResponse:
    body = await parse_json_body(request, RegisterRequest)

    if not _USERNAME_RE.match(body.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be 3-32 characters: letters, numbers, underscore.",
        )
    if body.username.lower() == "anonymous":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username reserved.")
    if len(body.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters.",
        )

    existing = await db.execute(
        select(User).where((User.username == body.username) | (User.email == body.email))
    )
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Username or email already in use."
        )

    user = User(username=body.username, email=body.email, hashed_password=hash_password(body.password))
    db.add(user)
    await db.flush()
    tokens = await _issue_tokens(db, user)
    return MsgspecResponse(tokens, status_code=status.HTTP_201_CREATED)


@router.post("/login")
async def login(request: Request, db: AsyncSession = Depends(get_db)) -> MsgspecResponse:
    body = await parse_json_body(request, LoginRequest)
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if user is None or not user.hashed_password or not verify_password(
        body.password, user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password."
        )
    tokens = await _issue_tokens(db, user)
    return MsgspecResponse(tokens)


@router.post("/refresh")
async def refresh(request: Request, db: AsyncSession = Depends(get_db)) -> MsgspecResponse:
    body = await parse_json_body(request, RefreshRequest)
    token_hash = hash_refresh_token(body.refresh_token)
    result = await db.execute(select(RefreshToken).where(RefreshToken.token_hash == token_hash))
    stored = result.scalar_one_or_none()
    if (
        stored is None
        or stored.revoked
        or stored.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token."
        )
    # Rotate: revoke the used refresh token and issue a new pair.
    stored.revoked = True
    user_result = await db.execute(select(User).where(User.id == stored.user_id))
    user = user_result.scalar_one()
    tokens = await _issue_tokens(db, user)
    return MsgspecResponse(tokens)


@router.post("/google")
async def google_login(request: Request, db: AsyncSession = Depends(get_db)) -> MsgspecResponse:
    body = await parse_json_body(request, GoogleAuthRequest)
    if not settings.google_client_id or not settings.google_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth2 is not configured on this server.",
        )
    userinfo = await exchange_code_for_userinfo(body.code)

    result = await db.execute(select(User).where(User.google_subject_id == userinfo.sub))
    user = result.scalar_one_or_none()
    if user is None:
        # Derive a unique username from the Google account's email/name.
        base_username = re.sub(r"[^A-Za-z0-9_]", "", (userinfo.name or userinfo.email.split("@")[0]))[
            :24
        ] or "user"
        candidate = base_username
        suffix = 0
        while (
            await db.execute(select(User).where(User.username == candidate))
        ).scalar_one_or_none() is not None:
            suffix += 1
            candidate = f"{base_username}{suffix}"
        user = User(username=candidate, email=userinfo.email, google_subject_id=userinfo.sub)
        db.add(user)
        await db.flush()

    tokens = await _issue_tokens(db, user)
    return MsgspecResponse(tokens)


@router.get("/me")
async def me(user=Depends(get_current_user)) -> MsgspecResponse:
    return MsgspecResponse(user_to_public(user))
