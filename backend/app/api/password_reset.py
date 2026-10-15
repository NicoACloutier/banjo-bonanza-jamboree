"""
Password reset by email: ask for a link, then set a new password with it.

Asking always gets the same answer, whether or not the address belongs to an
account, and the email is sent after responding, so neither the reply nor
its timing reveals who has an account.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.msgspec_utils import parse_json_body
from app.core.rate_limit import SlidingWindowLimiter, client_ip, too_many_requests
from app.core.security import MIN_PASSWORD_LENGTH, hash_password
from app.models.orm import RefreshToken, User
from app.schemas.schemas import PasswordResetConfirm, PasswordResetRequest
from app.services import email as email_service
from app.services.email_tokens import PASSWORD_RESET, issue_token, use_token

router = APIRouter(prefix="/api/auth/password-reset", tags=["auth"])

TOKEN_LIFETIME = timedelta(hours=1)

# Each request may send an email, so limit them per address and per mailbox.
reset_requests_per_ip = SlidingWindowLimiter(limit=5, window_seconds=15 * 60)
reset_requests_per_email = SlidingWindowLimiter(limit=3, window_seconds=60 * 60)


def _reset_email(username: str, link: str) -> str:
    app_name = get_settings().app_name
    return (
        f"Hi {username},\n\n"
        f"Someone (hopefully you) asked to reset the password for your {app_name} account.\n"
        f"To choose a new password, open this link within the next hour:\n\n"
        f"{link}\n\n"
        "If you didn't ask for this, you can ignore this email; your password won't change.\n"
    )


@router.post("/request", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def request_password_reset(
    request: Request, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
) -> Response:
    """Email a reset link to the account with this address, if there is one."""
    body = await parse_json_body(request, PasswordResetRequest)
    address = body.email.strip().lower()
    ip = client_ip(request)
    for limiter, key in [(reset_requests_per_ip, ip), (reset_requests_per_email, address)]:
        wait = limiter.retry_after(key)
        if wait is not None:
            raise too_many_requests(wait, "password reset requests")
        limiter.record(key)

    user = (await db.execute(select(User).where(func.lower(User.email) == address))).scalar_one_or_none()
    if user is not None and user.email:
        raw = await issue_token(db, user, PASSWORD_RESET, TOKEN_LIFETIME)
        await db.commit()
        settings = get_settings()
        link = f"{settings.frontend_url}/reset-password?token={raw}"
        subject = f"Reset your {settings.app_name} password"
        background.add_task(email_service.send_email, user.email, subject, _reset_email(user.username, link))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/confirm", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def confirm_password_reset(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    """Set a new password using a reset link's token, and log out every session."""
    body = await parse_json_body(request, PasswordResetConfirm)
    if len(body.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        )

    # Using the link also uses up any other outstanding reset links.
    user = await use_token(db, body.token, PASSWORD_RESET)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This reset link is invalid or has expired. Ask for a new one.",
        )

    user.hashed_password = hash_password(body.new_password)
    # The link arrived at their address, so it's verified too.
    user.email_verified = True
    # Sign out every device, in case the old password was compromised.
    await db.execute(update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True))
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
