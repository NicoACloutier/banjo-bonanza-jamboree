"""
Email verification: registering emails a link, and opening it verifies the
account's address. Until then the account can't post (see
deps.get_verified_user). Logged-in users can ask for the link again.
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.msgspec_utils import parse_json_body
from app.core.rate_limit import SlidingWindowLimiter, too_many_requests
from app.models.orm import User
from app.schemas.schemas import VerifyEmailRequest
from app.services import email as email_service
from app.services.email_tokens import EMAIL_VERIFICATION, issue_token, use_token

router = APIRouter(prefix="/api/auth/verify-email", tags=["auth"])

TOKEN_LIFETIME = timedelta(hours=24)

resends_per_account = SlidingWindowLimiter(limit=3, window_seconds=60 * 60)


def _verification_email(username: str, link: str) -> str:
    app_name = get_settings().app_name
    return (
        f"Hi {username},\n\n"
        f"Welcome to {app_name}! To confirm this is your email address, open this link\n"
        "within the next 24 hours:\n\n"
        f"{link}\n\n"
        "Until then you can browse and save favorites, but not post tabs or vote.\n"
        "If you didn't create an account, you can ignore this email.\n"
    )


async def send_verification_email(db: AsyncSession, user: User, background: BackgroundTasks) -> None:
    """Issue a verification link for `user` and email it after the response (commits)."""
    if not user.email:
        return
    raw = await issue_token(db, user, EMAIL_VERIFICATION, TOKEN_LIFETIME)
    await db.commit()
    settings = get_settings()
    link = f"{settings.frontend_url}/verify-email?token={raw}"
    subject = f"Confirm your email for {settings.app_name}"
    background.add_task(email_service.send_email, user.email, subject, _verification_email(user.username, link))


@router.post("", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def verify_email(request: Request, db: AsyncSession = Depends(get_db)) -> Response:
    """Verify the address a link was sent to. Works without logging in (the
    link may be opened in another browser)."""
    body = await parse_json_body(request, VerifyEmailRequest)
    user = await use_token(db, body.token, EMAIL_VERIFICATION)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has expired. Log in to get a new one.",
        )
    user.email_verified = True
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/resend", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
async def resend_verification_email(
    background: BackgroundTasks, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
) -> Response:
    """Email the logged-in user a new verification link."""
    if user.email_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Your email address is already verified.")
    wait = resends_per_account.retry_after(user.id)
    if wait is not None:
        raise too_many_requests(wait, "verification emails")
    resends_per_account.record(user.id)
    await send_verification_email(db, user, background)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
