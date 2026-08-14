/**
 * Renders a tab as ASCII-style banjo tablature: one row per string, with
 * fret numbers in playback order, split into lines (systems), and lyrics
 * displayed below each line at the note they're anchored to.
 *
 * Also supports an "editable" mode, in which each fret cell is clickable
 * (used by the editor to select which note/string/fret to edit) and the
 * currently-selected note is highlighted.
 */
import { splitIntoLines } from "../lib/tabLayout";
import type { NoteOut } from "../types/api";

const STRING_LABELS = ["1", "2", "3", "4", "5"];

interface TabRendererProps {
  notes: NoteOut[];
  playingNoteId?: string | null;
  selectedNoteId?: string | null;
  onNoteClick?: (note: NoteOut) => void;
}

export function TabRenderer({ notes, playingNoteId, selectedNoteId, onNoteClick }: TabRendererProps) {
  const lines = splitIntoLines(notes);

  if (lines.length === 0) {
    return <p className="muted-text">No notes yet -- add some below to start your tab.</p>;
  }

  return (
    <div className="tab-sheet">
      {lines.map((line, lineIndex) => (
        <div className="tab-line" key={lineIndex} data-line-index={lineIndex}>
          {STRING_LABELS.map((label, stringIdx) => {
            const stringNumber = stringIdx + 1;
            return (
              <div className="tab-string-row" key={stringNumber}>
                <span className="tab-string-label">{label}</span>
                {line.map((note) => {
                  const onThisString = note.string_number === stringNumber;
                  const isPlaying = note.id === playingNoteId;
                  const isSelected = note.id === selectedNoteId;
                  return (
                    <span
                      key={note.id}
                      className={[
                        "tab-fret-cell",
                        isPlaying ? "playing" : "",
                        isSelected ? "selected" : "",
                        onNoteClick ? "clickable" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={isSelected ? { outline: "2px solid var(--ember-dark)" } : undefined}
                      onClick={onNoteClick ? () => onNoteClick(note) : undefined}
                      title={onNoteClick ? "Click to select/edit this note" : undefined}
                    >
                      {onThisString ? note.fret : "-"}
                    </span>
                  );
                })}
              </div>
            );
          })}
          <div className="tab-lyrics-row">
            {line.map((note) => (
              <span className="lyric-token" key={note.id}>
                {note.lyric ?? ""}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
