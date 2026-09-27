/**
 * Library actions on a tab for a logged-in user: favorite it, fork it into
 * their own editable draft, or add it to one of their setlists.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LibraryApi, TabsApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import type { SetlistSummary, TabDetail } from "../types/api";

interface TabLibraryActionsProps {
  tab: TabDetail;
  onFavoriteChange: (isFavorited: boolean) => void;
}

const message = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback);

export function TabLibraryActions({ tab, onFavoriteChange }: TabLibraryActionsProps) {
  const navigate = useNavigate();
  const [setlists, setSetlists] = useState<SetlistSummary[] | null>(null);
  const [setlistId, setSetlistId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    LibraryApi.setlists()
      .then((list) => {
        setSetlists(list);
        setSetlistId(list[0]?.id ?? "");
      })
      .catch(() => setSetlists([]));
  }, []);

  const run = async (action: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (err) {
      setStatus(message(err, fallback));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="toolbar no-print library-actions">
      <button
        type="button"
        className={tab.is_favorited ? "" : "secondary"}
        aria-pressed={tab.is_favorited}
        disabled={busy}
        onClick={() =>
          run(async () => onFavoriteChange((await TabsApi.favorite(tab.id)).is_favorited), "Couldn't update favorites.")
        }
      >
        {tab.is_favorited ? "★ Favorited" : "☆ Favorite"}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={busy}
        title="Copy this tab into a new draft of your own that you can edit"
        onClick={() =>
          run(async () => {
            const fork = await TabsApi.fork(tab.id);
            navigate(`/tabs/${fork.id}/edit`);
          }, "Couldn't fork this tab.")
        }
      >
        Fork
      </button>
      {setlists && setlists.length > 0 ? (
        <span className="inline-controls">
          <select value={setlistId} onChange={(e) => setSetlistId(e.target.value)} aria-label="Setlist">
            {setlists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="secondary"
            disabled={busy || !setlistId}
            onClick={() =>
              run(async () => {
                const updated = await LibraryApi.addToSetlist(setlistId, tab.id);
                setStatus(`Added to "${updated.name}".`);
              }, "Couldn't add to the setlist.")
            }
          >
            Add to setlist
          </button>
        </span>
      ) : (
        setlists && <Link to="/setlists">Make a setlist</Link>
      )}
      {status && <span className="muted-text" role="status">{status}</span>}
    </div>
  );
}
