"""Tests for the offensive-language moderation filter and its API integration."""

from __future__ import annotations

from app.services.moderation import contains_offensive_language, find_offending_fields


def test_clean_text_passes():
    assert contains_offensive_language("Cripple Creek is a great old-time tune") is False


def test_slur_detected_plain():
    assert contains_offensive_language("this song has a ch1nk in it") is True


def test_slur_detected_leetspeak_and_separators():
    assert contains_offensive_language("n.i.g.g.e.r") is True
    assert contains_offensive_language("f a g g o t") is True


def test_find_offending_fields_reports_names():
    fields = {"song_name": "Nice Song", "artist": "sp1c band", "album": None}
    assert find_offending_fields(fields) == ["artist"]


async def test_publish_with_offensive_lyric_rejected(client):
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "Test Song",
            "tuning_key": "standard_g",
            "notes": [{"position": 0, "string_number": 1, "fret": 0, "lyric": "you filthy retard"}],
            "publish": True,
        },
    )
    assert resp.status_code == 422


async def test_publish_with_offensive_song_name_rejected(client):
    resp = await client.post(
        "/api/tabs",
        json={"song_name": "The kike song", "tuning_key": "standard_g", "notes": [], "publish": True},
    )
    assert resp.status_code == 422


async def test_draft_allows_saving_without_moderation_block(client):
    # Drafts require login; moderation is only enforced at publish time so
    # authors can iterate privately, but this still must succeed for clean
    # text saved as a draft.
    register = await client.post(
        "/api/auth/register",
        json={"username": "draftuser", "email": "draftuser@example.com", "password": "banjo1234"},
    )
    headers = {"Authorization": f"Bearer {register.json()['access_token']}"}
    resp = await client.post(
        "/api/tabs",
        json={
            "song_name": "A clean working title",
            "tuning_key": "standard_g",
            "notes": [],
            "publish": False,
        },
        headers=headers,
    )
    assert resp.status_code == 201
