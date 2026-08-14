"""Tests for registration, login, refresh, and the /me endpoint."""

from __future__ import annotations

async def test_register_and_me(client):
    resp = await client.post(
        "/api/auth/register",
        json={"username": "picker1", "email": "picker1@example.com", "password": "banjo1234"},
    )
    assert resp.status_code == 201
    tokens = resp.json()
    assert "access_token" in tokens and "refresh_token" in tokens

    me = await client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {tokens['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["username"] == "picker1"


async def test_register_rejects_reserved_username(client):
    resp = await client.post(
        "/api/auth/register",
        json={"username": "Anonymous", "email": "a@example.com", "password": "banjo1234"},
    )
    assert resp.status_code == 400


async def test_register_rejects_short_password(client):
    resp = await client.post(
        "/api/auth/register",
        json={"username": "shortpw", "email": "s@example.com", "password": "short"},
    )
    assert resp.status_code == 400


async def test_duplicate_username_rejected(client):
    payload = {"username": "dupe", "email": "dupe1@example.com", "password": "banjo1234"}
    first = await client.post("/api/auth/register", json=payload)
    assert first.status_code == 201
    payload["email"] = "dupe2@example.com"
    second = await client.post("/api/auth/register", json=payload)
    assert second.status_code == 409


async def test_login_success_and_failure(client):
    await client.post(
        "/api/auth/register",
        json={"username": "loginuser", "email": "login@example.com", "password": "correcthorse"},
    )
    good = await client.post(
        "/api/auth/login", json={"username": "loginuser", "password": "correcthorse"}
    )
    assert good.status_code == 200

    bad = await client.post(
        "/api/auth/login", json={"username": "loginuser", "password": "wrongpassword"}
    )
    assert bad.status_code == 401


async def test_refresh_rotates_token(client):
    register = await client.post(
        "/api/auth/register",
        json={"username": "refresher", "email": "refresh@example.com", "password": "banjo1234"},
    )
    refresh_token = register.json()["refresh_token"]

    refreshed = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200

    # The original refresh token was rotated/revoked and cannot be reused.
    reused = await client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert reused.status_code == 401


async def test_unauthenticated_me_rejected(client):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401
