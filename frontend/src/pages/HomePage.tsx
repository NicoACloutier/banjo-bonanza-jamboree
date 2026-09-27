/**
 * Home page: browse + search published tabs, sorted by vote count, with
 * optional filters (style, difficulty, tuning, key) kept in the URL so a
 * filtered view can be bookmarked or shared.
 */
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SearchBar } from "../components/SearchBar";
import { TabList } from "../components/TabList";
import { TabsApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import { DIFFICULTY_LABELS, SONG_KEYS, STYLE_LABELS } from "../lib/tabSettings";
import { FALLBACK_TUNINGS } from "../lib/tunings";
import type { TabListResponse, TabSearchFilters } from "../types/api";

const FILTER_KEYS = ["q", "style", "difficulty", "tuning", "song_key"] as const;

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [results, setResults] = useState<TabListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const filters: TabSearchFilters = Object.fromEntries(
    FILTER_KEYS.flatMap((key) => {
      const value = searchParams.get(key);
      return value ? [[key, value]] : [];
    }),
  );
  const filtersKey = searchParams.toString();

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  const load = useCallback(async (f: TabSearchFilters) => {
    setLoading(true);
    setError(null);
    try {
      setResults(await TabsApi.search(f, 1, 20));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load tabs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filters);
    // Reload whenever the URL's filters change (`filters` is rebuilt every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, load]);

  const hasFilters = FILTER_KEYS.some((key) => key !== "q" && searchParams.get(key));

  return (
    <div>
      <div className="panel">
        <h1>Browse Banjo Tabs</h1>
        <SearchBar initialQuery={filters.q ?? ""} onSearch={(q) => setFilter("q", q)} />
        <div className="form-row browse-filters">
          <label>
            Style
            <select value={filters.style ?? ""} onChange={(e) => setFilter("style", e.target.value)}>
              <option value="">Any</option>
              {Object.entries(STYLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Difficulty
            <select value={filters.difficulty ?? ""} onChange={(e) => setFilter("difficulty", e.target.value)}>
              <option value="">Any</option>
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Tuning
            <select value={filters.tuning ?? ""} onChange={(e) => setFilter("tuning", e.target.value)}>
              <option value="">Any</option>
              {FALLBACK_TUNINGS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.display_name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Key
            <select value={filters.song_key ?? ""} onChange={(e) => setFilter("song_key", e.target.value)}>
              <option value="">Any</option>
              {SONG_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>
        </div>
        {loading && <p>Loading...</p>}
        {error && <p className="error-banner">{error}</p>}
        {!loading && results && (
          <TabList
            tabs={results.items}
            emptyMessage={hasFilters ? "No tabs match these filters." : "No tabs found. Be the first to add one!"}
          />
        )}
      </div>
    </div>
  );
}
