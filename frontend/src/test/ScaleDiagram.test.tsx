import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScaleDiagram } from "../components/ScaleDiagram";
import { getFallbackTuning } from "../lib/tunings";

const openG = getFallbackTuning("standard_g");

function markers(songKey: string, capoFret = 0, fifthStringRaise = capoFret) {
  const { container } = render(
    <ScaleDiagram songKey={songKey} tuning={openG} capoFret={capoFret} fifthStringRaise={fifthStringRaise} />,
  );
  const notes = Array.from(container.querySelectorAll(".scale-note"));
  return {
    total: notes.length,
    roots: container.querySelectorAll(".scale-note.root").length,
    degrees: new Set(notes.map((n) => n.textContent)),
  };
}

describe("ScaleDiagram", () => {
  it("marks every scale note on frets 0-12, numbered by degree", () => {
    // Strings 1-4 have 8 scale notes each over frets 0-12 (all open strings are in G major);
    // the short 5th string (frets 5-12) has 5. G is on s1 fret 5, s2 fret 8, s3 frets 0 and 12,
    // s4 fret 5 and the open 5th string.
    const g = markers("G");
    expect(g.total).toBe(37);
    expect(g.roots).toBe(6);
    expect([...g.degrees].sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("uses the key's own root for minor keys", () => {
    // E minor has G major's notes, but E is on s1/s4 fret 2, s2 fret 5 and s3 fret 9 only.
    const em = markers("Em");
    expect(em.total).toBe(37);
    expect(em.roots).toBe(4);
  });

  it("counts frets from the capo", () => {
    // Capo 2 (5th string spiked to match): A major looks exactly like G major uncapoed.
    expect(markers("A", 2)).toEqual(markers("G"));
  });

  it("starts the 5th string where it's spiked", () => {
    // Spiked at fret 7 (raised to A): the 5th string only covers frets 7-12 (A A# B C C# D),
    // four of which are in G major, on top of strings 1-4's 32.
    const spiked = markers("G", 0, 2);
    expect(spiked.total).toBe(32 + 4);
  });
});
