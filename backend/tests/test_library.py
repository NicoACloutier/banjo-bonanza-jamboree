"""Tests for library features: style/key/difficulty tags and filters, favorites, forks, and setlists."""

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


async def test_library_metadata_round_trips_with_defaults(client):
    plain = (await client.post("/api/tabs", json=_tab())).json()
    assert (plain["style"], plain["song_key"], plain["difficulty"]) == (None, None, None)
    fields = {"style": "clawhammer", "song_key": "F#m", "difficulty": "beginner"}
    body = (await client.post("/api/tabs", json=_tab(**fields))).json()
    fetched = (await client.get(f"/api/tabs/{body['id']}")).json()
    assert {k: fetched[k] for k in fields} == fields


async def test_rejects_invalid_library_metadata(client):
    for fields in [{"style": "polka"}, {"song_key": "H"}, {"song_key": "Gmaj"}, {"difficulty": "expert"}]:
        resp = await client.post("/api/tabs", json=_tab(**fields))
        assert resp.status_code == 400, fields


async def test_library_metadata_is_kept_in_revisions(client):
    headers = await _login(client, "tagger")
    fields = {"style": "old_time", "song_key": "D", "difficulty": "advanced"}
    tab = (await client.post("/api/tabs", json=_tab(**fields), headers=headers)).json()
    await client.put(f"/api/tabs/{tab['id']}", json=_tab(), headers=headers)
    revisions = (await client.get(f"/api/tabs/{tab['id']}/revisions", headers=headers)).json()
    restored = (
        await client.post(f"/api/tabs/{tab['id']}/revisions/{revisions[0]['id']}/restore", headers=headers)
    ).json()
    assert {k: restored[k] for k in fields} == fields


async def test_search_filters_by_style_difficulty_tuning_and_key(client):
    await client.post("/api/tabs", json=_tab("A", style="scruggs", difficulty="beginner", song_key="G"))
    await client.post("/api/tabs", json=_tab("B", style="clawhammer", difficulty="beginner", song_key="D"))
    await client.post(
        "/api/tabs", json=_tab("C", style="clawhammer", difficulty="advanced", tuning_key="double_c", song_key="C")
    )

    async def names(**params):
        body = (await client.get("/api/tabs", params=params)).json()
        return sorted(t["song_name"] for t in body["items"]), body["total"]

    assert await names(style="clawhammer") == (["B", "C"], 2)
    assert await names(difficulty="beginner") == (["A", "B"], 2)
    assert await names(tuning="double_c") == (["C"], 1)
    assert await names(song_key="D") == (["B"], 1)
    assert await names(style="clawhammer", difficulty="beginner") == (["B"], 1)

    summary = (await client.get("/api/tabs", params={"q": "A"})).json()["items"][0]
    assert (summary["style"], summary["difficulty"], summary["song_key"]) == ("scruggs", "beginner", "G")


# ---------------------------------------------------------------------------
# Favorites
# ---------------------------------------------------------------------------


async def test_favorite_toggle_and_list(client):
    headers = await _login(client, "fan")
    first = (await client.post("/api/tabs", json=_tab("First"))).json()
    second = (await client.post("/api/tabs", json=_tab("Second"))).json()

    assert (await client.post(f"/api/tabs/{first['id']}/favorite", headers=headers)).json()["is_favorited"] is True
    await client.post(f"/api/tabs/{second['id']}/favorite", headers=headers)
    assert (await client.get(f"/api/tabs/{first['id']}", headers=headers)).json()["is_favorited"] is True

    favorites = (await client.get("/api/me/favorites", headers=headers)).json()["items"]
    assert {t["song_name"] for t in favorites} == {"First", "Second"}

    assert (await client.post(f"/api/tabs/{first['id']}/favorite", headers=headers)).json()["is_favorited"] is False
    favorites = (await client.get("/api/me/favorites", headers=headers)).json()["items"]
    assert [t["song_name"] for t in favorites] == ["Second"]


async def test_favorites_are_private_and_need_login(client):
    tab = (await client.post("/api/tabs", json=_tab())).json()
    assert (await client.post(f"/api/tabs/{tab['id']}/favorite")).status_code == 401
    alice = await _login(client, "alice")
    bob = await _login(client, "bob")
    await client.post(f"/api/tabs/{tab['id']}/favorite", headers=alice)
    assert (await client.get("/api/me/favorites", headers=bob)).json()["items"] == []
    assert (await client.get(f"/api/tabs/{tab['id']}", headers=bob)).json()["is_favorited"] is False


async def test_cannot_favorite_someone_elses_draft(client):
    owner = await _login(client, "owner")
    other = await _login(client, "other")
    draft = (await client.post("/api/tabs", json=_tab(publish=False), headers=owner)).json()
    assert (await client.post(f"/api/tabs/{draft['id']}/favorite", headers=other)).status_code == 404


# ---------------------------------------------------------------------------
# Forks
# ---------------------------------------------------------------------------


async def test_fork_copies_tab_into_callers_draft(client):
    source_owner = await _login(client, "earl")
    forker = await _login(client, "ralph")
    notes = [{**_NOTE, "chord": "G", "lyric": "Hey", "thumb_after": True}]
    source = (
        await client.post(
            "/api/tabs", json=_tab("Foggy", notes=notes, style="scruggs", time_signature="4/4"), headers=source_owner
        )
    ).json()

    resp = await client.post(f"/api/tabs/{source['id']}/fork", headers=forker)
    assert resp.status_code == 201
    fork = resp.json()
    assert fork["id"] != source["id"]
    assert fork["owner_username"] == "ralph"
    assert fork["status"] == "draft"
    assert fork["forked_from"] == {"id": source["id"], "song_name": "Foggy", "owner_username": "earl"}
    assert (fork["song_name"], fork["style"], fork["time_signature"]) == ("Foggy", "scruggs", "4/4")
    assert [(n["chord"], n["lyric"], n["thumb_after"]) for n in fork["notes"]] == [("G", "Hey", True)]

    # The fork is independent: editing it leaves the source alone.
    await client.put(f"/api/tabs/{fork['id']}", json=_tab("My Foggy"), headers=forker)
    assert (await client.get(f"/api/tabs/{source['id']}")).json()["song_name"] == "Foggy"


async def test_fork_requires_login_and_a_visible_tab(client):
    owner = await _login(client, "owner2")
    other = await _login(client, "other2")
    published = (await client.post("/api/tabs", json=_tab())).json()
    draft = (await client.post("/api/tabs", json=_tab(publish=False), headers=owner)).json()
    assert (await client.post(f"/api/tabs/{published['id']}/fork")).status_code == 401
    assert (await client.post(f"/api/tabs/{draft['id']}/fork", headers=other)).status_code == 404
    assert (await client.post(f"/api/tabs/{draft['id']}/fork", headers=owner)).status_code == 201


async def test_fork_link_survives_source_deletion(client):
    owner = await _login(client, "owner3")
    forker = await _login(client, "forker3")
    source = (await client.post("/api/tabs", json=_tab(), headers=owner)).json()
    fork = (await client.post(f"/api/tabs/{source['id']}/fork", headers=forker)).json()
    assert (await client.delete(f"/api/tabs/{source['id']}", headers=owner)).status_code == 204
    fetched = await client.get(f"/api/tabs/{fork['id']}", headers=forker)
    assert fetched.status_code == 200
    assert fetched.json()["forked_from"] is None


# ---------------------------------------------------------------------------
# Setlists
# ---------------------------------------------------------------------------


async def test_setlist_create_add_reorder_rename_delete(client):
    headers = await _login(client, "jammer")
    a = (await client.post("/api/tabs", json=_tab("A"))).json()
    b = (await client.post("/api/tabs", json=_tab("B"))).json()

    created = await client.post("/api/setlists", json={"name": "  Friday jam  "}, headers=headers)
    assert created.status_code == 201
    setlist = created.json()
    assert (setlist["name"], setlist["tabs"]) == ("Friday jam", [])

    await client.post(f"/api/setlists/{setlist['id']}/tabs", json={"tab_id": a["id"]}, headers=headers)
    added = (await client.post(f"/api/setlists/{setlist['id']}/tabs", json={"tab_id": b["id"]}, headers=headers)).json()
    assert [t["song_name"] for t in added["tabs"]] == ["A", "B"]

    updated = (
        await client.put(
            f"/api/setlists/{setlist['id']}", json={"name": "Sat jam", "tab_ids": [b["id"], a["id"]]}, headers=headers
        )
    ).json()
    assert (updated["name"], [t["song_name"] for t in updated["tabs"]]) == ("Sat jam", ["B", "A"])

    summaries = (await client.get("/api/setlists", headers=headers)).json()
    assert [(s["name"], s["tab_count"]) for s in summaries] == [("Sat jam", 2)]

    assert (await client.delete(f"/api/setlists/{setlist['id']}", headers=headers)).status_code == 204
    assert (await client.get("/api/setlists", headers=headers)).json() == []


async def test_setlists_are_private(client):
    alice = await _login(client, "alice2")
    bob = await _login(client, "bob2")
    setlist = (await client.post("/api/setlists", json={"name": "Mine"}, headers=alice)).json()
    for method, path, body in [
        ("GET", f"/api/setlists/{setlist['id']}", None),
        ("PUT", f"/api/setlists/{setlist['id']}", {"name": "Hijacked", "tab_ids": []}),
        ("DELETE", f"/api/setlists/{setlist['id']}", None),
    ]:
        resp = await client.request(method, path, json=body, headers=bob)
        assert resp.status_code == 404, (method, path)
    assert (await client.get("/api/setlists", headers=bob)).json() == []
    assert (await client.get("/api/setlists")).status_code == 401


async def test_setlist_rejects_bad_names_and_unknown_or_hidden_tabs(client):
    owner = await _login(client, "owner4")
    user = await _login(client, "user4")
    draft = (await client.post("/api/tabs", json=_tab(publish=False), headers=owner)).json()
    assert (await client.post("/api/setlists", json={"name": "   "}, headers=user)).status_code == 400
    assert (await client.post("/api/setlists", json={"name": "x" * 101}, headers=user)).status_code == 400

    setlist = (await client.post("/api/setlists", json={"name": "Jam"}, headers=user)).json()
    for tab_id in ["does-not-exist", draft["id"]]:
        resp = await client.post(f"/api/setlists/{setlist['id']}/tabs", json={"tab_id": tab_id}, headers=user)
        assert resp.status_code == 404
