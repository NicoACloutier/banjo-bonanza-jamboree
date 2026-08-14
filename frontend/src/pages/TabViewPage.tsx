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
import type { TabDetail, TuningOut } from "../types/api";

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
    return () => engineRef.current?.dispose();
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
    engineRef.current?.play(tab.notes, tuning, tempoBpm, transposeSemitones);
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

  const handleVote = async () => {
    if (!tab) return;
    try {
      const result = await TabsApi.vote(tab.id);
      setTab({ ...tab, vote_count: result.vote_count, has_voted: result.has_voted });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Failed to vote.");
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error-banner">{error}</p>;
  if (!tab || !tuning) return <p>Tab not found.</p>;

  const isOwner = user?.id === tab.owner_id;

  return (
    <div className="panel">
      <h1>{tab.song_name}</h1>
      <p className="muted-text">
        {tab.artist && <>by {tab.artist} </>}
        {tab.album && <>· {tab.album} </>}
        · Tuning: {tuning.display_name} · By{" "}
        <Link to={`/users/${tab.owner_username}`}>{tab.owner_username}</Link>
        {tab.status === "draft" && <span className="tag">DRAFT</span>}
      </p>

      <div className="toolbar">
        <VoteButton voteCount={tab.vote_count} hasVoted={tab.has_voted} onVote={handleVote} />
        {isOwner && <button onClick={() => navigate(`/tabs/${tab.id}/edit`)}>Edit</button>}
      </div>

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

      <TabRenderer notes={tab.notes} playingNoteId={playingNoteId} />
    </div>
  );
}
