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
 * Also supports an "editable" mode, in which each fret cell is clickable
 * (used by the editor to select which note to edit) and the currently
 * selected note is highlighted.
 */
import { splitIntoLines } from "../lib/tabLayout";
import type { NoteFretOut, NoteOut } from "../types/api";

const STRING_LABELS = ["1", "2", "3", "4", "5"];

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
                  const fretOnThisString = note.frets.find((f) => f.string_number === stringNumber);
                  const isPlaying = note.id === playingNoteId;
                  const isSelected = note.id === selectedNoteId;
                  const isChord = note.frets.length > 1;
                  return (
                    <span
                      key={note.id}
                      className={[
                        "tab-fret-cell",
                        isPlaying ? "playing" : "",
                        isSelected ? "selected" : "",
                        onNoteClick ? "clickable" : "",
                        fretOnThisString && isChord ? "chord-member" : "",
                        fretOnThisString?.technique === "drop_thumb" ? "drop-thumb" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      style={isSelected ? { outline: "2px solid var(--ember-dark)" } : undefined}
                      onClick={onNoteClick ? () => onNoteClick(note) : undefined}
                      title={
                        onNoteClick
                          ? note.is_rest
                            ? "Click to select/edit this rest"
                            : "Click to select/edit this note"
                          : undefined
                      }
                    >
                      {note.is_rest ? "" : fretOnThisString ? fretCellText(fretOnThisString) : "-"}
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
