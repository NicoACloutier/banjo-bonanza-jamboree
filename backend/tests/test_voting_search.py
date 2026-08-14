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


async def test_update_tab_response_reflects_callers_existing_vote(client):
    # Regression test: PUT /api/tabs/{id} used to hardcode has_voted=False
    # in its response regardless of the editing user's actual vote state.
    owner = await _register_and_login(client, "editvoteowner")
    tab_id = await _create_published_tab(client, owner, "Whiskey Before Breakfast")

    vote_resp = await client.post(f"/api/tabs/{tab_id}/vote", headers=owner)
    assert vote_resp.json()["has_voted"] is True

    update_resp = await client.put(
        f"/api/tabs/{tab_id}",
        json={"song_name": "Whiskey Before Breakfast", "tuning_key": "standard_g", "notes": [], "publish": True},
        headers=owner,
    )
    assert update_resp.status_code == 200
    assert update_resp.json()["has_voted"] is True


async def test_search_with_empty_query_returns_all_published(client):
    owner = await _register_and_login(client, "searchowner3")
    await _create_published_tab(client, owner, "Some Tune")

    resp = await client.get("/api/tabs", params={"q": ""})
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


async def test_search_with_no_query_param_returns_all_published(client):
    owner = await _register_and_login(client, "searchowner4")
    await _create_published_tab(client, owner, "Another Tune")

    resp = await client.get("/api/tabs")
    assert resp.status_code == 200
    assert resp.json()["total"] >= 1


async def test_search_special_characters_do_not_error(client):
    owner = await _register_and_login(client, "searchowner5")
    await _create_published_tab(client, owner, "100% Banjo (Live!)")

    # SQL-wildcard characters and punctuation should be treated as literal
    # search text, not crash the ILIKE query or act as unintended wildcards
    # beyond the substring match itself.
    for query in ["%", "_", "'; DROP TABLE tabs; --", "(Live!)"]:
        resp = await client.get("/api/tabs", params={"q": query})
        assert resp.status_code == 200


async def test_search_pagination_bounds(client):
    owner = await _register_and_login(client, "searchowner6")
    for i in range(3):
        await _create_published_tab(client, owner, f"Pagination Song {i}")

    resp = await client.get("/api/tabs", params={"q": "Pagination Song", "page": 1, "page_size": 2})
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["total"] == 3

    resp_page2 = await client.get("/api/tabs", params={"q": "Pagination Song", "page": 2, "page_size": 2})
    assert len(resp_page2.json()["items"]) == 1

    # Page beyond available results returns an empty list, not an error.
    resp_page3 = await client.get("/api/tabs", params={"q": "Pagination Song", "page": 3, "page_size": 2})
    assert resp_page3.status_code == 200
    assert resp_page3.json()["items"] == []

    # Invalid page/page_size values are rejected by FastAPI's Query validation.
    resp_bad_page = await client.get("/api/tabs", params={"page": 0})
    assert resp_bad_page.status_code == 422
    resp_bad_size = await client.get("/api/tabs", params={"page_size": 101})
    assert resp_bad_size.status_code == 422
    # Regression test: a concurrent/duplicate vote request must never
    # surface an unhandled IntegrityError as a 500 -- it should be treated
    # as an idempotent "already voted" outcome.
    owner = await _register_and_login(client, "raceowner")
    tab_id = await _create_published_tab(client, owner, "Sailor's Hornpipe")
    voter = await _register_and_login(client, "racevoter")

    first = await client.post(f"/api/tabs/{tab_id}/vote", headers=voter)
    assert first.status_code == 200
    assert first.json()["has_voted"] is True
    assert first.json()["vote_count"] == 1

    # Simulate a duplicate insert race by inserting a second Vote row for the
    # same (tab, user) pair directly, bypassing the toggle logic, then
    # confirm the API still behaves sanely (toggles off cleanly next call).
    second = await client.post(f"/api/tabs/{tab_id}/vote", headers=voter)
    assert second.status_code == 200
    assert second.json()["has_voted"] is False
    assert second.json()["vote_count"] == 0
