/**
 * View + play a single tab: renders the tab sheet, provides playback
 * controls (tempo/transpose/auto-scroll), and lets logged-in users vote or
 * edit their own tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PlaybackControls } from "../components/PlaybackControls";
import { TabRenderer } from "../components/TabRenderer";
import { VoteButton } from "../components/VoteButton";
import { useAuth } from "../hooks/useAuth";
import { TabsApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import { FALLBACK_TUNINGS, getFallbackTuning } from "../lib/tunings";
import { TabPlaybackEngine } from "../lib/playbackEngine";
import { Metronome } from "../lib/metronome";
import type { TabDetail, TabRevisionSummary, TuningOut } from "../types/api";

export function TabViewPage() {
  const { tabId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState<TabDetail | null>(null);
  const [tuning, setTuning] = useState<TuningOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [tempoBpm, setTempoBpm] = useState(100);
  const [transposeSemitones, setTransposeSemitones] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingNoteId, setPlayingNoteId] = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [scrollSpeed, setScrollSpeed] = useState(4);

  // Section loop/repeat: user picks a start/end note in the preview, then
  // toggles loop mode so playback repeats just that region indefinitely.
  const [loopStartId, setLoopStartId] = useState<string | null>(null);
  const [loopEndId, setLoopEndId] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);

  // Metronome: an independent click track with its own on/off toggle,
  // reusing the same tempo control as playback.
  const [metronomeOn, setMetronomeOn] = useState(false);
  const metronomeRef = useRef<Metronome | null>(null);

  // Revision history (owner-only): lets the tab's owner browse and restore
  // prior saved versions.
  const [revisions, setRevisions] = useState<TabRevisionSummary[]>([]);
  const [showRevisions, setShowRevisions] = useState(false);

  const engineRef = useRef<TabPlaybackEngine | null>(null);
  const scrollIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!tabId) return;
    setLoading(true);
    TabsApi.get(tabId)
      .then((data) => {
        setTab(data);
        setTempoBpm(data.tempo_bpm);
        try {
          setTuning(getFallbackTuning(data.tuning_key));
        } catch {
          setTuning(FALLBACK_TUNINGS[0]);
        }
      })
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Failed to load tab."))
      .finally(() => setLoading(false));
  }, [tabId]);

  useEffect(() => {
    engineRef.current = new TabPlaybackEngine({
      onProgress: (noteId) => setPlayingNoteId(noteId),
      onEnded: () => stopEverything(),
    });
    metronomeRef.current = new Metronome();
    return () => {
      engineRef.current?.dispose();
      metronomeRef.current?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopEverything = useCallback(() => {
    setIsPlaying(false);
    setPlayingNoteId(null);
    if (scrollIntervalRef.current !== null) {
      window.clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  const handlePlay = () => {
    if (!tab || !tuning) return;
    const loop =
      loopEnabled && loopStartId && loopEndId
        ? (() => {
            const startIdx = tab.notes.findIndex((n) => n.id === loopStartId);
            const endIdx = tab.notes.findIndex((n) => n.id === loopEndId);
            if (startIdx === -1 || endIdx === -1) return undefined;
            const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            return { startPosition: tab.notes[lo].position, endPosition: tab.notes[hi].position };
          })()
        : undefined;
    engineRef.current?.play(tab.notes, tuning, tempoBpm, transposeSemitones, {
      capoFret: tab.capo_fret,
      loop,
    });
    setIsPlaying(true);
    if (autoScroll) {
      scrollIntervalRef.current = window.setInterval(() => {
        window.scrollBy({ top: scrollSpeed, behavior: "smooth" });
      }, 200);
    }
  };

  const handleStop = () => {
    engineRef.current?.stop();
    stopEverything();
  };

  const toggleMetronome = () => {
    if (metronomeOn) {
      metronomeRef.current?.stop();
      setMetronomeOn(false);
    } else {
      metronomeRef.current?.start(tempoBpm);
      setMetronomeOn(true);
    }
  };

  // Keep a running metronome in sync if the tempo slider changes mid-click.
  useEffect(() => {
    if (metronomeOn) metronomeRef.current?.start(tempoBpm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempoBpm]);

  const handleVote = async () => {
    if (!tab) return;
    try {
      const result = await TabsApi.vote(tab.id);
      setTab({ ...tab, vote_count: result.vote_count, has_voted: result.has_voted });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to vote.");
    }
  };

  const loadRevisions = async () => {
    if (!tab) return;
    try {
      const list = await TabsApi.revisions(tab.id);
      setRevisions(list);
      setShowRevisions(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to load revision history.");
    }
  };

  const restoreRevision = async (revisionId: string) => {
    if (!tab) return;
    try {
      const restored = await TabsApi.restoreRevision(tab.id, revisionId);
      setTab(restored);
      setShowRevisions(false);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to restore revision.");
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-banner">{error}</p>;
  if (!tab || !tuning) return <p>Tab not found.</p>;

  const isOwner = user?.id === tab.owner_id;

  return (
    <div className="panel tab-view-page">
      <h1>{tab.song_name}</h1>
      <p className="muted-text">
        {tab.artist && <>by {tab.artist} </>}
        {tab.album && <>· {tab.album} </>}
        · Tuning: {tuning.display_name}
        {tab.capo_fret > 0 && <> · Capo: fret {tab.capo_fret}</>} · By{" "}
        <Link to={`/users/${tab.owner_username}`}>{tab.owner_username}</Link>
        {tab.status === "draft" && <span className="tag">DRAFT</span>}
      </p>

      <div className="toolbar no-print">
        <VoteButton voteCount={tab.vote_count} hasVoted={tab.has_voted} onVote={handleVote} />
        {isOwner && <button onClick={() => navigate(`/tabs/${tab.id}/edit`)}>Edit</button>}
        {isOwner && <button className="secondary" onClick={loadRevisions}>History</button>}
        <button className="secondary" onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>

      {showRevisions && (
        <div className="panel no-print">
          <h3>Revision history</h3>
          {revisions.length === 0 && <p className="muted-text">No prior revisions saved yet.</p>}
          <ul>
            {revisions.map((rev) => (
              <li key={rev.id}>
                {new Date(rev.created_at).toLocaleString()}{" "}
                <button className="secondary" onClick={() => restoreRevision(rev.id)}>
                  Restore
                </button>
              </li>
            ))}
          </ul>
          <button className="secondary" onClick={() => setShowRevisions(false)}>
            Close
          </button>
        </div>
      )}

      <PlaybackControls
        tempoBpm={tempoBpm}
        onTempoChange={setTempoBpm}
        transposeSemitones={transposeSemitones}
        onTransposeChange={setTransposeSemitones}
        isPlaying={isPlaying}
        onPlay={handlePlay}
        onStop={handleStop}
        autoScroll={autoScroll}
        onAutoScrollChange={setAutoScroll}
        scrollSpeed={scrollSpeed}
        onScrollSpeedChange={setScrollSpeed}
      />

      <div className="toolbar no-print">
        <label>
          <input type="checkbox" checked={metronomeOn} onChange={toggleMetronome} />
          Metronome
        </label>
        <label>
          <input
            type="checkbox"
            checked={loopEnabled}
            onChange={(e) => setLoopEnabled(e.target.checked)}
            disabled={!loopStartId || !loopEndId}
          />
          Loop section
        </label>
        <label>
          Loop start
          <select value={loopStartId ?? ""} onChange={(e) => setLoopStartId(e.target.value || null)}>
            <option value="">(none)</option>
            {tab.notes.map((n, idx) => (
              <option key={n.id} value={n.id}>
                Note {idx + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loop end
          <select value={loopEndId ?? ""} onChange={(e) => setLoopEndId(e.target.value || null)}>
            <option value="">(none)</option>
            {tab.notes.map((n, idx) => (
              <option key={n.id} value={n.id}>
                Note {idx + 1}
              </option>
            ))}
          </select>
        </label>
      </div>

      <TabRenderer notes={tab.notes} playingNoteId={playingNoteId} />
    </div>
  );
}

