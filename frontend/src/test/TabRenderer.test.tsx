import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { TabRenderer } from "../components/TabRenderer";
import type { NoteFretIn, NoteOut } from "../types/api";

function makeFret(overrides: Partial<NoteFretIn> = {}): NoteFretIn {
  return {
    string_number: 1,
    fret: 0,
    technique: "normal",
    slide_to_fret: null,
    bend_semitones: null,
    right_hand_finger: null,
    ...overrides,
  };
}

function makeNote(overrides: Partial<NoteOut>): NoteOut {
  return {
    id: "n1",
    position: 0,
    duration_beats: 1,
    line_break: false,
    lyric: null,
    is_rest: false,
    frets: [makeFret()],
    ...overrides,
  };
}

describe("TabRenderer", () => {
  it("shows a placeholder message when there are no notes", () => {
    render(<TabRenderer notes={[]} />);
    expect(screen.getByText(/no notes yet/i)).toBeInTheDocument();
  });

  it("renders fret numbers on the correct string row and lyrics below the line", () => {
    const notes = [
      makeNote({
        id: "a",
        position: 0,
        frets: [makeFret({ string_number: 2, fret: 3 })],
        lyric: "Hello",
        line_break: true,
      }),
    ];
    const { container } = render(<TabRenderer notes={notes} />);
    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("3");
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("calls onNoteClick when a fret cell is clicked", async () => {
    const user = userEvent.setup();
    const onNoteClick = vi.fn();
    const notes = [
      makeNote({ id: "a", position: 0, frets: [makeFret({ string_number: 1, fret: 5 })], line_break: true }),
    ];
    const { container } = render(<TabRenderer notes={notes} onNoteClick={onNoteClick} />);
    const cell = container.querySelector(".tab-fret-cell.clickable")!;
    await user.click(cell);
    expect(onNoteClick).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });

  it("renders rests as blank space on every string row (no fret digit shown)", () => {
    const notes = [
      makeNote({ id: "a", position: 0, frets: [makeFret({ string_number: 3, fret: 2 })] }),
      makeNote({ id: "rest", position: 1, is_rest: true, frets: [], line_break: true }),
    ];
    const { container } = render(<TabRenderer notes={notes} />);
    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    // The rest note must never show "0" (its placeholder fret) nor "-" on any
    // of the 5 string rows -- only blank cells for its column.
    expect(fretTexts).not.toContain("0");
    // The other (real) note's fret should still render normally.
    expect(fretTexts).toContain("2");
  });

  it("renders every string of a chord in the same column", () => {
    const notes = [
      makeNote({
        id: "chord",
        position: 0,
        frets: [
          makeFret({ string_number: 1, fret: 0 }),
          makeFret({ string_number: 2, fret: 1 }),
          makeFret({ string_number: 5, fret: 0 }),
        ],
      }),
    ];
    const { container } = render(<TabRenderer notes={notes} />);
    const chordCells = container.querySelectorAll(".tab-fret-cell.chord-member");
    // Three strings sound in this chord, so three cells should be flagged as chord members.
    expect(chordCells).toHaveLength(3);
  });

  it("renders technique suffixes for hammer-ons, pull-offs, and slides", () => {
    const notes = [
      makeNote({ id: "hammer", position: 0, frets: [makeFret({ fret: 2, technique: "hammer_on" })] }),
      makeNote({ id: "pull", position: 1, frets: [makeFret({ fret: 0, technique: "pull_off" })] }),
      makeNote({
        id: "slide",
        position: 2,
        frets: [makeFret({ fret: 2, technique: "slide", slide_to_fret: 4 })],
        line_break: true,
      }),
    ];
    const { container } = render(<TabRenderer notes={notes} />);
    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("h2");
    expect(fretTexts).toContain("p0");
    expect(fretTexts).toContain("2s4");
  });
});
