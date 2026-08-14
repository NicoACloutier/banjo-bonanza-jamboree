/**
 * A user's public profile: lists their published tabs (plus drafts, if
 * you're viewing your own profile while logged in).
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { UsersApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import type { TabListResponse, UserPublic } from "../types/api";

export function UserProfilePage() {
  const { username } = useParams();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [tabs, setTabs] = useState<TabListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    UsersApi.get(username)
      .then(setUser)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "User not found."));
    UsersApi.tabs(username, 1, 50)
      .then(setTabs)
      .catch(() => undefined);
  }, [username]);

  if (error) return <p className="error-banner">{error}</p>;
  if (!user) return <p>Loading...</p>;

  return (
    <div className="panel">
      <h1>{user.username}'s Tabs</h1>
      <ul className="tab-list">
        {tabs?.items.map((tab) => (
          <li className="tab-list-item" key={tab.id}>
            <div>
              <Link to={`/tabs/${tab.id}`}>
                <strong>{tab.song_name}</strong>
              </Link>
              {tab.status === "draft" && <span className="tag">DRAFT</span>}
            </div>
            <span className="vote-count">👍 {tab.vote_count}</span>
          </li>
        ))}
        {tabs?.items.length === 0 && <p>No tabs published yet.</p>}
      </ul>
    </div>
  );
}
