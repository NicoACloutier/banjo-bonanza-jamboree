/**
 * View + play a single tab: renders the tab sheet and its chord diagrams,
 * provides playback controls (tempo/transpose/auto-scroll), and lets
 * logged-in users vote, favorite, fork, add it to a setlist, or edit their
 * own tab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PlaybackControls } from "../components/PlaybackControls";
import { TabChords } from "../components/TabChords";
import { TabLibraryActions } from "../components/TabLibraryActions";
import { TabRenderer } from "../components/TabRenderer";
import { VoteButton } from "../components/VoteButton";
import { useAuth } from "../hooks/useAuth";
import { TabsApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";
import { FALLBACK_TUNINGS, getFallbackTuning } from "../lib/tunings";
import { TabPlaybackEngine } from "../lib/playbackEngine";
import { Metronome } from "../lib/metronome";
import { NOTES_PER_LINE } from "../lib/tabLayout";
import { chordsUsed, DIFFICULTY_LABELS, playOptionsFor, STYLE_LABELS } from "../lib/tabSettings";
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
  // The chord whose diagram was last clicked in the tab.
  const [highlightedChord, setHighlightedChord] = useState<string | null>(null);

  // Section loop/repeat: user picks a start/end note (by line number + note
  // number within that line) in the preview, then toggles loop mode so
  // playback repeats just that region indefinitely. `null` for a line means
  // "no note chosen yet" for that end of the range.
  const [loopStartLine, setLoopStartLine] = useState<number | null>(null);
  const [loopStartNoteInLine, setLoopStartNoteInLine] = useState(0);
  const [loopEndLine, setLoopEndLine] = useState<number | null>(null);
  const [loopEndNoteInLine, setLoopEndNoteInLine] = useState(0);
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
    const loopStartNote =
      loopStartLine !== null ? (tab.notes[loopStartLine * NOTES_PER_LINE + loopStartNoteInLine] ?? null) : null;
    const loopEndNote =
      loopEndLine !== null ? (tab.notes[loopEndLine * NOTES_PER_LINE + loopEndNoteInLine] ?? null) : null;
    const loop =
      loopEnabled && loopStartNote && loopEndNote
        ? (() => {
            const startIdx = tab.notes.findIndex((n) => n.id === loopStartNote.id);
            const endIdx = tab.notes.findIndex((n) => n.id === loopEndNote.id);
            if (startIdx === -1 || endIdx === -1) return undefined;
            const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            return { startPosition: tab.notes[lo].position, endPosition: tab.notes[hi].position };
          })()
        : undefined;
    engineRef.current?.play(tab.notes, tuning, tempoBpm, transposeSemitones, { ...playOptionsFor(tab), loop });
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

  const totalLines = Math.max(1, Math.ceil(tab.notes.length / NOTES_PER_LINE));
  const notesInLine = (lineIdx: number) =>
    Math.min(NOTES_PER_LINE, Math.max(0, tab.notes.length - lineIdx * NOTES_PER_LINE));
  const loopStartNote =
    loopStartLine !== null ? (tab.notes[loopStartLine * NOTES_PER_LINE + loopStartNoteInLine] ?? null) : null;
  const loopEndNote =
    loopEndLine !== null ? (tab.notes[loopEndLine * NOTES_PER_LINE + loopEndNoteInLine] ?? null) : null;

  return (
    <div className="panel tab-view-page">
      <h1>{tab.song_name}</h1>
      <p className="muted-text">
        {tab.artist && <>by {tab.artist} </>}
        {tab.album && <>· {tab.album} </>}
        · Tuning: {tuning.display_name}
        {tab.capo_fret > 0 && <> · Capo: fret {tab.capo_fret}</>}
        {tab.fifth_string_capo_fret === 0 && tab.capo_fret > 0 && <> (5th string open)</>}
        {!!tab.fifth_string_capo_fret && <> · 5th-string capo: fret {tab.fifth_string_capo_fret}</>}
        {tab.clawhammer_timing && <> · Clawhammer</>} · By{" "}
        <Link to={`/users/${tab.owner_username}`}>{tab.owner_username}</Link>
        {tab.status === "draft" && <span className="tag">DRAFT</span>}
      </p>
      <div className="tag-row">
        {tab.time_signature && <span className="tag">{tab.time_signature}</span>}
        {tab.swing && <span className="tag">Swing</span>}
        {tab.song_key && <span className="tag">Key of {tab.song_key}</span>}
        {tab.style && <span className="tag">{STYLE_LABELS[tab.style]}</span>}
        {tab.difficulty && <span className="tag">{DIFFICULTY_LABELS[tab.difficulty]}</span>}
      </div>
      {tab.forked_from && (
        <p className="muted-text">
          Forked from <Link to={`/tabs/${tab.forked_from.id}`}>{tab.forked_from.song_name}</Link> by{" "}
          {tab.forked_from.owner_username}
        </p>
      )}

      <div className="toolbar no-print">
        <VoteButton voteCount={tab.vote_count} hasVoted={tab.has_voted} onVote={handleVote} />
        {isOwner && <button onClick={() => navigate(`/tabs/${tab.id}/edit`)}>Edit</button>}
        {isOwner && <button className="secondary" onClick={loadRevisions}>History</button>}
        <button className="secondary" onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>
      {user && (
        <TabLibraryActions
          tab={tab}
          onFavoriteChange={(isFavorited) => setTab({ ...tab, is_favorited: isFavorited })}
        />
      )}

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
            disabled={!loopStartNote || !loopEndNote}
          />
          Loop section
        </label>
        <label>
          Loop start (line)
          <select
            value={loopStartLine ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              setLoopStartLine(value === "" ? null : Number(value));
              setLoopStartNoteInLine(0);
            }}
          >
            <option value="">(none)</option>
            {Array.from({ length: totalLines }, (_, i) => (
              <option key={i} value={i}>
                Line {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loop start (note in line)
          <select
            value={loopStartNoteInLine}
            onChange={(e) => setLoopStartNoteInLine(Number(e.target.value))}
            disabled={loopStartLine === null}
          >
            {Array.from({ length: loopStartLine !== null ? notesInLine(loopStartLine) : 0 }, (_, i) => (
              <option key={i} value={i}>
                Note {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loop end (line)
          <select
            value={loopEndLine ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              setLoopEndLine(value === "" ? null : Number(value));
              setLoopEndNoteInLine(0);
            }}
          >
            <option value="">(none)</option>
            {Array.from({ length: totalLines }, (_, i) => (
              <option key={i} value={i}>
                Line {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loop end (note in line)
          <select
            value={loopEndNoteInLine}
            onChange={(e) => setLoopEndNoteInLine(Number(e.target.value))}
            disabled={loopEndLine === null}
          >
            {Array.from({ length: loopEndLine !== null ? notesInLine(loopEndLine) : 0 }, (_, i) => (
              <option key={i} value={i}>
                Note {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>

      <TabRenderer
        notes={tab.notes}
        timeSignature={tab.time_signature}
        barsPerLine={tab.bars_per_line}
        clawhammerTiming={tab.clawhammer_timing}
        playingNoteId={playingNoteId}
        onChordClick={setHighlightedChord}
      />

      <TabChords
        chordNames={chordsUsed(tab.notes)}
        tuning={tuning}
        capoFret={tab.capo_fret}
        fifthStringCapoFret={tab.fifth_string_capo_fret}
        highlighted={highlightedChord}
      />
    </div>
  );
}

