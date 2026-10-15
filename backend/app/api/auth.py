"""Authentication endpoints: register, login, refresh, Google OAuth2."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import ANONYMOUS_USERNAME, get_current_user
from app.core.msgspec_utils import MsgspecResponse, parse_json_body
from app.core.rate_limit import SlidingWindowLimiter, client_ip, too_many_requests
from app.core.security import (
    MIN_PASSWORD_LENGTH,
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
)
from app.api.email_verification import send_verification_email
from app.services.converters import user_to_current
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
async def register(
    request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
) -> MsgspecResponse:
    body = await parse_json_body(request, RegisterRequest)

    if not _USERNAME_RE.match(body.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username must be 3-32 characters: letters, numbers, underscore.",
        )
    if body.username.lower() == ANONYMOUS_USERNAME.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username reserved.")
    if len(body.password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
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
    # They're logged in straight away, but can't post until they open the
    # link this emails them.
    await send_verification_email(db, user, background)
    tokens = await _issue_tokens(db, user)
    return MsgspecResponse(tokens, status_code=status.HTTP_201_CREATED)


# Login rate limits. Every attempt from an address counts (each one costs an
# Argon2 hash), and failed attempts count against the account being tried, so
# a password can't be guessed by spreading attempts over many addresses.
# A successful login clears the account's failures.
login_attempts_per_ip = SlidingWindowLimiter(limit=10, window_seconds=60)
login_failures_per_account = SlidingWindowLimiter(limit=10, window_seconds=15 * 60)


@router.post("/login")
async def login(request: Request, db: AsyncSession = Depends(get_db)) -> MsgspecResponse:
    body = await parse_json_body(request, LoginRequest)
    ip = client_ip(request)
    account = body.username.strip().lower()
    for limiter, key in [(login_attempts_per_ip, ip), (login_failures_per_account, account)]:
        wait = limiter.retry_after(key)
        if wait is not None:
            raise too_many_requests(wait, "login attempts")
    login_attempts_per_ip.record(ip)

    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if user is None or not user.hashed_password or not verify_password(
        body.password, user.hashed_password
    ):
        login_failures_per_account.record(account)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password."
        )
    login_failures_per_account.clear(account)
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
        # Google has already checked the address when it says so.
        user = User(
            username=candidate,
            email=userinfo.email,
            google_subject_id=userinfo.sub,
            email_verified=userinfo.email_verified,
        )
        db.add(user)
        await db.flush()

    tokens = await _issue_tokens(db, user)
    return MsgspecResponse(tokens)


@router.get("/me")
async def me(user=Depends(get_current_user)) -> MsgspecResponse:
    return MsgspecResponse(user_to_current(user))
