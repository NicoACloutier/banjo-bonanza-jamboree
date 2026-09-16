/**
 * Tab creation/editing UI.
 *
 * The song is laid out as a grid of note slots, added a whole line (16
 * notes) at a time via "+ Add a line". Every note starts blank (all "-"
 * on every string): fret numbers are typed directly into the tab preview
 * by clicking a string's cell for that note, and lyrics are typed
 * directly into the small text box below each note. A note left blank on
 * every string is, semantically, a rest -- there's no separate "mark as
 * rest" checkbox; silence is just the absence of any fretted string.
 * Selecting a note (by clicking any of its cells) opens a small side
 * panel for its duration and per-string playing technique (hammer-on,
 * pull-off, slide, bend, drop-thumb) and roll-pattern finger, since those
 * don't fit naturally into a single typed character. Each technique can
 * also be applied with a single keystroke (see `TECHNIQUE_SHORTCUTS`)
 * while a note with at least one fret is selected.
 */
import { useEffect, useMemo, useState } from "react";
import { TabRenderer } from "./TabRenderer";
import type { NoteFretIn, NoteOut, RightHandFinger, Technique, TuningOut } from "../types/api";

export interface TabMetadata {
  songName: string;
  artist: string;
  album: string;
  tuningKey: string;
  tempoBpm: number;
  /** Physical capo position (0 = no capo), 0-12 frets. */
  capoFret: number;
  /** How many bars each rendered line of 16 notes is visually divided into (1, 2, or 4). */
  barsPerLine: number;
}

interface TabEditorProps {
  tunings: TuningOut[];
  metadata: TabMetadata;
  onMetadataChange: (metadata: TabMetadata) => void;
  notes: NoteOut[];
  onNotesChange: (notes: NoteOut[]) => void;
}

const TECHNIQUE_OPTIONS: { label: string; value: Technique }[] = [
  { label: "Normal (n)", value: "normal" },
  { label: "Hammer-on (h)", value: "hammer_on" },
  { label: "Pull-off (p)", value: "pull_off" },
  { label: "Slide (s)", value: "slide" },
  { label: "Bend/choke (b)", value: "bend" },
  { label: "Drop-thumb (d)", value: "drop_thumb" },
];

/**
 * Single-key shortcuts for setting the selected note's technique without
 * opening the dropdown -- active whenever a note with at least one fret is
 * selected and focus isn't in a text field (see the keydown effect below).
 */
const TECHNIQUE_SHORTCUTS: Record<string, Technique> = {
  n: "normal",
  h: "hammer_on",
  p: "pull_off",
  s: "slide",
  b: "bend",
  d: "drop_thumb",
};

/** How many bars a line of 16 notes can be visually divided into. */
const BAR_OPTIONS = [1, 2, 4] as const;

/** Patch applied when a fret's technique changes, resetting/defaulting technique-specific fields. */
function techniquePatch(fret: NoteFretIn, technique: Technique): Partial<NoteFretIn> {
  return {
    technique,
    slide_to_fret: technique === "slide" ? (fret.slide_to_fret ?? fret.fret + 2) : null,
    bend_semitones: technique === "bend" ? (fret.bend_semitones ?? 1) : null,
  };
}

const FINGER_OPTIONS: { label: string; value: RightHandFinger | "" }[] = [
  { label: "(none)", value: "" },
  { label: "Thumb", value: "thumb" },
  { label: "Index", value: "index" },
  { label: "Middle", value: "middle" },
];

/** Duration (in beats) cycled through by clicking a note's duration marker, in order. */
const DURATION_CYCLE = [0.25, 0.5, 1, 2, 4];

function createNoteId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note-${Math.random().toString(36).slice(2)}`;
}

/** Notes added/seeded as a single "line" at once (see `+ Add a line`). */
export const NOTES_PER_LINE = 16;

/**
 * A blank placeholder note: not a rest -- it is a normal, sound-producing
 * slot with no strings picked yet, so it renders as a row of dashes ("-")
 * in every string in the preview until the user clicks a string's cell
 * and types a fret number. This is what a freshly-created tab is
 * pre-populated with, and what "+ Add a line" appends -- letting users
 * lay out the song's length first and fill in the actual notes
 * afterward. Left unfilled, it plays silently at save time, identical to
 * a rest (see backend `_validate_notes`).
 */
export function createEmptyNote(position: number): NoteOut {
  return {
    id: createNoteId(),
    position,
    duration_beats: 1,
    line_break: false,
    lyric: null,
    is_rest: false,
    frets: [],
  };
}

/** Editor for one string's technique/roll-finger within a (possibly chordal) note slot; the fret itself is typed directly into the tab preview. */
function FretRowEditor({
  fret,
  onChange,
}: {
  fret: NoteFretIn;
  onChange: (patch: Partial<NoteFretIn>) => void;
}) {
  return (
    <div className="form-row fret-row-editor">
      <span className="fret-row-string-label">
        String {fret.string_number}, fret {fret.fret}
      </span>
      <label>
        Technique
        <select
          value={fret.technique}
          onChange={(e) => onChange(techniquePatch(fret, e.target.value as Technique))}
        >
          {TECHNIQUE_OPTIONS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      {fret.technique === "slide" && (
        <label>
          Slide to fret
          <input
            type="number"
            min={0}
            max={24}
            value={fret.slide_to_fret ?? fret.fret + 2}
            onChange={(e) => onChange({ slide_to_fret: Number(e.target.value) })}
          />
        </label>
      )}
      {fret.technique === "bend" && (
        <label>
          Bend up (semitones)
          <input
            type="number"
            min={1}
            max={12}
            value={fret.bend_semitones ?? 1}
            onChange={(e) => onChange({ bend_semitones: Number(e.target.value) })}
          />
        </label>
      )}
      <label>
        Roll finger (optional)
        <select
          value={fret.right_hand_finger ?? ""}
          onChange={(e) => onChange({ right_hand_finger: (e.target.value || null) as RightHandFinger | null })}
        >
          {FINGER_OPTIONS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function TabEditor({ tunings, metadata, onMetadataChange, notes, onNotesChange }: TabEditorProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  // Copy/paste range: identified by line number + note-within-line number
  // (both 0-indexed) rather than a note id, so the pickers can be two plain
  // "Line" / "Note in line" dropdowns.
  const [rangeStartLine, setRangeStartLine] = useState(0);
  const [rangeStartNoteInLine, setRangeStartNoteInLine] = useState(0);
  const [rangeEndLine, setRangeEndLine] = useState(0);
  const [rangeEndNoteInLine, setRangeEndNoteInLine] = useState(0);
  const [clipboard, setClipboard] = useState<NoteOut[] | null>(null);

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedNoteId) ?? null, [notes, selectedNoteId]);

  const totalLines = Math.max(1, Math.ceil(notes.length / NOTES_PER_LINE));
  const notesInLine = (lineIdx: number) =>
    Math.min(NOTES_PER_LINE, Math.max(0, notes.length - lineIdx * NOTES_PER_LINE));
  const noteAtRangePoint = (lineIdx: number, noteInLineIdx: number): NoteOut | null =>
    notes[lineIdx * NOTES_PER_LINE + noteInLineIdx] ?? null;
  const rangeStartNote = noteAtRangePoint(rangeStartLine, rangeStartNoteInLine);
  const rangeEndNote = noteAtRangePoint(rangeEndLine, rangeEndNoteInLine);

  // Keyboard shortcuts for setting the selected note's technique (see
  // TECHNIQUE_SHORTCUTS) -- active whenever a note with at least one fret
  // is selected, ignoring keystrokes aimed at a text field (song name,
  // lyric box, etc). The inline fret-number input is a deliberate
  // exception: it only ever accepts digits, so a letter typed there can't
  // mean anything *except* a technique shortcut -- if we ignored it, typing
  // "h" right after clicking a note (while that input still has focus)
  // would silently do nothing.
  useEffect(() => {
    if (!selectedNote || selectedNote.frets.length === 0) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const isFretInput = target?.classList.contains("tab-fret-cell-input");
      if (!isFretInput && (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT")) {
        return;
      }
      const technique = TECHNIQUE_SHORTCUTS[e.key.toLowerCase()];
      if (!technique) return;
      e.preventDefault();
      onNotesChange(
        notes.map((n) =>
          n.id === selectedNote.id
            ? { ...n, frets: n.frets.map((f) => ({ ...f, ...techniquePatch(f, technique) })) }
            : n,
        ),
      );
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNote, notes, onNotesChange]);

  /** Reset the selected note back to blank (all "-") without removing its slot from the tab. */
  const clearSelectedNote = () => {
    if (!selectedNote) return;
    onNotesChange(notes.map((n) => (n.id === selectedNote.id ? { ...n, frets: [] } : n)));
  };

  /**
   * Remove the whole 16-note line containing the currently selected note
   * (i.e. positions [lineStart, lineStart + NOTES_PER_LINE)), so a user can
   * delete an entire verse/chorus line at once rather than one note at a
   * time.
   */
  const removeSelectedLine = () => {
    if (!selectedNote) return;
    const sorted = [...notes].sort((a, b) => a.position - b.position);
    const selectedIdx = sorted.findIndex((n) => n.id === selectedNote.id);
    if (selectedIdx === -1) return;
    const lineStart = Math.floor(selectedIdx / NOTES_PER_LINE) * NOTES_PER_LINE;
    const lineEnd = lineStart + NOTES_PER_LINE;
    const remaining = sorted
      .filter((_, idx) => idx < lineStart || idx >= lineEnd)
      .map((n, idx) => ({ ...n, position: idx }));
    onNotesChange(remaining);
    setSelectedNoteId(null);
  };

  const updateSelectedNote = (patch: Partial<NoteOut>) => {
    if (!selectedNote) return;
    onNotesChange(notes.map((n) => (n.id === selectedNote.id ? { ...n, ...patch } : n)));
  };

  const updateSelectedNoteFret = (stringNumber: number, patch: Partial<NoteFretIn>) => {
    if (!selectedNote) return;
    updateSelectedNote({
      frets: selectedNote.frets.map((f) => (f.string_number === stringNumber ? { ...f, ...patch } : f)),
    });
  };

  /**
   * Handle a fret being typed (or cleared) for one string of one note,
   * from the tab preview itself. `fret === null` removes the string from
   * the note (reverting that cell to "-"); otherwise it either updates an
   * existing string's fret or adds a new one (defaulting to "normal"
   * technique).
   */
  const handleFretChange = (noteId: string, stringNumber: number, fret: number | null) => {
    onNotesChange(
      notes.map((n) => {
        if (n.id !== noteId) return n;
        if (fret === null) {
          return { ...n, frets: n.frets.filter((f) => f.string_number !== stringNumber) };
        }
        const exists = n.frets.some((f) => f.string_number === stringNumber);
        const nextFrets = exists
          ? n.frets.map((f) => (f.string_number === stringNumber ? { ...f, fret } : f))
          : [
              ...n.frets,
              {
                string_number: stringNumber,
                fret,
                technique: "normal" as Technique,
                slide_to_fret: null,
                bend_semitones: null,
                right_hand_finger: null,
              },
            ].sort((a, b) => a.string_number - b.string_number);
        return { ...n, frets: nextFrets };
      }),
    );
  };

  const handleLyricChange = (noteId: string, lyric: string) => {
    onNotesChange(notes.map((n) => (n.id === noteId ? { ...n, lyric: lyric || null } : n)));
  };

  const handleDurationCycle = (noteId: string) => {
    onNotesChange(
      notes.map((n) => {
        if (n.id !== noteId) return n;
        const currentIdx = DURATION_CYCLE.indexOf(n.duration_beats);
        const nextDuration = DURATION_CYCLE[(currentIdx + 1) % DURATION_CYCLE.length];
        return { ...n, duration_beats: nextDuration };
      }),
    );
  };

  return (
    <div>
      <div className="toolbar">
        <span>Bars per line:</span>
        {BAR_OPTIONS.map((n) => (
          <button
            key={n}
            type="button"
            className={metadata.barsPerLine === n ? "" : "secondary"}
            aria-pressed={metadata.barsPerLine === n}
            onClick={() => onMetadataChange({ ...metadata, barsPerLine: n })}
          >
            {n} {n === 1 ? "bar" : "bars"}
          </button>
        ))}
      </div>

      <div className="form-row">
        <label>
          Song name (required)
          <input
            type="text"
            value={metadata.songName}
            onChange={(e) => onMetadataChange({ ...metadata, songName: e.target.value })}
            required
          />
        </label>
        <label>
          Artist (optional)
          <input
            type="text"
            value={metadata.artist}
            onChange={(e) => onMetadataChange({ ...metadata, artist: e.target.value })}
          />
        </label>
        <label>
          Album (optional)
          <input
            type="text"
            value={metadata.album}
            onChange={(e) => onMetadataChange({ ...metadata, album: e.target.value })}
          />
        </label>
      </div>

      <div className="form-row">
        <label>
          Tuning (required)
          <select
            value={metadata.tuningKey}
            onChange={(e) => onMetadataChange({ ...metadata, tuningKey: e.target.value })}
          >
            {tunings.map((t) => (
              <option key={t.key} value={t.key}>
                {t.display_name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Default tempo (BPM)
          <input
            type="number"
            min={20}
            max={400}
            value={metadata.tempoBpm}
            onChange={(e) => onMetadataChange({ ...metadata, tempoBpm: Number(e.target.value) })}
          />
        </label>
        <label>
          Capo (fret, 0 = none)
          <input
            type="number"
            min={0}
            max={12}
            value={metadata.capoFret}
            onChange={(e) => onMetadataChange({ ...metadata, capoFret: Number(e.target.value) })}
          />
        </label>
      </div>

      <h3>Tab preview</h3>
      <p className="muted-text">
        Click a string's cell to type its fret number directly (leave it blank/backspace it to clear that
        string back to "-"). Type lyrics straight into the box below each note.
      </p>
      <div className={selectedNote ? "tab-with-editor" : undefined}>
        <div className="tab-preview-col">
          <TabRenderer
            notes={notes}
            barsPerLine={metadata.barsPerLine}
            selectedNoteId={selectedNoteId}
            onNoteClick={(note) => setSelectedNoteId(note.id)}
            onFretChange={handleFretChange}
            onLyricChange={handleLyricChange}
            onDurationCycle={handleDurationCycle}
          />
          <div className="toolbar">
            <button
              type="button"
              className="secondary"
              onClick={() =>
                onNotesChange([
                  ...notes,
                  ...Array.from({ length: NOTES_PER_LINE }, (_, i) => createEmptyNote(notes.length + i)),
                ])
              }
            >
              + Add a line
            </button>
          </div>
        </div>

        {selectedNote && (
          <div className="edit-note-col">
            <div className="panel">
              <h3>Edit selected note</h3>
              {selectedNote.frets.length === 0 ? (
                <p className="muted-text">
                  This note is blank on every string (a rest). Click one of its cells in the tab above and
                  type a fret number to give it a sound.
                </p>
              ) : (
                <>
                  {selectedNote.frets.length > 1 && (
                    <p className="muted-text">
                      This note has {selectedNote.frets.length} strings selected -- it will play as a chord.
                    </p>
                  )}
                  {selectedNote.frets
                    .slice()
                    .sort((a, b) => a.string_number - b.string_number)
                    .map((fret) => (
                      <FretRowEditor
                        key={fret.string_number}
                        fret={fret}
                        onChange={(patch) => updateSelectedNoteFret(fret.string_number, patch)}
                      />
                    ))}
                </>
              )}
              <div className="form-row">
                <button className="secondary" onClick={clearSelectedNote}>
                  Clear this note
                </button>
                <button className="secondary" onClick={removeSelectedLine}>
                  Remove line
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h3>Copy / paste a range</h3>
        <p className="muted-text">
          Pick a start and end note (e.g. the chorus) by line + note-in-line, copy it, then paste it back
          in after selecting where it should go -- handy for reusing a section and just changing the
          lyrics.
        </p>
        <div className="form-row">
          <label>
            Range start (line)
            <select
              value={rangeStartLine}
              onChange={(e) => {
                const line = Number(e.target.value);
                setRangeStartLine(line);
                setRangeStartNoteInLine((prev) => Math.min(prev, Math.max(0, notesInLine(line) - 1)));
              }}
            >
              {Array.from({ length: totalLines }, (_, i) => (
                <option key={i} value={i}>
                  Line {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Range start (note in line)
            <select
              value={rangeStartNoteInLine}
              onChange={(e) => setRangeStartNoteInLine(Number(e.target.value))}
            >
              {Array.from({ length: notesInLine(rangeStartLine) }, (_, i) => (
                <option key={i} value={i}>
                  Note {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label>
            Range end (line)
            <select
              value={rangeEndLine}
              onChange={(e) => {
                const line = Number(e.target.value);
                setRangeEndLine(line);
                setRangeEndNoteInLine((prev) => Math.min(prev, Math.max(0, notesInLine(line) - 1)));
              }}
            >
              {Array.from({ length: totalLines }, (_, i) => (
                <option key={i} value={i}>
                  Line {i + 1}
                </option>
              ))}
            </select>
          </label>
          <label>
            Range end (note in line)
            <select value={rangeEndNoteInLine} onChange={(e) => setRangeEndNoteInLine(Number(e.target.value))}>
              {Array.from({ length: notesInLine(rangeEndLine) }, (_, i) => (
                <option key={i} value={i}>
                  Note {i + 1}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <button
            type="button"
            className="secondary"
            disabled={!rangeStartNote || !rangeEndNote}
            onClick={() => {
              if (!rangeStartNote || !rangeEndNote) return;
              const startIdx = notes.findIndex((n) => n.id === rangeStartNote.id);
              const endIdx = notes.findIndex((n) => n.id === rangeEndNote.id);
              if (startIdx === -1 || endIdx === -1) return;
              const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
              setClipboard(notes.slice(lo, hi + 1));
            }}
          >
            Copy range
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!clipboard}
            onClick={() => {
              if (!clipboard) return;
              // Paste after the currently selected note (or at the end if none selected).
              const insertAfterIdx = selectedNote
                ? notes.findIndex((n) => n.id === selectedNote.id)
                : notes.length - 1;
              const pasted = clipboard.map((n) => ({ ...n, id: createNoteId() }));
              const before = notes.slice(0, insertAfterIdx + 1);
              const after = notes.slice(insertAfterIdx + 1);
              onNotesChange([...before, ...pasted, ...after].map((n, idx) => ({ ...n, position: idx })));
            }}
          >
            Paste after selected note{clipboard ? ` (${clipboard.length} notes)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

