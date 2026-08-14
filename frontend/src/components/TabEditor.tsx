/**
 * Tab creation/editing UI.
 *
 * Notes are entered one at a time: pick a string (1-5), type/click a fret
 * number, optionally attach a lyric snippet and mark a line break, then
 * "Add Note" appends it to the tab. Existing notes can be selected (click
 * in the preview) to edit their fret/lyric/line-break or delete them.
 */
import { useMemo, useState } from "react";
import { TabRenderer } from "./TabRenderer";
import type { NoteOut, TuningOut } from "../types/api";

export interface TabMetadata {
  songName: string;
  artist: string;
  album: string;
  tuningKey: string;
  tempoBpm: number;
}

interface TabEditorProps {
  tunings: TuningOut[];
  metadata: TabMetadata;
  onMetadataChange: (metadata: TabMetadata) => void;
  notes: NoteOut[];
  onNotesChange: (notes: NoteOut[]) => void;
}

const DURATION_OPTIONS = [
  { label: "Sixteenth", value: 0.25 },
  { label: "Eighth", value: 0.5 },
  { label: "Quarter", value: 1 },
  { label: "Half", value: 2 },
  { label: "Whole", value: 4 },
];

function createNoteId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note-${Math.random().toString(36).slice(2)}`;
}

export function TabEditor({ tunings, metadata, onMetadataChange, notes, onNotesChange }: TabEditorProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [pendingString, setPendingString] = useState(1);
  const [pendingFret, setPendingFret] = useState(0);
  const [pendingDuration, setPendingDuration] = useState(1);
  const [pendingLineBreak, setPendingLineBreak] = useState(false);
  const [pendingLyric, setPendingLyric] = useState("");
  const [pendingIsRest, setPendingIsRest] = useState(false);

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedNoteId) ?? null, [notes, selectedNoteId]);

  const addNote = () => {
    const newNote: NoteOut = {
      id: createNoteId(),
      position: notes.length,
      string_number: pendingString,
      fret: pendingFret,
      duration_beats: pendingDuration,
      line_break: pendingLineBreak,
      lyric: pendingIsRest ? null : pendingLyric.trim() ? pendingLyric.trim() : null,
      is_rest: pendingIsRest,
    };
    onNotesChange([...notes, newNote]);
    setPendingLyric("");
    setPendingLineBreak(false);
  };

  const removeSelectedNote = () => {
    if (!selectedNote) return;
    const remaining = notes
      .filter((n) => n.id !== selectedNote.id)
      .map((n, idx) => ({ ...n, position: idx }));
    onNotesChange(remaining);
    setSelectedNoteId(null);
  };

  const updateSelectedNote = (patch: Partial<NoteOut>) => {
    if (!selectedNote) return;
    onNotesChange(notes.map((n) => (n.id === selectedNote.id ? { ...n, ...patch } : n)));
  };

  return (
    <div>
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
      </div>

      <h3>Tab preview</h3>
      <TabRenderer
        notes={notes}
        selectedNoteId={selectedNoteId}
        onNoteClick={(note) => setSelectedNoteId(note.id)}
      />

      {selectedNote && (
        <div className="panel">
          <h3>Edit selected note</h3>
          <label>
            <input
              type="checkbox"
              checked={selectedNote.is_rest}
              onChange={(e) =>
                updateSelectedNote({
                  is_rest: e.target.checked,
                  lyric: e.target.checked ? null : selectedNote.lyric,
                })
              }
            />
            This is a rest (no sound -- just a gap before the next note)
          </label>
          <div className="form-row">
            <label>
              String
              <select
                value={selectedNote.string_number}
                disabled={selectedNote.is_rest}
                onChange={(e) => updateSelectedNote({ string_number: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((s) => (
                  <option key={s} value={s}>
                    String {s}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fret
              <input
                type="number"
                min={0}
                max={24}
                value={selectedNote.fret}
                disabled={selectedNote.is_rest}
                onChange={(e) => updateSelectedNote({ fret: Number(e.target.value) })}
              />
            </label>
            <label>
              Duration
              <select
                value={selectedNote.duration_beats}
                onChange={(e) => updateSelectedNote({ duration_beats: Number(e.target.value) })}
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Lyric at this note
            <input
              type="text"
              value={selectedNote.lyric ?? ""}
              disabled={selectedNote.is_rest}
              onChange={(e) => updateSelectedNote({ lyric: e.target.value || null })}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={selectedNote.line_break}
              onChange={(e) => updateSelectedNote({ line_break: e.target.checked })}
            />
            Start a new line after this note
          </label>
          <button className="secondary" onClick={removeSelectedNote}>
            Delete this note
          </button>
        </div>
      )}

      <h3>Add a note</h3>
      <label>
        <input type="checkbox" checked={pendingIsRest} onChange={(e) => setPendingIsRest(e.target.checked)} />
        This is a rest (no sound -- just a gap before the next note)
      </label>
      <div className="string-fret-picker" role="group" aria-label="Pick a string">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            disabled={pendingIsRest}
            className={pendingString === s ? "" : "secondary"}
            onClick={() => setPendingString(s)}
          >
            Str {s}
          </button>
        ))}
      </div>
      <div className="form-row">
        <label>
          Fret number
          <input
            type="number"
            min={0}
            max={24}
            value={pendingFret}
            disabled={pendingIsRest}
            onChange={(e) => setPendingFret(Number(e.target.value))}
          />
        </label>
        <label>
          Duration
          <select value={pendingDuration} onChange={(e) => setPendingDuration(Number(e.target.value))}>
            {DURATION_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lyric (optional)
          <input
            type="text"
            value={pendingLyric}
            disabled={pendingIsRest}
            onChange={(e) => setPendingLyric(e.target.value)}
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={pendingLineBreak}
            onChange={(e) => setPendingLineBreak(e.target.checked)}
          />
          New line after this note
        </label>
      </div>
      <button onClick={addNote}>+ Add Note{pendingIsRest ? " (Rest)" : ""}</button>
    </div>
  );
}
