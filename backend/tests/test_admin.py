"""Tests for admin accounts: granting admin with the CLI, and admins deleting anyone's tab."""

from __future__ import annotations

import pytest

from app import cli
from tests.conftest import _TestSessionLocal

_TAB = {"song_name": "Soldier's Joy", "tuning_key": "standard_g", "notes": [], "publish": True}


@pytest.fixture(autouse=True)
def _cli_uses_test_database(monkeypatch):
    monkeypatch.setattr(cli, "AsyncSessionLocal", _TestSessionLocal)

    class _NoDispose:
        async def dispose(self):
            pass

    monkeypatch.setattr(cli, "engine", _NoDispose())


async def _login(client, username):
    resp = await client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": "Str0ngPassw0rd!"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def _is_admin(client, headers):
    return (await client.get("/api/auth/me", headers=headers)).json()["is_admin"]


async def test_make_admin_grants_and_revokes(client, capsys):
    headers = await _login(client, "moderator")
    assert await _is_admin(client, headers) is False

    assert await cli.set_admin("moderator", True)
    assert await _is_admin(client, headers) is True
    assert await cli.set_admin("moderator", False)
    assert await _is_admin(client, headers) is False
    assert not await cli.set_admin("nobody", True)


def test_cli_reports_unknown_users(capsys):
    assert cli.main(["make-admin", "nobody"]) == 1
    assert "No user named 'nobody'" in capsys.readouterr().out


async def test_admin_can_delete_anyones_tab(client, author_headers):
    published = (await client.post("/api/tabs", json=_TAB, headers=author_headers)).json()
    draft = (await client.post("/api/tabs", json={**_TAB, "publish": False}, headers=author_headers)).json()
    admin = await _login(client, "moderator")
    await cli.set_admin("moderator", True)

    for tab in [published, draft]:
        assert (await client.delete(f"/api/tabs/{tab['id']}", headers=admin)).status_code == 204
        assert (await client.get(f"/api/tabs/{tab['id']}", headers=author_headers)).status_code == 404


async def test_non_admins_still_cannot_delete_others_tabs(client, author_headers):
    tab = (await client.post("/api/tabs", json=_TAB, headers=author_headers)).json()
    other = await _login(client, "bystander")
    assert (await client.delete(f"/api/tabs/{tab['id']}", headers=other)).status_code == 403
    assert (await client.get(f"/api/tabs/{tab['id']}")).status_code == 200


async def test_public_profiles_dont_reveal_admins(client):
    await _login(client, "moderator")
    await cli.set_admin("moderator", True)
    assert "is_admin" not in (await client.get("/api/users/moderator")).json()
