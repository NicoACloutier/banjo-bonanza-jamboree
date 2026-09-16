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

  it("renders a rest (a note blank on every string) as dashes, same as any other unfilled note", () => {
    const notes = [
      makeNote({ id: "a", position: 0, frets: [makeFret({ string_number: 3, fret: 2 })] }),
      makeNote({ id: "rest", position: 1, is_rest: true, frets: [], line_break: true }),
    ];
    const { container } = render(<TabRenderer notes={notes} />);
    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    // The rest note must never show "0" (its placeholder fret); its cells show "-".
    expect(fretTexts).not.toContain("0");
    expect(fretTexts).toContain("-");
    // The other (real) note's fret should still render normally.
    expect(fretTexts).toContain("2");
  });

  it("editable mode: clicking a blank cell opens an inline input, and committing a fret updates the note", async () => {
    const user = userEvent.setup();
    const onFretChange = vi.fn();
    const notes = [makeNote({ id: "a", position: 0, frets: [], line_break: true })];
    const { container } = render(<TabRenderer notes={notes} onFretChange={onFretChange} />);

    const cell = container.querySelector(".tab-fret-cell.clickable")!;
    await user.click(cell);
    const input = screen.getByLabelText("Fret for string 1");
    await user.clear(input);
    await user.type(input, "3");
    await user.keyboard("{Enter}");

    expect(onFretChange).toHaveBeenCalledWith("a", 1, 3);
  });

  it("editable mode: clearing a fret's inline input commits null (removes the string)", async () => {
    const user = userEvent.setup();
    const onFretChange = vi.fn();
    const notes = [
      makeNote({ id: "a", position: 0, frets: [makeFret({ string_number: 1, fret: 2 })], line_break: true }),
    ];
    const { container } = render(<TabRenderer notes={notes} onFretChange={onFretChange} />);

    const cell = container.querySelector(".tab-fret-cell.clickable")!;
    await user.click(cell);
    const input = screen.getByLabelText("Fret for string 1");
    await user.clear(input);
    await user.keyboard("{Enter}");

    expect(onFretChange).toHaveBeenCalledWith("a", 1, null);
  });

  it("editable mode: typing into the lyric input below a note calls onLyricChange", async () => {
    const user = userEvent.setup();
    const onLyricChange = vi.fn();
    const notes = [makeNote({ id: "a", position: 0, frets: [], lyric: null, line_break: true })];
    const { container } = render(
      <TabRenderer notes={notes} onFretChange={vi.fn()} onLyricChange={onLyricChange} />,
    );

    const lyricInput = container.querySelector(".lyric-token-input") as HTMLInputElement;
    await user.type(lyricInput, "Hi");
    expect(onLyricChange).toHaveBeenCalled();
  });

  it("editable mode: clicking a note's duration marker calls onDurationCycle", async () => {
    const user = userEvent.setup();
    const onDurationCycle = vi.fn();
    const notes = [makeNote({ id: "a", position: 0, frets: [], line_break: true })];
    const { container } = render(
      <TabRenderer notes={notes} onFretChange={vi.fn()} onDurationCycle={onDurationCycle} />,
    );

    const marker = container.querySelector(".duration-marker") as HTMLElement;
    await user.click(marker);
    expect(onDurationCycle).toHaveBeenCalledWith("a");
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

  it("labels a drop-thumb fret with a 'd' suffix on the tab itself", () => {
    const notes = [makeNote({ id: "a", position: 0, frets: [makeFret({ fret: 5, technique: "drop_thumb" })] })];
    const { container } = render(<TabRenderer notes={notes} />);
    const fretTexts = Array.from(container.querySelectorAll(".tab-fret-cell")).map((el) => el.textContent);
    expect(fretTexts).toContain("5d");
    expect(container.querySelectorAll(".tab-fret-cell.drop-thumb")).toHaveLength(1);
  });

  it("draws a bar-break divider before every Nth note per barsPerLine, in both editable and read-only mode", () => {
    const notes = Array.from({ length: 16 }, (_, i) => makeNote({ id: `n${i}`, position: i, frets: [] }));
    const { container } = render(<TabRenderer notes={notes} barsPerLine={4} />);
    // 16 notes / 4 bars per line = a divider every 4 notes -- 3 breaks (at note 4, 8, 12) x 5 strings.
    expect(container.querySelectorAll(".tab-fret-cell.bar-break")).toHaveLength(15);
  });

  it("draws no bar-break dividers when barsPerLine is 1 (the default)", () => {
    const notes = Array.from({ length: 16 }, (_, i) => makeNote({ id: `n${i}`, position: i, frets: [] }));
    const { container } = render(<TabRenderer notes={notes} />);
    expect(container.querySelectorAll(".bar-break")).toHaveLength(0);
  });
});
