"""Tests for login rate limiting."""

from __future__ import annotations

from httpx import ASGITransport, AsyncClient

from app.core.rate_limit import SlidingWindowLimiter
from app.main import app

_PASSWORD = "Str0ngPassw0rd!"


def test_sliding_window_limiter():
    now = [0.0]
    limiter = SlidingWindowLimiter(limit=2, window_seconds=60, clock=lambda: now[0])
    assert limiter.retry_after("k") is None
    limiter.record("k")
    now[0] = 10
    limiter.record("k")
    assert limiter.retry_after("k") == 50  # until the first event leaves the window
    assert limiter.retry_after("other") is None
    now[0] = 60
    assert limiter.retry_after("k") is None
    limiter.record("k")
    assert limiter.retry_after("k") == 10
    limiter.clear("k")
    assert limiter.retry_after("k") is None


def _client_from(ip):
    return AsyncClient(transport=ASGITransport(app=app, client=(ip, 1234)), base_url="http://testserver")


async def _register(client, username):
    await client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": _PASSWORD},
    )


async def _login(client, username, password):
    return await client.post("/api/auth/login", json={"username": username, "password": password})


async def test_too_many_attempts_from_one_address_are_refused(client):
    await _register(client, "picker")
    async with _client_from("10.0.0.1") as noisy:
        for i in range(10):
            assert (await _login(noisy, f"nobody{i}", "wrong")).status_code == 401
        refused = await _login(noisy, "picker", _PASSWORD)
        assert refused.status_code == 429
        assert 0 < int(refused.headers["Retry-After"]) <= 60
        assert "Too many login attempts" in refused.json()["detail"]
    async with _client_from("10.0.0.2") as other:
        assert (await _login(other, "picker", _PASSWORD)).status_code == 200


async def test_failed_attempts_on_one_account_are_limited_across_addresses(client):
    await _register(client, "picker")
    for i in range(10):
        async with _client_from(f"10.0.1.{i}") as attacker:
            assert (await _login(attacker, "Picker", "wrong")).status_code == 401
    async with _client_from("10.0.2.1") as fresh:
        # Even the right password waits, or guessing would just continue.
        refused = await _login(fresh, "picker", _PASSWORD)
        assert refused.status_code == 429
        assert 14 * 60 < int(refused.headers["Retry-After"]) <= 15 * 60
        assert (await _login(fresh, "someone_else", "wrong")).status_code == 401


async def test_successful_login_clears_failures(client):
    await _register(client, "picker")
    async with _client_from("10.0.3.1") as a, _client_from("10.0.3.2") as b:
        for _ in range(9):
            await _login(a, "picker", "wrong")
        assert (await _login(b, "picker", _PASSWORD)).status_code == 200
        for _ in range(9):
            assert (await _login(b, "picker", "wrong")).status_code == 401


async def test_on_fly_the_address_comes_from_fly_client_ip(client, monkeypatch):
    # Fly's proxy sets Fly-Client-IP itself; X-Forwarded-For can be forged.
    monkeypatch.setenv("FLY_APP_NAME", "banjo-test")
    async with _client_from("172.16.0.1") as proxy:
        for i in range(10):
            forged = {"Fly-Client-IP": "203.0.113.9", "X-Forwarded-For": f"6.6.6.{i}"}
            await proxy.post("/api/auth/login", json={"username": f"n{i}", "password": "x"}, headers=forged)
        blocked = await proxy.post(
            "/api/auth/login", json={"username": "n", "password": "x"}, headers={"Fly-Client-IP": "203.0.113.9"}
        )
        assert blocked.status_code == 429
        other = await proxy.post(
            "/api/auth/login", json={"username": "n", "password": "x"}, headers={"Fly-Client-IP": "203.0.113.10"}
        )
        assert other.status_code == 401


async def test_fly_client_ip_is_ignored_off_fly(client, monkeypatch):
    monkeypatch.delenv("FLY_APP_NAME", raising=False)
    async with _client_from("10.0.4.1") as direct:
        for i in range(10):
            await direct.post(
                "/api/auth/login", json={"username": f"n{i}", "password": "x"}, headers={"Fly-Client-IP": f"1.1.1.{i}"}
            )
        assert (await _login(direct, "n", "x")).status_code == 429
