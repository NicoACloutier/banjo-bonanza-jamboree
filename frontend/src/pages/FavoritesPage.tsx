/** The logged-in user's favorited tabs. */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TabList } from "../components/TabList";
import { useAuth } from "../hooks/useAuth";
import { LibraryApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import type { TabSummary } from "../types/api";

export function FavoritesPage() {
  const { user } = useAuth();
  const [tabs, setTabs] = useState<TabSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    LibraryApi.favorites()
      .then((result) => setTabs(result.items))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Failed to load favorites."));
  }, [user]);

  if (!user) {
    return (
      <div className="panel">
        <h1>Favorites</h1>
        <p>
          <Link to="/login">Log in</Link> to keep a list of your favorite tabs.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>Favorites</h1>
      {error && <p className="error-banner">{error}</p>}
      {!tabs && !error && <p>Loading...</p>}
      {tabs && <TabList tabs={tabs} emptyMessage="No favorites yet. Tap ☆ Favorite on any tab to save it here." />}
    </div>
  );
}
