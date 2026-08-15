/**
 * Create/edit page for a tab. Anonymous visitors can create a tab, but it
 * is published immediately under "Anonymous" (no draft saving allowed);
 * logged-in users may save as a draft and publish later.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TabEditor, type TabMetadata } from "../components/TabEditor";
import { useAuth } from "../hooks/useAuth";
import { TabsApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import { FALLBACK_TUNINGS } from "../lib/tunings";
import type { NoteIn, NoteOut, TuningOut } from "../types/api";

function notesToNoteIn(notes: NoteOut[]): NoteIn[] {
  return notes.map((n, idx) => ({
    position: idx,
    duration_beats: n.duration_beats,
    line_break: n.line_break,
    lyric: n.lyric,
    is_rest: n.is_rest,
    frets: n.frets.map((f) => ({
      string_number: f.string_number,
      fret: f.fret,
      technique: f.technique,
      slide_to_fret: f.slide_to_fret,
    })),
  }));
}

export function TabEditorPage() {
  const { tabId } = useParams();
  const isEditing = Boolean(tabId);
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tunings, setTunings] = useState<TuningOut[]>(FALLBACK_TUNINGS);
  const [metadata, setMetadata] = useState<TabMetadata>({
    songName: "",
    artist: "",
    album: "",
    tuningKey: FALLBACK_TUNINGS[0].key,
    tempoBpm: 100,
  });
  const [notes, setNotes] = useState<NoteOut[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(isEditing);

  useEffect(() => {
    TabsApi.tunings()
      .then(setTunings)
      .catch(() => {
        /* fall back to the bundled tuning list on network failure */
      });
  }, []);

  useEffect(() => {
    if (!tabId) return;
    TabsApi.get(tabId)
      .then((tab) => {
        setMetadata({
          songName: tab.song_name,
          artist: tab.artist ?? "",
          album: tab.album ?? "",
          tuningKey: tab.tuning_key,
          tempoBpm: tab.tempo_bpm,
        });
        setNotes(tab.notes);
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Failed to load tab."))
      .finally(() => setLoading(false));
  }, [tabId]);

  const submit = useCallback(
    async (publish: boolean) => {
      setError(null);
      if (!metadata.songName.trim()) {
        setError("Song name is required.");
        return;
      }
      if (!publish && !user) {
        setError("Log in to save a draft. Anonymous tabs are published immediately.");
        return;
      }
      setSubmitting(true);
      try {
        const payload = {
          song_name: metadata.songName.trim(),
          artist: metadata.artist.trim() || null,
          album: metadata.album.trim() || null,
          tuning_key: metadata.tuningKey,
          tempo_bpm: metadata.tempoBpm,
          notes: notesToNoteIn(notes),
          publish,
        };
        const saved = isEditing && tabId ? await TabsApi.update(tabId, payload) : await TabsApi.create(payload);
        navigate(`/tabs/${saved.id}`);
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Failed to save tab.");
      } finally {
        setSubmitting(false);
      }
    },
    [metadata, notes, isEditing, tabId, user, navigate],
  );

  if (loading) return <p>Loading...</p>;

  return (
    <div className="panel">
      <h1>{isEditing ? "Edit Tab" : "Create a New Tab"}</h1>
      {!user && (
        <p className="muted-text">
          You are not logged in: this tab will be created directly (published immediately) under the
          username "Anonymous". Log in to save drafts and vote.
        </p>
      )}
      {error && <p className="error-banner">{error}</p>}
      <TabEditor
        tunings={tunings}
        metadata={metadata}
        onMetadataChange={setMetadata}
        notes={notes}
        onNotesChange={setNotes}
      />
      <div className="toolbar">
        {user && (
          <button className="secondary" disabled={submitting} onClick={() => submit(false)}>
            Save Draft
          </button>
        )}
        <button disabled={submitting} onClick={() => submit(true)}>
          Publish
        </button>
      </div>
    </div>
  );
}
