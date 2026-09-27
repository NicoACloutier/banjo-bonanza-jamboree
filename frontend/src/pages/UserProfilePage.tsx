/**
 * A user's public profile: lists their published tabs (plus drafts, if
 * you're viewing your own profile while logged in).
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { TabList } from "../components/TabList";
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
      {tabs && <TabList tabs={tabs.items} showOwner={false} emptyMessage="No tabs published yet." />}
    </div>
  );
}
