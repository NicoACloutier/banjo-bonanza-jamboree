"""Tests for chord names on notes."""

from __future__ import annotations

_NOTE = {"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 3, "fret": 0}]}


async def _login(client, username):
    resp = await client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": "Str0ngPassw0rd!"},
    )
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


def _tab(song_name="Cripple Creek", **fields):
    return {"song_name": song_name, "tuning_key": "standard_g", "notes": [_NOTE], "publish": True, **fields}


async def test_chord_names_round_trip(client):
    notes = [{**_NOTE, "chord": "G"}, {**_NOTE, "position": 1}, {**_NOTE, "position": 2, "chord": "D7"}]
    body = (await client.post("/api/tabs", json=_tab(notes=notes))).json()
    fetched = (await client.get(f"/api/tabs/{body['id']}")).json()
    assert [n["chord"] for n in fetched["notes"]] == ["G", None, "D7"]


async def test_empty_chord_name_is_stored_as_none(client):
    body = (await client.post("/api/tabs", json=_tab(notes=[{**_NOTE, "chord": ""}]))).json()
    assert body["notes"][0]["chord"] is None


async def test_rejects_overlong_chord_names(client):
    resp = await client.post("/api/tabs", json=_tab(notes=[{**_NOTE, "chord": "X" * 17}]))
    assert resp.status_code == 400
