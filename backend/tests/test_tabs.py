"""Tests for tab creation (draft/publish/anonymous), editing, and deletion."""

from __future__ import annotations


async def _register_and_login(client, username="tabuser", password="banjo1234"):
    resp = await client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": password},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _sample_notes():
    return [
        {"position": 0, "string_number": 1, "fret": 0, "duration_beats": 1.0, "lyric": "Hello"},
        {"position": 1, "string_number": 2, "fret": 2, "duration_beats": 1.0},
        {"position": 2, "string_number": 3, "fret": 3, "duration_beats": 1.0, "line_break": True},
    ]


async def test_create_draft_requires_login(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Cripple Creek",
            "tuning_key": "standard_g",
            "notes": _sample_notes(),
            "publish": False,
        },
    )
    assert resp.status_code == 401


async def test_anonymous_can_publish_directly(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Old Joe Clark",
            "tuning_key": "standard_g",
            "notes": _sample_notes(),
            "publish": True,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["owner_username"] == "Anonymous"
    assert body["status"] == "published"
    assert len(body["notes"]) == 3
    assert body["notes"][0]["lyric"] == "Hello"


async def test_authenticated_user_can_draft_then_publish(client):
    headers = await _register_and_login(client)
    create_resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Shady Grove",
            "tuning_key": "double_c",
            "artist": "Traditional",
            "notes": _sample_notes(),
            "publish": False,
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    tab = create_resp.json()
    assert tab["status"] == "draft"

    update_resp = await client.put(
        f"/api/tabs/{tab['id']}",
        json={
            "song_name": "Shady Grove",
            "tuning_key": "double_c",
            "artist": "Traditional",
            "notes": _sample_notes(),
            "publish": True,
        },
        headers=headers,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["status"] == "published"


async def test_draft_not_visible_to_others(client):
    owner_headers = await _register_and_login(client, "owner1")
    create_resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Private Draft",
            "tuning_key": "sawmill",
            "notes": _sample_notes(),
            "publish": False,
        },
        headers=owner_headers,
    )
    tab_id = create_resp.json()["id"]

    other_headers = await _register_and_login(client, "other1")
    resp_other = await client.get(f"/api/tabs/{tab_id}", headers=other_headers)
    assert resp_other.status_code == 404

    resp_owner = await client.get(f"/api/tabs/{tab_id}", headers=owner_headers)
    assert resp_owner.status_code == 200


async def test_only_owner_can_edit_or_delete(client):
    owner_headers = await _register_and_login(client, "owner2")
    create_resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Boil Them Cabbage Down",
            "tuning_key": "standard_g",
            "notes": _sample_notes(),
            "publish": True,
        },
        headers=owner_headers,
    )
    tab_id = create_resp.json()["id"]

    other_headers = await _register_and_login(client, "other2")
    edit_attempt = await client.put(
        f"/api/tabs/{tab_id}",
        json={
            "song_name": "Hijacked",
            "tuning_key": "standard_g",
            "notes": [],
            "publish": True,
        },
        headers=other_headers,
    )
    assert edit_attempt.status_code == 403

    delete_attempt = await client.delete(f"/api/tabs/{tab_id}", headers=other_headers)
    assert delete_attempt.status_code == 403

    delete_ok = await client.delete(f"/api/tabs/{tab_id}", headers=owner_headers)
    assert delete_ok.status_code == 204


async def test_invalid_tuning_rejected(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Bad Tuning",
            "tuning_key": "not_a_real_tuning",
            "notes": [],
            "publish": True,
        },
    )
    assert resp.status_code == 400
