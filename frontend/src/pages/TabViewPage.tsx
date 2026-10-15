/**
 * View + play a single tab: renders the tab sheet and its chord diagrams,
 * provides playback controls (tempo/transpose/auto-scroll), and lets
 * logged-in users vote, favorite, fork, or edit their own tab.
 */
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { meterOf, noteLocation, noteRange, splitIntoLines } from "../lib/tabLayout";
import { chordsUsed, DIFFICULTY_LABELS, playOptionsFor, STYLE_LABELS } from "../lib/tabSettings";
import type { NoteOut, TabDetail, TabRevisionSummary, TuningOut } from "../types/api";

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
  const [autoScroll, setAutoScroll] = useState(false);
  const [scrollSpeed, setScrollSpeed] = useState(4);
  // The chord whose diagram was last clicked in the tab.
  const [highlightedChord, setHighlightedChord] = useState<string | null>(null);

  // Section loop/repeat: user picks a start/end note (by line number + note
  // number within that line) in the preview, then toggles loop mode so
  // playback repeats just that region indefinitely. `null` for a line means
  // "no note chosen yet" for that end of the range.
  // The section is picked by clicking its first and last notes on the sheet.
  const [loopFirstId, setLoopFirstId] = useState<string | null>(null);
  const [loopLastId, setLoopLastId] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);

  // Metronome: an independent click track with its own on/off toggle,
  // reusing the same tempo control as playback.
  const [metronomeOn, setMetronomeOn] = useState(false);
  const metronomeRef = useRef<Metronome | null>(null);
  // Click one bar before playback starts (in the tab's time signature, or 4/4).
  const [countIn, setCountIn] = useState(false);

  // Revision history (owner-only): lets the tab's owner browse and restore
  // prior saved versions.
  const [revisions, setRevisions] = useState<TabRevisionSummary[]>([]);
  const [showRevisions, setShowRevisions] = useState(false);

  // Deleting the tab (owner only), confirmed inline first.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
      // Leaving the page stops playback, so stop auto-scrolling too (disposing
      // the engine doesn't fire onEnded, and the interval would otherwise keep
      // scrolling whatever page the user navigated to).
      if (scrollIntervalRef.current !== null) {
        window.clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
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
    const section = loopEnabled && loopFirstId && loopLastId ? noteRange(tab.notes, loopFirstId, loopLastId) : [];
    const loop =
      section.length > 0
        ? { startPosition: section[0].position, endPosition: section[section.length - 1].position }
        : undefined;
    engineRef.current?.play(tab.notes, tuning, tempoBpm, transposeSemitones, {
      ...playOptionsFor(tab),
      loop,
      countIn: countIn ? meterOf(tab.time_signature ?? "4/4") : undefined,
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
      metronomeRef.current?.start(tempoBpm, metronomeMeter());
      setMetronomeOn(true);
    }
  };

  // The metronome counts in the tab's time signature (accenting each bar's
  // first click); tabs without one get a plain click every beat.
  const metronomeMeter = () => (tab?.time_signature ? meterOf(tab.time_signature) : null);

  // Keep a running metronome in sync if the tempo slider changes mid-click.
  useEffect(() => {
    if (metronomeOn) metronomeRef.current?.start(tempoBpm, metronomeMeter());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tempoBpm]);

  const handleDelete = async () => {
    if (!tab) return;
    setDeleteError(null);
    try {
      await TabsApi.remove(tab.id);
      navigate(`/users/${tab.owner_username}`);
    } catch (err) {
      setDeleteError(err instanceof ApiRequestError ? err.message : "Failed to delete the tab.");
    }
  };

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
  // Admins can delete anyone's tab (but only owners can edit).
  const canDelete = isOwner || Boolean(user?.is_admin);

  // The tab's details line, shown with " · " between whichever items apply.
  const details: ReactNode[] = [
    tab.artist && `by ${tab.artist}`,
    tab.album,
    `Tuning: ${tuning.display_name}`,
    tab.capo_fret > 0 &&
      `Capo: fret ${tab.capo_fret}${tab.fifth_string_capo_fret === 0 ? " (5th string open)" : ""}`,
    !!tab.fifth_string_capo_fret && `5th-string capo: fret ${tab.fifth_string_capo_fret}`,
    tab.clawhammer_timing && "Clawhammer",
    <>
      By <Link to={`/users/${tab.owner_username}`}>{tab.owner_username}</Link>
    </>,
  ].filter(Boolean);

  // Picking the loop section: the first click sets its first note, the
  // second its last; clicking again starts a new section.
  const pickLoopNote = (note: NoteOut) => {
    if (loopFirstId === null || loopLastId !== null) {
      setLoopFirstId(note.id);
      setLoopLastId(null);
    } else {
      setLoopLastId(note.id);
    }
  };
  const lines = splitIntoLines(tab.notes);
  const loopSection = loopFirstId && loopLastId ? noteRange(tab.notes, loopFirstId, loopLastId) : [];
  const loopHighlight = new Set(loopSection.length > 0 ? loopSection.map((n) => n.id) : loopFirstId ? [loopFirstId] : []);
  const describe = (noteId: string) => {
    const where = noteLocation(lines, noteId);
    return where ? `line ${where.line}, note ${where.note}` : "";
  };
  let loopStatus = "Click the first note of the section on the tab.";
  if (loopSection.length > 0) {
    const first = loopSection[0];
    const last = loopSection[loopSection.length - 1];
    loopStatus = `Looping ${loopSection.length} note${loopSection.length === 1 ? "" : "s"}: ${describe(first.id)} to ${describe(last.id)}.`;
  } else if (loopFirstId) {
    loopStatus = "Now click the last note of the section.";
  }

  return (
    <div className="panel tab-view-page">
      <h1>{tab.song_name}</h1>
      <div className="tab-meta">
        <p className="muted-text">
          {details.map((detail, i) => (
            <Fragment key={i}>
              {i > 0 && " · "}
              {detail}
            </Fragment>
          ))}
          {tab.status === "draft" && <span className="tag">DRAFT</span>}
        </p>
        <div className="tab-meta-actions">
          <VoteButton voteCount={tab.vote_count} hasVoted={tab.has_voted} onVote={handleVote} />
          {isOwner && <button onClick={() => navigate(`/tabs/${tab.id}/edit`)}>Edit</button>}
          {isOwner && (
            <button className="secondary" onClick={loadRevisions}>
              History
            </button>
          )}
          {canDelete && !confirmingDelete && (
            <button className="secondary" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
      {confirmingDelete && (
        <div className="toolbar" role="alert">
          <span>
            {isOwner
              ? "Delete this tab? This can't be undone."
              : `Delete ${tab.owner_username}'s tab as an admin? This can't be undone.`}
          </span>
          <button onClick={handleDelete}>Yes, delete</button>
          <button className="secondary" onClick={() => setConfirmingDelete(false)}>
            Cancel
          </button>
          {deleteError && <span className="error-banner">{deleteError}</span>}
        </div>
      )}
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

      {user && (
        <TabLibraryActions
          tab={tab}
          onFavoriteChange={(isFavorited) => setTab({ ...tab, is_favorited: isFavorited })}
        />
      )}

      {showRevisions && (
        <div className="panel">
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

      <div className="toolbar">
        <label>
          <input type="checkbox" checked={metronomeOn} onChange={toggleMetronome} />
          Metronome{tab.time_signature && ` (${tab.time_signature})`}
        </label>
        <label title="Click one bar before the first note, so you can come in on time">
          <input type="checkbox" checked={countIn} onChange={(e) => setCountIn(e.target.checked)} />
          Count-in
        </label>
        <label>
          <input type="checkbox" checked={loopEnabled} onChange={(e) => setLoopEnabled(e.target.checked)} />
          Loop section
        </label>
        {loopEnabled && (
          <span role="status">
            {loopStatus}{" "}
            {loopFirstId && (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  setLoopFirstId(null);
                  setLoopLastId(null);
                }}
              >
                Clear
              </button>
            )}
          </span>
        )}
      </div>

      <TabRenderer
        notes={tab.notes}
        barsPerLine={tab.bars_per_line}
        clawhammerTiming={tab.clawhammer_timing}
        playingNoteId={playingNoteId}
        onChordClick={setHighlightedChord}
        onNoteClick={loopEnabled ? pickLoopNote : undefined}
        noteClickTitle={loopFirstId === null || loopLastId !== null ? "Start the loop here" : "End the loop here"}
        highlightedNoteIds={loopEnabled ? loopHighlight : undefined}
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

