/** The logged-in user's setlists: list them and make new ones. */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { LibraryApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import type { SetlistSummary } from "../types/api";

export function SetlistsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [setlists, setSetlists] = useState<SetlistSummary[] | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    LibraryApi.setlists()
      .then(setSetlists)
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Failed to load setlists."));
  }, [user]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const setlist = await LibraryApi.createSetlist(name.trim());
      navigate(`/setlists/${setlist.id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to create the setlist.");
    }
  };

  if (!user) {
    return (
      <div className="panel">
        <h1>Setlists</h1>
        <p>
          <Link to="/login">Log in</Link> to make setlists of tabs for a jam or gig.
        </p>
      </div>
    );
  }

  return (
    <div className="panel">
      <h1>Setlists</h1>
      <p className="muted-text">
        Group tabs you want to play together, in order. Add tabs from any tab's page.
      </p>
      {error && <p className="error-banner">{error}</p>}
      <form className="toolbar" onSubmit={create}>
        <label style={{ flex: 1 }}>
          New setlist
          <input
            type="text"
            value={name}
            maxLength={100}
            placeholder="e.g. Friday jam"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button type="submit" disabled={!name.trim()}>
          Create
        </button>
      </form>
      {!setlists && !error && <p>Loading...</p>}
      {setlists?.length === 0 && <p className="muted-text">No setlists yet.</p>}
      <ul className="tab-list">
        {setlists?.map((s) => (
          <li className="tab-list-item" key={s.id}>
            <Link to={`/setlists/${s.id}`}>
              <strong>{s.name}</strong>
            </Link>
            <span className="muted-text">
              {s.tab_count} {s.tab_count === 1 ? "tab" : "tabs"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
