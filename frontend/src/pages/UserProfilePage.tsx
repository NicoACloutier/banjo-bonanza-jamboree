/**
 * A user's public profile: lists their published tabs, plus a separate
 * drafts section when you're viewing your own profile while logged in.
 */
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TabList } from "../components/TabList";
import { useAuth } from "../hooks/useAuth";
import { UsersApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import type { TabListResponse, UserPublic } from "../types/api";

export function UserProfilePage() {
  const { username } = useParams();
  const { user: viewer } = useAuth();
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
    // Refetch when the viewer logs in or out: only the owner gets their drafts.
  }, [username, viewer?.username]);

  if (error) return <p className="error-banner">{error}</p>;
  if (!user) return <p>Loading...</p>;

  const isOwnProfile = viewer?.username === user.username;
  const drafts = tabs?.items.filter((tab) => tab.status === "draft") ?? [];
  const published = tabs?.items.filter((tab) => tab.status !== "draft") ?? [];

  if (!isOwnProfile) {
    return (
      <div className="panel">
        <h1>{user.username}'s Tabs</h1>
        {tabs && <TabList tabs={published} showOwner={false} emptyMessage="No tabs published yet." />}
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>My Tabs</h1>
      {tabs && (
        <>
          <h2>Drafts</h2>
          <p className="muted-text">Only you can see your drafts. Open one to keep editing or publish it.</p>
          <TabList tabs={drafts} showOwner={false} emptyMessage="No drafts." />
          <h2>Published</h2>
          <TabList
            tabs={published}
            showOwner={false}
            emptyMessage={<>No tabs published yet. <Link to="/tabs/new">Create one</Link>.</>}
          />
        </>
      )}
    </div>
  );
}
