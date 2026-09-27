/**
 * One of the user's setlists: its tabs in order, with controls to reorder,
 * remove, rename or delete, and to save every tab in it for offline use.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { TabList } from "../components/TabList";
import { LibraryApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import { offlineCachingAvailable, saveTabsForOffline } from "../lib/offline";
import type { SetlistDetail } from "../types/api";

const message = (err: unknown, fallback: string) => (err instanceof ApiRequestError ? err.message : fallback);

export function SetlistPage() {
  const { setlistId } = useParams();
  const navigate = useNavigate();
  const [setlist, setSetlist] = useState<SetlistDetail | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (!setlistId) return;
    LibraryApi.setlist(setlistId)
      .then((result) => {
        setSetlist(result);
        setName(result.name);
      })
      .catch((err) => setError(message(err, "Failed to load the setlist.")));
  }, [setlistId]);

  /** Save a new name and/or order. */
  const save = async (nextName: string, tabIds: string[]) => {
    if (!setlist) return;
    setError(null);
    try {
      const updated = await LibraryApi.updateSetlist(setlist.id, nextName, tabIds);
      setSetlist(updated);
      setName(updated.name);
    } catch (err) {
      setError(message(err, "Failed to save the setlist."));
    }
  };

  if (error && !setlist) return <p className="error-banner">{error}</p>;
  if (!setlist) return <p>Loading...</p>;

  const ids = setlist.tabs.map((t) => t.id);
  const move = (index: number, delta: number) => {
    const next = [...ids];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    void save(setlist.name, next);
  };

  const saveOffline = async () => {
    setStatus("Saving...");
    const saved = await saveTabsForOffline(ids);
    setStatus(
      offlineCachingAvailable()
        ? `Saved ${saved} of ${ids.length} tabs for offline use.`
        : "Loaded the tabs, but offline saving only works in the installed app (production build).",
    );
  };

  return (
    <div className="panel">
      <p className="muted-text">
        <Link to="/setlists">← All setlists</Link>
      </p>
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void save(name, ids);
        }}
      >
        <label style={{ flex: 1 }}>
          Setlist name
          <input type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="secondary" disabled={!name.trim() || name === setlist.name}>
          Rename
        </button>
      </form>
      {error && <p className="error-banner">{error}</p>}

      <div className="toolbar">
        <button type="button" className="secondary" disabled={ids.length === 0} onClick={saveOffline}>
          Save for offline
        </button>
        {confirmingDelete ? (
          <>
            <span>Delete "{setlist.name}"? (The tabs themselves stay.)</span>
            <button
              type="button"
              onClick={() =>
                LibraryApi.deleteSetlist(setlist.id)
                  .then(() => navigate("/setlists"))
                  .catch((err) => setError(message(err, "Failed to delete the setlist.")))
              }
            >
              Yes, delete
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="secondary" onClick={() => setConfirmingDelete(true)}>
            Delete setlist
          </button>
        )}
        {status && (
          <span className="muted-text" role="status">
            {status}
          </span>
        )}
      </div>

      <TabList
        tabs={setlist.tabs}
        emptyMessage="No tabs yet. Open any tab and use “Add to setlist”."
        renderActions={(_, index) => (
          <span className="inline-controls">
            <button
              type="button"
              className="secondary"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="secondary"
              aria-label="Move down"
              disabled={index === ids.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="secondary"
              aria-label="Remove from setlist"
              onClick={() => void save(setlist.name, ids.filter((_, i) => i !== index))}
            >
              ✕
            </button>
          </span>
        )}
      />
    </div>
  );
}
