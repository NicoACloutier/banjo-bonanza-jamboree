/**
 * "Insert a roll/pattern" tool for the editor: pick a right-hand pattern
 * and a chord, see the chord shape it'll use, and write one bar of it into
 * the tab at the selected note.
 */
import { useMemo, useState } from "react";
import { ChordDiagram } from "./ChordDiagram";
import { buildPattern, PATTERNS, type PatternResult } from "../lib/patterns";
import type { TuningOut } from "../types/api";

interface PatternInserterProps {
  tuning: TuningOut | undefined;
  capoFret: number;
  fifthStringCapoFret: number | null;
  /** Where the pattern will go, for the button label. */
  hasSelection: boolean;
  onInsert: (result: PatternResult) => void;
}

export function PatternInserter({ tuning, capoFret, fifthStringCapoFret, hasSelection, onInsert }: PatternInserterProps) {
  const [patternId, setPatternId] = useState(PATTERNS[0].id);
  const [chordName, setChordName] = useState("G");

  const preview = useMemo((): PatternResult | Error | null => {
    if (!tuning || !chordName.trim()) return null;
    try {
      return buildPattern(patternId, chordName, tuning, { capoFret, fifthStringCapoFret });
    } catch (err) {
      return err instanceof Error ? err : new Error(String(err));
    }
  }, [patternId, chordName, tuning, capoFret, fifthStringCapoFret]);

  return (
    <div className="panel">
      <h3>Insert a roll or pattern</h3>
      <p className="muted-text">
        Writes one bar of the pattern over the chord's easiest shape, starting at the selected note (or at the end).
      </p>
      <div className="pattern-inserter">
        <div className="pattern-inserter-body">
          <div className="pattern-inserter-fields">
            <label>
              Pattern
              <select value={patternId} onChange={(e) => setPatternId(e.target.value)}>
                {PATTERNS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Chord
              <input type="text" value={chordName} maxLength={16} onChange={(e) => setChordName(e.target.value)} />
            </label>
          </div>
          {preview && !(preview instanceof Error) && (
            <div className="pattern-preview">
              <ChordDiagram name={preview.notes[0].chord ?? chordName} shape={preview.shape} />
              {preview.needsClawhammer && (
                <p className="muted-text">This pattern turns on clawhammer mode for its 5th-string thumb plucks.</p>
              )}
            </div>
          )}
        </div>
        {preview instanceof Error && <p className="error-banner">{preview.message}</p>}
        <button
          type="button"
          className="secondary"
          disabled={!preview || preview instanceof Error}
          onClick={() => preview && !(preview instanceof Error) && onInsert(preview)}
        >
          {hasSelection ? "Insert at selected note" : "Add to the end"}
        </button>
      </div>
    </div>
  );
}
