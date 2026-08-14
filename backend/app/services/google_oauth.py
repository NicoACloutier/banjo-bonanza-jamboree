"""
Google OAuth2 "authorization code" flow helper.

The frontend redirects the user to Google's consent screen and receives a
one-time `code`, which it POSTs to our `/api/auth/google` endpoint. This
service exchanges that code for tokens and fetches the user's Google
profile (email + subject id) so we can create/find a local account.

No secrets are hard-coded: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
`GOOGLE_REDIRECT_URI` all come from environment configuration.
"""

from __future__ import annotations

import httpx
import msgspec

from app.core.config import get_settings

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"


class GoogleUserInfo(msgspec.Struct):
    sub: str
    email: str
    email_verified: bool = False
    name: str = ""


async def exchange_code_for_userinfo(code: str) -> GoogleUserInfo:
    """Exchange an OAuth2 authorization code for the Google user's profile."""
    settings = get_settings()
    async with httpx.AsyncClient(timeout=10.0) as client:
        token_response = await client.post(
            _TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": settings.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        token_response.raise_for_status()
        access_token = token_response.json()["access_token"]

        userinfo_response = await client.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        userinfo_response.raise_for_status()
        return msgspec.json.decode(userinfo_response.content, type=GoogleUserInfo)
