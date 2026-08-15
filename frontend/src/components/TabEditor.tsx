/**
 * Tab creation/editing UI.
 *
 * Notes are entered one at a time as a "slot": pick one or more strings
 * (more than one makes a chord -- several strings struck simultaneously),
 * give each picked string a fret number and an optional playing technique
 * (hammer-on, pull-off, or slide), optionally attach a lyric snippet and
 * mark a line break, then "Add Note" appends the slot to the tab. Existing
 * notes can be selected (click in the preview) to edit their
 * strings/frets/techniques/lyric/line-break or delete them.
 */
import { useMemo, useState } from "react";
import { TabRenderer } from "./TabRenderer";
import type { NoteFretIn, NoteOut, Technique, TuningOut } from "../types/api";

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

const TECHNIQUE_OPTIONS: { label: string; value: Technique }[] = [
  { label: "Picked (normal)", value: "normal" },
  { label: "Hammer-on", value: "hammer_on" },
  { label: "Pull-off", value: "pull_off" },
  { label: "Slide", value: "slide" },
];

function createNoteId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `note-${Math.random().toString(36).slice(2)}`;
}

/** Editor for one string's fret/technique within a (possibly chordal) note slot. */
function FretRowEditor({
  fret,
  onChange,
  onRemove,
}: {
  fret: NoteFretIn;
  onChange: (patch: Partial<NoteFretIn>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="form-row fret-row-editor">
      <span className="fret-row-string-label">String {fret.string_number}</span>
      <label>
        Fret
        <input
          type="number"
          min={0}
          max={24}
          value={fret.fret}
          onChange={(e) => onChange({ fret: Number(e.target.value) })}
        />
      </label>
      <label>
        Technique
        <select
          value={fret.technique}
          onChange={(e) => {
            const technique = e.target.value as Technique;
            onChange({
              technique,
              slide_to_fret: technique === "slide" ? fret.slide_to_fret ?? fret.fret + 2 : null,
            });
          }}
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
      <button type="button" className="secondary" onClick={onRemove}>
        Remove string
      </button>
    </div>
  );
}

export function TabEditor({ tunings, metadata, onMetadataChange, notes, onNotesChange }: TabEditorProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [pendingFrets, setPendingFrets] = useState<NoteFretIn[]>([
    { string_number: 1, fret: 0, technique: "normal", slide_to_fret: null },
  ]);
  const [pendingDuration, setPendingDuration] = useState(1);
  const [pendingLineBreak, setPendingLineBreak] = useState(false);
  const [pendingLyric, setPendingLyric] = useState("");
  const [pendingIsRest, setPendingIsRest] = useState(false);

  const selectedNote = useMemo(() => notes.find((n) => n.id === selectedNoteId) ?? null, [notes, selectedNoteId]);

  const togglePendingString = (stringNumber: number) => {
    setPendingFrets((current) => {
      const exists = current.some((f) => f.string_number === stringNumber);
      if (exists) return current.filter((f) => f.string_number !== stringNumber);
      const newFret: NoteFretIn = { string_number: stringNumber, fret: 0, technique: "normal", slide_to_fret: null };
      return [...current, newFret].sort((a, b) => a.string_number - b.string_number);
    });
  };

  const updatePendingFret = (stringNumber: number, patch: Partial<NoteFretIn>) => {
    setPendingFrets((current) =>
      current.map((f) => (f.string_number === stringNumber ? { ...f, ...patch } : f)),
    );
  };

  const addNote = () => {
    if (!pendingIsRest && pendingFrets.length === 0) return; // must have at least one string unless it's a rest
    const newNote: NoteOut = {
      id: createNoteId(),
      position: notes.length,
      duration_beats: pendingDuration,
      line_break: pendingLineBreak,
      lyric: pendingIsRest ? null : pendingLyric.trim() ? pendingLyric.trim() : null,
      is_rest: pendingIsRest,
      frets: pendingIsRest
        ? []
        : pendingFrets.map((f) => ({ ...f, slide_to_fret: f.technique === "slide" ? f.slide_to_fret : null })),
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

  const toggleSelectedNoteString = (stringNumber: number) => {
    if (!selectedNote) return;
    const exists = selectedNote.frets.some((f) => f.string_number === stringNumber);
    const nextFrets = exists
      ? selectedNote.frets.filter((f) => f.string_number !== stringNumber)
      : [
          ...selectedNote.frets,
          { string_number: stringNumber, fret: 0, technique: "normal" as Technique, slide_to_fret: null },
        ].sort((a, b) => a.string_number - b.string_number);
    updateSelectedNote({ frets: nextFrets });
  };

  const updateSelectedNoteFret = (stringNumber: number, patch: Partial<NoteFretIn>) => {
    if (!selectedNote) return;
    updateSelectedNote({
      frets: selectedNote.frets.map((f) => (f.string_number === stringNumber ? { ...f, ...patch } : f)),
    });
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
                  frets: e.target.checked ? [] : selectedNote.frets,
                })
              }
            />
            This is a rest (no sound -- just a gap before the next note)
          </label>
          {!selectedNote.is_rest && (
            <>
              <div className="string-fret-picker" role="group" aria-label="Pick one or more strings (multiple = chord)">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={selectedNote.frets.some((f) => f.string_number === s) ? "" : "secondary"}
                    onClick={() => toggleSelectedNoteString(s)}
                  >
                    Str {s}
                  </button>
                ))}
              </div>
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
                    onRemove={() => toggleSelectedNoteString(fret.string_number)}
                  />
                ))}
            </>
          )}
          <div className="form-row">
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
      {!pendingIsRest && (
        <>
          <div className="string-fret-picker" role="group" aria-label="Pick one or more strings (multiple = chord)">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                className={pendingFrets.some((f) => f.string_number === s) ? "" : "secondary"}
                onClick={() => togglePendingString(s)}
              >
                Str {s}
              </button>
            ))}
          </div>
          {pendingFrets.length > 1 && (
            <p className="muted-text">{pendingFrets.length} strings selected -- this note will play as a chord.</p>
          )}
          {pendingFrets
            .slice()
            .sort((a, b) => a.string_number - b.string_number)
            .map((fret) => (
              <FretRowEditor
                key={fret.string_number}
                fret={fret}
                onChange={(patch) => updatePendingFret(fret.string_number, patch)}
                onRemove={() => togglePendingString(fret.string_number)}
              />
            ))}
        </>
      )}
      <div className="form-row">
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
          <input type="checkbox" checked={pendingLineBreak} onChange={(e) => setPendingLineBreak(e.target.checked)} />
          New line after this note
        </label>
      </div>
      <button onClick={addNote} disabled={!pendingIsRest && pendingFrets.length === 0}>
        + Add Note{pendingIsRest ? " (Rest)" : pendingFrets.length > 1 ? " (Chord)" : ""}
      </button>
    </div>
  );
}
