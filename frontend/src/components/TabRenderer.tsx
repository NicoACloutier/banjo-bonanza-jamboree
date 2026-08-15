/**
 * Renders a tab as ASCII-style banjo tablature: one row per string, with
 * fret numbers (and technique annotations) in playback order, split into
 * lines (systems), and lyrics displayed below each line at the note
 * they're anchored to.
 *
 * A note slot may show more than one string sounding at once (a chord) --
 * each string's row independently shows its own fret in that column.
 * Techniques are shown as a short suffix on the fret number, following
 * standard tab notation conventions:
 *   - hammer-on:  "0h2"  (the fret written on the *previous* cell for that
 *     string already shows the starting fret; this cell shows "h" + fret)
 *   - pull-off:   "2p0"
 *   - slide:      "2s4"  (slides from the fret shown into `slide_to_fret`)
 *
 * Also supports an "editable" mode (when `onFretEdit` is supplied), in
 * which:
 *   - clicking a fret cell turns it into a small text input in place, so
 *     the fret for that string/note can be typed directly (no separate
 *     "pick a string" buttons elsewhere in the UI). Clicking a blank "-"
 *     cell activates that string at fret 0 and opens it for editing;
 *     clearing the input (e.g. backspacing to empty) removes the string
 *     from the note again, reverting the cell to "-".
 *   - the lyric row becomes a row of small text inputs, so lyrics are
 *     typed directly below the note they belong to.
 *   - an unobtrusive duration marker above each note's strings can be
 *     clicked to cycle through note durations.
 * A note with no strings fretted at all (all "-") is, semantically, a
 * rest -- there's no separate "mark as rest" control; a fully blank note
 * simply plays no sound.
 */
import { useState } from "react";
import { splitIntoLines } from "../lib/tabLayout";
import type { NoteFretOut, NoteOut } from "../types/api";

const STRING_LABELS = ["1", "2", "3", "4", "5"];

/** Unobtrusive abbreviation shown above a note for non-default durations; blank (default) for a quarter note. */
const DURATION_ABBR: Record<number, string> = {
  0.25: "16th",
  0.5: "8th",
  1: "",
  2: "half",
  4: "whole",
};


const TECHNIQUE_SUFFIX: Record<NoteFretOut["technique"], string> = {
  normal: "",
  hammer_on: "h",
  pull_off: "p",
  slide: "s",
  bend: "b",
  drop_thumb: "", // no visual change -- annotated via right_hand_finger only
};

/** Abbreviation shown for an optional right-hand roll-pattern annotation. */
const FINGER_ABBR: Record<NonNullable<NoteFretOut["right_hand_finger"]>, string> = {
  thumb: "T",
  index: "I",
  middle: "M",
};

/** Render a single fret's cell text, e.g. "2", "h2", "2p0", "2s4", "2b2". */
function fretCellText(fretEvent: NoteFretOut): string {
  const suffix = TECHNIQUE_SUFFIX[fretEvent.technique];
  let text: string;
  if (fretEvent.technique === "slide" && fretEvent.slide_to_fret !== null) {
    text = `${fretEvent.fret}${suffix}${fretEvent.slide_to_fret}`;
  } else if (fretEvent.technique === "bend" && fretEvent.bend_semitones !== null) {
    text = `${fretEvent.fret}${suffix}${fretEvent.bend_semitones}`;
  } else if (fretEvent.technique === "hammer_on" || fretEvent.technique === "pull_off") {
    text = `${suffix}${fretEvent.fret}`;
  } else {
    text = `${fretEvent.fret}`;
  }
  if (fretEvent.right_hand_finger) {
    text += FINGER_ABBR[fretEvent.right_hand_finger];
  }
  return text;
}

interface TabRendererProps {
  notes: NoteOut[];
  playingNoteId?: string | null;
  selectedNoteId?: string | null;
  onNoteClick?: (note: NoteOut) => void;
  /**
   * Supplying this callback switches the renderer into editable mode.
   * Called when the user commits a fret value for one string of one note
   * -- `fret === null` means "remove this string from the note" (i.e. the
   * cell reverts to a blank "-"), otherwise it's the new fret number.
   */
  onFretChange?: (noteId: string, stringNumber: number, fret: number | null) => void;
  /** Called when the user edits the lyric text below a note (editable mode only). */
  onLyricChange?: (noteId: string, lyric: string) => void;
  /** Called when the user clicks a note's duration marker to cycle its duration (editable mode only). */
  onDurationCycle?: (noteId: string) => void;
}

/** Which single cell (note + string) is currently showing an inline `<input>` instead of static text. */
interface EditingCell {
  noteId: string;
  stringNumber: number;
}

export function TabRenderer({
  notes,
  playingNoteId,
  selectedNoteId,
  onNoteClick,
  onFretChange,
  onLyricChange,
  onDurationCycle,
}: TabRendererProps) {
  const editable = Boolean(onFretChange);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const lines = splitIntoLines(notes);

  if (lines.length === 0) {
    return <p className="muted-text">No notes yet -- add some below to start your tab.</p>;
  }

  /** Commit whatever's currently typed in the active inline `<input>` back onto the note, then close it. */
  const commitEditingCell = () => {
    if (!editingCell || !onFretChange) return;
    const trimmed = editingValue.trim();
    if (trimmed === "") {
      // Left blank (or backspaced to empty): remove the string -- cell reverts to "-".
      onFretChange(editingCell.noteId, editingCell.stringNumber, null);
    } else {
      const parsed = Number(trimmed);
      onFretChange(editingCell.noteId, editingCell.stringNumber, Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0);
    }
    setEditingCell(null);
    setEditingValue("");
  };

  return (
    <div className="tab-sheet">
      {lines.map((line, lineIndex) => (
        <div className="tab-line" key={lineIndex} data-line-index={lineIndex}>
          {editable && (
            <div className="tab-duration-row">
              {line.map((note) => {
                const abbr = DURATION_ABBR[note.duration_beats] ?? `${note.duration_beats}b`;
                return (
                  <button
                    key={note.id}
                    type="button"
                    className="duration-marker"
                    title="Click to change this note's duration"
                    onClick={() => {
                      onNoteClick?.(note);
                      onDurationCycle?.(note.id);
                    }}
                  >
                    {abbr}
                  </button>
                );
              })}
            </div>
          )}
          {STRING_LABELS.map((label, stringIdx) => {
            const stringNumber = stringIdx + 1;
            return (
              <div className="tab-string-row" key={stringNumber}>
                <span className="tab-string-label">{label}</span>
                {line.map((note) => {
                  const fretOnThisString = note.frets.find((f) => f.string_number === stringNumber);
                  const isPlaying = note.id === playingNoteId;
                  const isSelected = note.id === selectedNoteId;
                  const isChord = note.frets.length > 1;
                  const isEditingThisCell =
                    editingCell?.noteId === note.id && editingCell?.stringNumber === stringNumber;

                  if (isEditingThisCell) {
                    return (
                      <input
                        key={note.id}
                        className="tab-fret-cell tab-fret-cell-input"
                        type="text"
                        inputMode="numeric"
                        autoFocus
                        value={editingValue}
                        aria-label={`Fret for string ${stringNumber}`}
                        onChange={(e) => setEditingValue(e.target.value.replace(/[^0-9]/g, ""))}
                        onBlur={commitEditingCell}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitEditingCell();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditingCell(null);
                            setEditingValue("");
                          }
                        }}
                      />
                    );
                  }

                  return (
                    <span
                      key={note.id}
                      className={[
                        "tab-fret-cell",
                        isPlaying ? "playing" : "",
                        isSelected ? "selected" : "",
                        onNoteClick || editable ? "clickable" : "",
                        fretOnThisString && isChord ? "chord-member" : "",
                        fretOnThisString?.technique === "drop_thumb" ? "drop-thumb" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={isSelected ? { outline: "2px solid var(--ember-dark)" } : undefined}
                      onClick={() => {
                        onNoteClick?.(note);
                        if (editable) {
                          setEditingCell({ noteId: note.id, stringNumber });
                          // Clicking a blank "-" cell activates that string at fret 0 (shown
                          // immediately); an existing fret is edited in place. Backspacing the
                          // input back to empty removes the string again (reverts to "-").
                          setEditingValue(fretOnThisString ? String(fretOnThisString.fret) : "0");
                        }
                      }}
                      title={
                        onNoteClick || editable
                          ? editable
                            ? "Click to type a fret for this string"
                            : "Click to select/edit this note"
                          : undefined
                      }
                    >
                      {fretOnThisString ? fretCellText(fretOnThisString) : "-"}
                    </span>
                  );
                })}
              </div>
            );
          })}
          <div className="tab-lyrics-row">
            {line.map((note) =>
              editable ? (
                <input
                  key={note.id}
                  className="lyric-token lyric-token-input"
                  type="text"
                  value={note.lyric ?? ""}
                  placeholder=""
                  aria-label="Lyric at this note"
                  onFocus={() => onNoteClick?.(note)}
                  onChange={(e) => onLyricChange?.(note.id, e.target.value)}
                />
              ) : (
                <span className="lyric-token" key={note.id}>
                  {note.lyric ?? ""}
                </span>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
