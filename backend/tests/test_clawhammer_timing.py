"""Tests for clawhammer timing (tab-level) and per-note thumb_after."""

from __future__ import annotations

_NOTES = [
    {"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 3, "fret": 0}]},
    {"position": 1, "duration_beats": 1.0, "frets": [{"string_number": 2, "fret": 0}]},
    # A thumb stroke can follow a rest too.
    {"position": 2, "duration_beats": 1.0, "is_rest": True, "thumb_after": True},
]


async def _register_and_login(client, username="clawuser", password="Str0ngPassw0rd!"):
    resp = await client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": password},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


async def test_clawhammer_timing_and_thumb_after_round_trip(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Clawhammer Test",
            "tuning_key": "standard_g",
            "clawhammer_timing": True,
            "notes": _NOTES,
            "publish": True,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["clawhammer_timing"] is True
    assert [n["thumb_after"] for n in body["notes"]] == [False, False, True]

    fetched = (await client.get(f"/api/tabs/{body['id']}")).json()
    assert fetched["clawhammer_timing"] is True
    assert [n["thumb_after"] for n in fetched["notes"]] == [False, False, True]


async def test_clawhammer_timing_defaults_off(client):
    resp = await client.post(
        "/api/tabs",
        json={"song_name": "Default", "tuning_key": "standard_g", "notes": _NOTES[:2], "publish": True},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["clawhammer_timing"] is False
    assert all(n["thumb_after"] is False for n in body["notes"])


async def test_clawhammer_timing_is_kept_in_revisions(client):
    headers = await _register_and_login(client)
    payload = {
        "song_name": "Revisions",
        "tuning_key": "standard_g",
        "clawhammer_timing": True,
        "notes": _NOTES,
        "publish": True,
    }
    tab = (await client.post("/api/tabs", json=payload, headers=headers)).json()
    await client.put(
        f"/api/tabs/{tab['id']}", json={**payload, "clawhammer_timing": False, "notes": []}, headers=headers
    )

    revisions = (await client.get(f"/api/tabs/{tab['id']}/revisions", headers=headers)).json()
    revision = (await client.get(f"/api/tabs/{tab['id']}/revisions/{revisions[0]['id']}", headers=headers)).json()
    assert revision["clawhammer_timing"] is True
    assert [n["thumb_after"] for n in revision["notes"]] == [False, False, True]

    restored = (
        await client.post(f"/api/tabs/{tab['id']}/revisions/{revisions[0]['id']}/restore", headers=headers)
    ).json()
    assert restored["clawhammer_timing"] is True
    assert [n["thumb_after"] for n in restored["notes"]] == [False, False, True]
