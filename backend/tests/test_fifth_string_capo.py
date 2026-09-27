"""Tests for the 5th-string capo/spike setting."""

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


async def test_fifth_string_capo_round_trips_and_defaults_to_matching_the_capo(client):
    plain = (await client.post("/api/tabs", json=_tab())).json()
    assert plain["fifth_string_capo_fret"] is None
    body = (await client.post("/api/tabs", json=_tab(fifth_string_capo_fret=7))).json()
    assert (await client.get(f"/api/tabs/{body['id']}")).json()["fifth_string_capo_fret"] == 7


async def test_open_fifth_string_capo_is_allowed(client):
    resp = await client.post("/api/tabs", json=_tab(fifth_string_capo_fret=0))
    assert resp.status_code == 201
    assert resp.json()["fifth_string_capo_fret"] == 0


async def test_rejects_invalid_fifth_string_capo(client):
    # The 5th string starts at fret 5, so a capo/spike sits at fret 6 or higher.
    for fret in [3, 5, 13]:
        resp = await client.post("/api/tabs", json=_tab(fifth_string_capo_fret=fret))
        assert resp.status_code == 400, fret


async def test_fifth_string_capo_is_kept_in_revisions(client):
    headers = await _login(client, "spiker")
    tab = (await client.post("/api/tabs", json=_tab(fifth_string_capo_fret=9), headers=headers)).json()
    await client.put(f"/api/tabs/{tab['id']}", json=_tab(), headers=headers)
    revisions = (await client.get(f"/api/tabs/{tab['id']}/revisions", headers=headers)).json()
    restored = (
        await client.post(f"/api/tabs/{tab['id']}/revisions/{revisions[0]['id']}/restore", headers=headers)
    ).json()
    assert restored["fifth_string_capo_fret"] == 9
