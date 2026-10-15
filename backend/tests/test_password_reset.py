"""Tests for password reset by email."""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import update

from app.models.orm import EmailToken
from app.services import email as email_service
from tests.conftest import _TestSessionLocal

_PASSWORD = "Str0ngPassw0rd!"
_NEW_PASSWORD = "N3wBanj0Passw0rd"


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(email_service, "send_email", lambda to, subject, body: sent.append((to, subject, body)))
    return sent


async def _register(client, username="picker", email="Picker@Example.com"):
    resp = await client.post("/api/auth/register", json={"username": username, "email": email, "password": _PASSWORD})
    return resp.json()


async def _request(client, email):
    return await client.post("/api/auth/password-reset/request", json={"email": email})


async def _confirm(client, token, password=_NEW_PASSWORD):
    return await client.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": password})


def _token_from(outbox):
    body = outbox[-1][2]
    return re.search(r"/reset-password\?token=([\w-]+)", body).group(1)


async def _login(client, password):
    return await client.post("/api/auth/login", json={"username": "picker", "password": password})


async def test_reset_flow(client, outbox):
    tokens = await _register(client)
    assert (await _request(client, "  picker@example.COM ")).status_code == 204
    assert len(outbox) == 1
    to, subject, body = outbox[0]
    assert to == "Picker@Example.com"
    assert "Reset your" in subject
    assert "http://localhost:5173/reset-password?token=" in body

    assert (await _confirm(client, _token_from(outbox))).status_code == 204
    assert (await _login(client, _PASSWORD)).status_code == 401
    assert (await _login(client, _NEW_PASSWORD)).status_code == 200
    # Every existing session was signed out.
    refreshed = await client.post("/api/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert refreshed.status_code == 401


async def test_unknown_addresses_get_the_same_answer_and_no_email(client, outbox):
    await _register(client)
    resp = await _request(client, "nobody@example.com")
    assert resp.status_code == 204
    assert outbox == []


async def test_links_work_once(client, outbox):
    await _register(client)
    await _request(client, "picker@example.com")
    await _request(client, "picker@example.com")
    first, second = _token_from(outbox[:1]), _token_from(outbox)
    assert (await _confirm(client, second)).status_code == 204
    for used in [second, first]:  # using one link uses up the others too
        resp = await _confirm(client, used, "An0therPassw0rd")
        assert resp.status_code == 400
        assert "invalid or has expired" in resp.json()["detail"]


async def test_expired_and_made_up_links_are_rejected(client, outbox):
    await _register(client)
    await _request(client, "picker@example.com")
    async with _TestSessionLocal() as db:
        await db.execute(update(EmailToken).values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
        await db.commit()
    assert (await _confirm(client, _token_from(outbox))).status_code == 400
    assert (await _confirm(client, "made-up")).status_code == 400
    assert (await _login(client, _PASSWORD)).status_code == 200


async def test_new_password_must_be_long_enough(client, outbox):
    await _register(client)
    await _request(client, "picker@example.com")
    resp = await _confirm(client, _token_from(outbox), "short")
    assert resp.status_code == 400
    assert "at least 8" in resp.json()["detail"]
    assert (await _confirm(client, _token_from(outbox))).status_code == 204  # the link still works


async def test_requests_are_rate_limited_per_mailbox(client, outbox):
    await _register(client)
    for _ in range(3):
        assert (await _request(client, "picker@example.com")).status_code == 204
    resp = await _request(client, "PICKER@example.com")
    assert resp.status_code == 429
    assert "Retry-After" in resp.headers
    assert len(outbox) == 3


def test_without_smtp_development_logs_the_email(caplog, monkeypatch):
    from app.core import config

    monkeypatch.setattr(email_service, "get_settings", lambda: config.Settings(environment="development", smtp_host=""))
    email_service.send_email("a@example.com", "Hello", "the link")
    assert "the link" in caplog.text

    caplog.clear()
    monkeypatch.setattr(email_service, "get_settings", lambda: config.Settings(environment="production", smtp_host=""))
    email_service.send_email("a@example.com", "Hello", "secret link")
    assert "wasn't sent" in caplog.text
    assert "secret link" not in caplog.text


def test_sends_over_smtp_with_starttls_and_login(monkeypatch):
    from app.core import config

    calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls.append(("connect", host, port))

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            calls.append(("quit",))

        def starttls(self, context):
            calls.append(("starttls",))

        def login(self, username, password):
            calls.append(("login", username, password))

        def send_message(self, message):
            calls.append(("send", message["From"], message["To"], message["Subject"], message.get_content()))

    settings = config.Settings(
        smtp_host="smtp.example.com",
        smtp_port=587,
        smtp_username="apikey",
        smtp_password="pw",
        smtp_security="starttls",
        email_from="Banjo <noreply@example.com>",
    )
    monkeypatch.setattr(email_service, "get_settings", lambda: settings)
    monkeypatch.setattr(email_service.smtplib, "SMTP", FakeSMTP)
    email_service.send_email("a@example.com", "Hello", "Body text")
    assert calls == [
        ("connect", "smtp.example.com", 587),
        ("starttls",),
        ("login", "apikey", "pw"),
        ("send", "Banjo <noreply@example.com>", "a@example.com", "Hello", "Body text\n"),
        ("quit",),
    ]
