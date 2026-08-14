"""Tests for voting and search/sort behaviour."""

from __future__ import annotations


async def _register_and_login(client, username):
    resp = await client.post(
        "/api/auth/register",
        json={"username": username, "email": f"{username}@example.com", "password": "banjo1234"},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_published_tab(client, headers, song_name):
    resp = await client.post(
        "/api/tabs",
        json={"song_name": song_name, "tuning_key": "standard_g", "notes": [], "publish": True},
        headers=headers,
    )
    return resp.json()["id"]


async def test_vote_toggle_and_count(client):
    owner = await _register_and_login(client, "voteowner")
    tab_id = await _create_published_tab(client, owner, "Foggy Mountain Breakdown")

    voter = await _register_and_login(client, "voter1")
    vote_resp = await client.post(f"/api/tabs/{tab_id}/vote", headers=voter)
    assert vote_resp.status_code == 200
    assert vote_resp.json()["vote_count"] == 1
    assert vote_resp.json()["has_voted"] is True

    # Voting again removes the vote (toggle off) -- no down-votes exist.
    unvote_resp = await client.post(f"/api/tabs/{tab_id}/vote", headers=voter)
    assert unvote_resp.json()["vote_count"] == 0
    assert unvote_resp.json()["has_voted"] is False


async def test_voting_requires_auth(client):
    owner = await _register_and_login(client, "voteowner2")
    tab_id = await _create_published_tab(client, owner, "Reuben's Train")
    resp = await client.post(f"/api/tabs/{tab_id}/vote")
    assert resp.status_code == 401


async def test_search_sorts_by_vote_count(client):
    owner = await _register_and_login(client, "searchowner")
    tab_a = await _create_published_tab(client, owner, "Banjo Special A")
    tab_b = await _create_published_tab(client, owner, "Banjo Special B")

    voter1 = await _register_and_login(client, "sv1")
    voter2 = await _register_and_login(client, "sv2")
    # tab_b gets 2 votes, tab_a gets 1 -- tab_b should rank first.
    await client.post(f"/api/tabs/{tab_b}/vote", headers=voter1)
    await client.post(f"/api/tabs/{tab_b}/vote", headers=voter2)
    await client.post(f"/api/tabs/{tab_a}/vote", headers=voter1)

    resp = await client.get("/api/tabs", params={"q": "Banjo Special"})
    assert resp.status_code == 200
    items = resp.json()["items"]
    assert items[0]["id"] == tab_b
    assert items[0]["vote_count"] == 2
    assert items[1]["id"] == tab_a
    assert items[1]["vote_count"] == 1


async def test_search_text_filters_results(client):
    owner = await _register_and_login(client, "searchowner2")
    await _create_published_tab(client, owner, "Cluck Old Hen")
    await _create_published_tab(client, owner, "Sail Away Ladies")

    resp = await client.get("/api/tabs", params={"q": "Cluck"})
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["song_name"] == "Cluck Old Hen"


async def test_user_tabs_endpoint_hides_drafts_from_others(client):
    owner = await _register_and_login(client, "profileowner")
    await client.post(
        "/api/tabs",
        json={"song_name": "Published One", "tuning_key": "standard_g", "notes": [], "publish": True},
        headers=owner,
    )
    await client.post(
        "/api/tabs",
        json={"song_name": "Draft One", "tuning_key": "standard_g", "notes": [], "publish": False},
        headers=owner,
    )

    public_view = await client.get("/api/users/profileowner/tabs")
    assert public_view.json()["total"] == 1

    owner_view = await client.get("/api/users/profileowner/tabs", headers=owner)
    assert owner_view.json()["total"] == 2
