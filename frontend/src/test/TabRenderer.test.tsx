import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { TabRenderer } from "../components/TabRenderer";
import type { NoteOut } from "../types/api";

function makeNote(overrides: Partial<NoteOut>): NoteOut {
  return {
    id: "n1",
    position: 0,
    string_number: 1,
    fret: 0,
    duration_beats: 1,
    line_break: false,
    lyric: null,
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
      makeNote({ id: "a", position: 0, string_number: 2, fret: 3, lyric: "Hello", line_break: true }),
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
    const notes = [makeNote({ id: "a", position: 0, string_number: 1, fret: 5, line_break: true })];
    const { container } = render(<TabRenderer notes={notes} onNoteClick={onNoteClick} />);
    const cell = container.querySelector(".tab-fret-cell.clickable")!;
    await user.click(cell);
    expect(onNoteClick).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));
  });
});
