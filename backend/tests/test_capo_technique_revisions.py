"""Tests for capo support, bend/drop-thumb techniques, and tab revision history."""

from __future__ import annotations


async def _register_and_login(client, username="revuser", password="Str0ngPassw0rd!"):
    resp = await client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": password},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# Capo
# ---------------------------------------------------------------------------


async def test_capo_fret_round_trips(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Capo Test",
            "tuning_key": "standard_g",
            "capo_fret": 2,
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["capo_fret"] == 2

    fetched = await client.get(f"/api/tabs/{body['id']}")
    assert fetched.json()["capo_fret"] == 2


async def test_capo_fret_defaults_to_zero(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "No Capo",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["capo_fret"] == 0


async def test_capo_fret_out_of_range_rejected(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Bad Capo",
            "tuning_key": "standard_g",
            "capo_fret": 13,
            "notes": [],
            "publish": True,
        },
    )
    assert resp.status_code == 400

    resp_negative = await client.post(
        "/api/tabs",
        json={
            "song_name": "Negative Capo",
            "tuning_key": "standard_g",
            "capo_fret": -1,
            "notes": [],
            "publish": True,
        },
    )
    assert resp_negative.status_code == 400


# ---------------------------------------------------------------------------
# Bars per line
# ---------------------------------------------------------------------------


async def test_bars_per_line_round_trips(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Bars Test",
            "tuning_key": "standard_g",
            "bars_per_line": 2,
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["bars_per_line"] == 2

    fetched = await client.get(f"/api/tabs/{body['id']}")
    assert fetched.json()["bars_per_line"] == 2


async def test_bars_per_line_defaults_to_four(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Default Bars",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["bars_per_line"] == 4


async def test_bars_per_line_rejects_invalid_values(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Bad Bars",
            "tuning_key": "standard_g",
            "bars_per_line": 3,
            "notes": [],
            "publish": True,
        },
    )
    assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Bend / drop-thumb techniques
# ---------------------------------------------------------------------------


async def test_bend_round_trips_with_semitones(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Bend Test",
            "tuning_key": "standard_g",
            "notes": [
                {
                    "position": 0,
                    "duration_beats": 1.0,
                    "frets": [{"string_number": 1, "fret": 2, "technique": "bend", "bend_semitones": 2}],
                }
            ],
            "publish": True,
        },
    )
    assert resp.status_code == 201
    fret = resp.json()["notes"][0]["frets"][0]
    assert fret["technique"] == "bend"
    assert fret["bend_semitones"] == 2


async def test_bend_requires_bend_semitones(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Bad Bend",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 2, "technique": "bend"}]}],
            "publish": True,
        },
    )
    assert resp.status_code == 400


async def test_bend_semitones_out_of_range_rejected(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Extreme Bend",
            "tuning_key": "standard_g",
            "notes": [
                {
                    "position": 0,
                    "duration_beats": 1.0,
                    "frets": [{"string_number": 1, "fret": 2, "technique": "bend", "bend_semitones": 13}],
                }
            ],
            "publish": True,
        },
    )
    assert resp.status_code == 400


async def test_bend_semitones_rejected_when_not_bending(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Stray Bend Semitones",
            "tuning_key": "standard_g",
            "notes": [
                {"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 2, "bend_semitones": 2}]}
            ],
            "publish": True,
        },
    )
    assert resp.status_code == 400


async def test_drop_thumb_technique_round_trips(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Drop Thumb Test",
            "tuning_key": "standard_g",
            "notes": [
                {
                    "position": 0,
                    "duration_beats": 1.0,
                    "frets": [{"string_number": 3, "fret": 0, "technique": "drop_thumb"}],
                }
            ],
            "publish": True,
        },
    )
    assert resp.status_code == 201
    assert resp.json()["notes"][0]["frets"][0]["technique"] == "drop_thumb"


async def test_right_hand_finger_annotation_round_trips(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Roll Pattern Test",
            "tuning_key": "standard_g",
            "notes": [
                {
                    "position": 0,
                    "duration_beats": 1.0,
                    "frets": [{"string_number": 5, "fret": 0, "right_hand_finger": "thumb"}],
                },
                {
                    "position": 1,
                    "duration_beats": 1.0,
                    "frets": [{"string_number": 1, "fret": 0, "right_hand_finger": "index"}],
                },
                {
                    "position": 2,
                    "duration_beats": 1.0,
                    "frets": [{"string_number": 2, "fret": 0, "right_hand_finger": "middle"}],
                },
            ],
            "publish": True,
        },
    )
    assert resp.status_code == 201
    notes = sorted(resp.json()["notes"], key=lambda n: n["position"])
    assert [n["frets"][0]["right_hand_finger"] for n in notes] == ["thumb", "index", "middle"]


# ---------------------------------------------------------------------------
# Revision history
# ---------------------------------------------------------------------------


async def test_update_creates_a_revision_of_the_prior_state(client):
    headers = await _register_and_login(client, "revuser1")
    create_resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Version One",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
        headers=headers,
    )
    tab_id = create_resp.json()["id"]

    # No revisions yet -- creation itself is not a revision, only edits are.
    revisions_before = await client.get(f"/api/tabs/{tab_id}/revisions", headers=headers)
    assert revisions_before.status_code == 200
    assert revisions_before.json() == []

    update_resp = await client.put(
        f"/api/tabs/{tab_id}",
        json={
            "song_name": "Version Two",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 2}]}],
            "publish": True,
        },
        headers=headers,
    )
    assert update_resp.status_code == 200

    revisions_after = await client.get(f"/api/tabs/{tab_id}/revisions", headers=headers)
    assert revisions_after.status_code == 200
    revisions = revisions_after.json()
    assert len(revisions) == 1
    # The saved revision captures the *pre-update* state ("Version One").
    assert revisions[0]["song_name"] == "Version One"
    assert revisions[0]["note_count"] == 1


async def test_get_revision_detail_and_restore(client):
    headers = await _register_and_login(client, "revuser2")
    create_resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Chorus Only",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
        headers=headers,
    )
    tab_id = create_resp.json()["id"]

    await client.put(
        f"/api/tabs/{tab_id}",
        json={
            "song_name": "Chorus Plus Verse",
            "tuning_key": "standard_g",
            "notes": [
                {"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]},
                {"position": 1, "duration_beats": 1.0, "frets": [{"string_number": 2, "fret": 1}]},
            ],
            "publish": True,
        },
        headers=headers,
    )

    revisions = (await client.get(f"/api/tabs/{tab_id}/revisions", headers=headers)).json()
    assert len(revisions) == 1
    revision_id = revisions[0]["id"]

    detail_resp = await client.get(f"/api/tabs/{tab_id}/revisions/{revision_id}", headers=headers)
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["song_name"] == "Chorus Only"
    assert len(detail["notes"]) == 1

    restore_resp = await client.post(f"/api/tabs/{tab_id}/revisions/{revision_id}/restore", headers=headers)
    assert restore_resp.status_code == 200
    restored = restore_resp.json()
    assert restored["song_name"] == "Chorus Only"
    assert len(restored["notes"]) == 1

    # Restoring itself creates a new revision (capturing the pre-restore
    # "Chorus Plus Verse" state), so it is itself undoable.
    revisions_after_restore = (await client.get(f"/api/tabs/{tab_id}/revisions", headers=headers)).json()
    assert len(revisions_after_restore) == 2


async def test_revisions_are_owner_only(client):
    owner_headers = await _register_and_login(client, "revowner")
    create_resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Private Revisions",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
        headers=owner_headers,
    )
    tab_id = create_resp.json()["id"]
    await client.put(
        f"/api/tabs/{tab_id}",
        json={
            "song_name": "Renamed",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
        headers=owner_headers,
    )

    other_headers = await _register_and_login(client, "revother")
    resp = await client.get(f"/api/tabs/{tab_id}/revisions", headers=other_headers)
    assert resp.status_code == 403


async def test_revision_endpoints_require_authentication(client):
    create_resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Anon Tab",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "duration_beats": 1.0, "frets": [{"string_number": 1, "fret": 0}]}],
            "publish": True,
        },
    )
    tab_id = create_resp.json()["id"]
    resp = await client.get(f"/api/tabs/{tab_id}/revisions")
    assert resp.status_code == 401
