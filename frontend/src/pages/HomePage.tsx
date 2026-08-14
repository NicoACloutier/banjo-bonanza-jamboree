/**
 * Home page: browse + search published tabs, sorted by vote count.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { SearchBar } from "../components/SearchBar";
import { TabsApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import type { TabListResponse } from "../types/api";

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [results, setResults] = useState<TabListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await TabsApi.search(q || undefined, 1, 20);
      setResults(data);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load tabs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(query);
  }, [query, load]);

  return (
    <div>
      <div className="panel">
        <h1>Browse Banjo Tabs</h1>
        <SearchBar
          initialQuery={query}
          onSearch={(q) => setSearchParams(q ? { q } : {})}
        />
        {loading && <p>Loading...</p>}
        {error && <p className="error-banner">{error}</p>}
        {!loading && results && results.items.length === 0 && <p>No tabs found. Be the first to add one!</p>}
        <ul className="tab-list">
          {results?.items.map((tab) => (
            <li className="tab-list-item" key={tab.id}>
              <div>
                <Link to={`/tabs/${tab.id}`}>
                  <strong>{tab.song_name}</strong>
                </Link>
                {tab.artist && <span> by {tab.artist}</span>}
                <span className="tag">{tab.tuning_key}</span>
                <br />
                <span className="muted-text">
                  by <Link to={`/users/${tab.owner_username}`}>{tab.owner_username}</Link>
                </span>
              </div>
              <span className="vote-count">👍 {tab.vote_count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
