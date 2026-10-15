"""Tests for email verification. These use the real rule: unverified users can't post."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from app.models.orm import EmailToken
from app.services import email as email_service
from tests.conftest import _TestSessionLocal

pytestmark = pytest.mark.email_verification

_PASSWORD = "Str0ngPassw0rd!"
_TAB = {"song_name": "Cripple Creek", "tuning_key": "standard_g", "notes": [], "publish": True}


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(email_service, "send_email", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


async def _register(client, username="picker"):
    resp = await client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": _PASSWORD},
    )
    assert resp.status_code == 201
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _token(email):
    return re.search(r"/verify-email\?token=([\w-]+)", email[2]).group(1)


async def _me(client, headers):
    return (await client.get("/api/auth/me", headers=headers)).json()


async def _verify(client, token):
    return await client.post("/api/auth/verify-email", json={"token": token})


async def test_registering_sends_a_link_and_logs_in_unverified(client, outbox):
    headers = await _register(client)
    me = await _me(client, headers)
    assert (me["email"], me["email_verified"]) == ("picker@example.com", False)
    assert len(outbox) == 1
    to, subject, body = outbox[0]
    assert to == "picker@example.com"
    assert subject.startswith("Confirm your email")
    assert "http://localhost:5173/verify-email?token=" in body


async def test_unverified_users_cant_post_but_can_use_their_library(client, outbox):
    author = await _register(client, "author")  # a verified author's tab to try things on
    assert (await _verify(client, _token(outbox[0]))).status_code == 204
    tab = (await client.post("/api/tabs", json=_TAB, headers=author)).json()

    newcomer = await _register(client, "newcomer")
    for method, url, body in [
        ("post", "/api/tabs", _TAB),
        ("put", f"/api/tabs/{tab['id']}", _TAB),
        ("post", f"/api/tabs/{tab['id']}/vote", None),
        ("post", f"/api/tabs/{tab['id']}/fork", None),
    ]:
        resp = await client.request(method.upper(), url, json=body, headers=newcomer)
        assert resp.status_code == 403, url
        assert "Verify your email address first" in resp.json()["detail"]
    # Private things are fine.
    assert (await client.post(f"/api/tabs/{tab['id']}/favorite", headers=newcomer)).status_code == 200
    assert (await client.get("/api/me/favorites", headers=newcomer)).status_code == 200


async def test_the_link_verifies_once_and_unlocks_posting(client, outbox):
    headers = await _register(client)
    token = _token(outbox[0])
    assert (await _verify(client, token)).status_code == 204  # no login needed
    assert (await _me(client, headers))["email_verified"] is True
    assert (await client.post("/api/tabs", json=_TAB, headers=headers)).status_code == 201

    again = await _verify(client, token)
    assert again.status_code == 400
    assert "invalid or has expired" in again.json()["detail"]


async def test_expired_and_made_up_links_are_rejected(client, outbox):
    headers = await _register(client)
    async with _TestSessionLocal() as db:
        await db.execute(update(EmailToken).values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        await db.commit()
    assert (await _verify(client, _token(outbox[0]))).status_code == 400
    assert (await _verify(client, "made-up")).status_code == 400
    assert (await _me(client, headers))["email_verified"] is False


async def test_resending(client, outbox):
    headers = await _register(client)
    assert (await client.post("/api/auth/verify-email/resend")).status_code == 401
    for _ in range(3):
        assert (await client.post("/api/auth/verify-email/resend", headers=headers)).status_code == 204
    limited = await client.post("/api/auth/verify-email/resend", headers=headers)
    assert limited.status_code == 429
    assert len(outbox) == 4  # registering + 3 resends

    # Using the newest link uses up the older ones too.
    assert (await _verify(client, _token(outbox[-1]))).status_code == 204
    assert (await _verify(client, _token(outbox[0]))).status_code == 400
    done = await client.post("/api/auth/verify-email/resend", headers=headers)
    assert done.status_code == 409


async def test_resetting_the_password_verifies_the_email(client, outbox):
    await _register(client)
    await client.post("/api/auth/password-reset/request", json={"email": "picker@example.com"})
    reset_token = re.search(r"/reset-password\?token=([\w-]+)", outbox[-1][2]).group(1)
    resp = await client.post(
        "/api/auth/password-reset/confirm", json={"token": reset_token, "new_password": "N3wBanj0Passw0rd"}
    )
    assert resp.status_code == 204
    login = await client.post("/api/auth/login", json={"username": "picker", "password": "N3wBanj0Passw0rd"})
    me = await _me(client, {"Authorization": f"Bearer {login.json()['access_token']}"})
    assert me["email_verified"] is True


@pytest.mark.parametrize("google_says_verified", [True, False])
async def test_google_accounts_are_verified_when_google_says_so(client, outbox, monkeypatch, google_says_verified):
    from app.api import auth as auth_api
    from app.core.config import Settings
    from app.services.google_oauth import GoogleUserInfo

    monkeypatch.setattr(auth_api, "settings", Settings(google_client_id="id", google_client_secret="secret"))

    async def fake_exchange(code):
        return GoogleUserInfo(sub="g-123", email="g@example.com", email_verified=google_says_verified, name="Gee")

    monkeypatch.setattr(auth_api, "exchange_code_for_userinfo", fake_exchange)
    resp = await client.post("/api/auth/google", json={"code": "abc"})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    assert (await _me(client, headers))["email_verified"] is google_says_verified
    assert outbox == []
