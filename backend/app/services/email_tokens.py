"""
Single-use tokens sent by email (password reset and email verification
links). Only a token's SHA-256 hash is stored, like refresh tokens.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_refresh_token
from app.models.orm import EmailToken, User

PASSWORD_RESET = "password_reset"
EMAIL_VERIFICATION = "email_verification"


async def issue_token(db: AsyncSession, user: User, purpose: str, lifetime: timedelta) -> str:
    """Store a new token for `user` (the caller commits) and return the raw value for the link."""
    raw = secrets.token_urlsafe(32)
    db.add(
        EmailToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_refresh_token(raw),  # the same SHA-256 hashing as refresh tokens
            expires_at=datetime.now(timezone.utc) + lifetime,
        )
    )
    return raw


async def use_token(db: AsyncSession, raw: str, purpose: str) -> User | None:
    """
    The user a valid (unused, unexpired) token belongs to, or None. A valid
    token is used up along with any of that user's other tokens for the same
    purpose, so each link works once (the caller commits).
    """
    now = datetime.now(timezone.utc)
    token = (
        await db.execute(
            select(EmailToken).where(EmailToken.token_hash == hash_refresh_token(raw), EmailToken.purpose == purpose)
        )
    ).scalar_one_or_none()
    if token is None or token.used_at is not None or token.expires_at.replace(tzinfo=timezone.utc) < now:
        return None
    await db.execute(
        update(EmailToken)
        .where(EmailToken.user_id == token.user_id, EmailToken.purpose == purpose, EmailToken.used_at.is_(None))
        .values(used_at=now)
    )
    return (await db.execute(select(User).where(User.id == token.user_id))).scalar_one()
