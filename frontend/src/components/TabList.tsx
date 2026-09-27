/**
 * A list of tab summaries (song, artist, tuning/style/key/difficulty tags,
 * owner and votes), shared by the browse, profile, favorites and setlist
 * pages. `renderActions` adds per-row controls (e.g. reordering a setlist).
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { DIFFICULTY_LABELS, STYLE_LABELS } from "../lib/tabSettings";
import { FALLBACK_TUNINGS } from "../lib/tunings";
import type { TabSummary } from "../types/api";

interface TabListProps {
  tabs: TabSummary[];
  emptyMessage: string;
  /** Hide the "by <owner>" line (e.g. on that owner's own profile). */
  showOwner?: boolean;
  renderActions?: (tab: TabSummary, index: number) => ReactNode;
}

const tuningName = (key: string) => FALLBACK_TUNINGS.find((t) => t.key === key)?.display_name ?? key;

export function TabList({ tabs, emptyMessage, showOwner = true, renderActions }: TabListProps) {
  if (tabs.length === 0) return <p className="muted-text">{emptyMessage}</p>;
  return (
    <ul className="tab-list">
      {tabs.map((tab, index) => (
        <li className="tab-list-item" key={`${tab.id}-${index}`}>
          <div>
            <Link to={`/tabs/${tab.id}`}>
              <strong>{tab.song_name}</strong>
            </Link>
            {tab.artist && <span> by {tab.artist}</span>}
            {tab.status === "draft" && <span className="tag">DRAFT</span>}
            <div className="tag-row">
              <span className="tag">{tuningName(tab.tuning_key)}</span>
              {tab.style && <span className="tag">{STYLE_LABELS[tab.style]}</span>}
              {tab.song_key && <span className="tag">Key of {tab.song_key}</span>}
              {tab.difficulty && <span className="tag">{DIFFICULTY_LABELS[tab.difficulty]}</span>}
            </div>
            {showOwner && (
              <span className="muted-text">
                by <Link to={`/users/${tab.owner_username}`}>{tab.owner_username}</Link>
              </span>
            )}
          </div>
          <div className="tab-list-side">
            {renderActions?.(tab, index)}
            <span className="vote-count">👍 {tab.vote_count}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
