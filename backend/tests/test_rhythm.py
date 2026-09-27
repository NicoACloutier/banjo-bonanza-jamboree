"""Tests for rhythm notation: time signatures, swing, and dotted/triplet/tied notes."""

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


async def test_rhythm_note_fields_round_trip(client):
    notes = [
        {**_NOTE, "dotted": True},
        {**_NOTE, "position": 1, "duration_beats": 0.5, "triplet": True, "tied": True},
    ]
    body = (await client.post("/api/tabs", json=_tab(notes=notes))).json()
    fetched = (await client.get(f"/api/tabs/{body['id']}")).json()
    assert [(n["dotted"], n["triplet"], n["tied"]) for n in fetched["notes"]] == [
        (True, False, False),
        (False, True, True),
    ]


async def test_time_signature_and_swing_round_trip_with_defaults(client):
    plain = (await client.post("/api/tabs", json=_tab())).json()
    assert (plain["time_signature"], plain["swing"]) == (None, False)
    body = (await client.post("/api/tabs", json=_tab(time_signature="6/8", swing=True))).json()
    fetched = (await client.get(f"/api/tabs/{body['id']}")).json()
    assert (fetched["time_signature"], fetched["swing"]) == ("6/8", True)


async def test_rejects_unknown_time_signatures(client):
    for time_signature in ["5/4", "4", "4/4 "]:
        resp = await client.post("/api/tabs", json=_tab(time_signature=time_signature))
        assert resp.status_code == 400, time_signature


async def test_rhythm_settings_are_kept_in_revisions(client):
    headers = await _login(client, "revs")
    notes = [{**_NOTE, "dotted": True, "tied": True}]
    tab = (
        await client.post("/api/tabs", json=_tab(time_signature="3/4", swing=True, notes=notes), headers=headers)
    ).json()
    await client.put(f"/api/tabs/{tab['id']}", json=_tab(), headers=headers)
    revisions = (await client.get(f"/api/tabs/{tab['id']}/revisions", headers=headers)).json()
    restored = (
        await client.post(f"/api/tabs/{tab['id']}/revisions/{revisions[0]['id']}/restore", headers=headers)
    ).json()
    assert (restored["time_signature"], restored["swing"]) == ("3/4", True)
    assert (restored["notes"][0]["dotted"], restored["notes"][0]["tied"]) == (True, True)
