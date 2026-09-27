/**
 * Diagrams for the chords named in a tab, voiced for its tuning and capo.
 * `highlighted` scrolls that chord's diagram into view and marks it (used
 * when a chord name in the tab is clicked).
 */
import { useEffect, useRef } from "react";
import { ChordDiagram } from "./ChordDiagram";
import { findChordShapes, parseChord } from "../lib/chords";
import { fifthStringRaise } from "../lib/tabLayout";
import type { TuningOut } from "../types/api";

interface TabChordsProps {
  chordNames: string[];
  tuning: TuningOut;
  capoFret: number;
  fifthStringCapoFret: number | null;
  highlighted?: string | null;
}

export function TabChords({ chordNames, tuning, capoFret, fifthStringCapoFret, highlighted }: TabChordsProps) {
  const highlightedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    highlightedRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [highlighted]);

  if (chordNames.length === 0) return null;
  return (
    <section className="panel tab-chords">
      <h3>Chords</h3>
      <div className="chord-grid">
        {chordNames.map((name) => {
          const chord = parseChord(name);
          const [shape] = chord
            ? findChordShapes(chord, tuning.open_strings, {
                capoFret,
                fifthStringRaise: fifthStringRaise(capoFret, fifthStringCapoFret),
                limit: 1,
              })
            : [];
          const isHighlighted = name === highlighted;
          return (
            <div
              key={name}
              ref={isHighlighted ? highlightedRef : undefined}
              className={isHighlighted ? "chord-cell highlighted" : "chord-cell"}
            >
              {chord && shape ? (
                <ChordDiagram name={chord.name} shape={shape} />
              ) : (
                <p className="muted-text">
                  <strong>{name}</strong>: no diagram
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
