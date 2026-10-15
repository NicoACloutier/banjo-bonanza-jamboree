/**
 * A user's public profile: lists their published tabs, plus a separate
 * drafts section when you're viewing your own profile while logged in. Each
 * section pages on its own (`page` and `drafts_page` in the URL), so moving
 * through your drafts leaves the published tabs where they were.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Pagination, PastLastPage } from "../components/Pagination";
import { TabList } from "../components/TabList";
import { useAuth } from "../hooks/useAuth";
import { UsersApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import { readPage, withPage } from "../lib/pagination";
import type { TabListResponse, TabStatus, UserPublic } from "../types/api";

const PAGE_SIZE = 20;

interface TabSectionProps {
  username: string;
  status: TabStatus;
  /** The URL search param holding this section's page number. */
  pageParam: string;
  /** Changes when the viewer logs in or out, so the list is refetched. */
  viewerKey: string;
  emptyMessage: ReactNode;
}

function TabSection({ username, status, pageParam, viewerKey, emptyMessage }: TabSectionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = readPage(searchParams, pageParam);
  const [tabs, setTabs] = useState<TabListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let current = true;
    setError(null);
    UsersApi.tabs(username, page, PAGE_SIZE, status)
      .then((result) => {
        if (current) setTabs(result);
      })
      .catch((err) => {
        if (current) setError(err instanceof ApiRequestError ? err.message : "Failed to load tabs.");
      });
    return () => {
      current = false;
    };
  }, [username, page, status, viewerKey]);

  const setPage = (nextPage: number) => {
    setSearchParams(withPage(searchParams, nextPage, pageParam));
    top.current?.scrollIntoView?.({ block: "nearest" });
  };

  return (
    <div ref={top}>
      {error && <p className="error-banner">{error}</p>}
      {!tabs && !error && <p>Loading...</p>}
      {tabs && (
        <>
          <TabList
            tabs={tabs.items}
            showOwner={false}
            emptyMessage={page > 1 ? <PastLastPage onFirstPage={() => setPage(1)} /> : emptyMessage}
          />
          <Pagination page={page} pageSize={PAGE_SIZE} total={tabs.total} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export function UserProfilePage() {
  const { username } = useParams();
  const { user: viewer } = useAuth();
  const [user, setUser] = useState<UserPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    UsersApi.get(username)
      .then(setUser)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "User not found."));
  }, [username]);

  if (error) return <p className="error-banner">{error}</p>;
  if (!user) return <p>Loading...</p>;

  const viewerKey = viewer?.username ?? "";
  if (viewer?.username !== user.username) {
    return (
      <div className="panel">
        <h1>{user.username}'s Tabs</h1>
        <TabSection
          username={user.username}
          status="published"
          pageParam="page"
          viewerKey={viewerKey}
          emptyMessage="No tabs published yet."
        />
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>My Tabs</h1>
      <h2>Drafts</h2>
      <p className="muted-text">Only you can see your drafts. Open one to keep editing or publish it.</p>
      <TabSection
        username={user.username}
        status="draft"
        pageParam="drafts_page"
        viewerKey={viewerKey}
        emptyMessage="No drafts."
      />
      <h2>Published</h2>
      <TabSection
        username={user.username}
        status="published"
        pageParam="page"
        viewerKey={viewerKey}
        emptyMessage={
          <>
            No tabs published yet. <Link to="/tabs/new">Create one</Link>.
          </>
        }
      />
    </div>
  );
}
