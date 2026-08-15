import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TabEditor, createEmptyNote, type TabMetadata } from "../components/TabEditor";
import { FALLBACK_TUNINGS } from "../lib/tunings";
import type { NoteOut } from "../types/api";

function Harness({ initialNotes = [] as NoteOut[] }: { initialNotes?: NoteOut[] }) {
  const [metadata, setMetadata] = useState<TabMetadata>({
    songName: "",
    artist: "",
    album: "",
    tuningKey: FALLBACK_TUNINGS[0].key,
    tempoBpm: 100,
    capoFret: 0,
  });
  const [notes, setNotes] = useState<NoteOut[]>(initialNotes);
  return (
    <TabEditor
      tunings={FALLBACK_TUNINGS}
      metadata={metadata}
      onMetadataChange={setMetadata}
      notes={notes}
      onNotesChange={setNotes}
    />
  );
}

/** Click the first clickable fret cell for a given string row (1-indexed) and type a fret. */
async function typeFret(
  user: ReturnType<typeof userEvent.setup>,
  container: HTMLElement,
  stringNumber: number,
  cellIndex: number,
  value: string,
) {
  const stringRows = container.querySelectorAll(".tab-string-row");
  const row = stringRows[stringNumber - 1] as HTMLElement;
  const cells = row.querySelectorAll(".tab-fret-cell.clickable");
  await user.click(cells[cellIndex]);
  const input = screen.getByLabelText(`Fret for string ${stringNumber}`);
  await user.clear(input);
  if (value) await user.type(input, value);
  await user.keyboard("{Enter}");
}

describe("TabEditor", () => {
  it("starts with a blank (dash) note and allows adding more", async () => {
    const user = userEvent.setup();
    render(<Harness initialNotes={[createEmptyNote(0)]} />);
    await user.click(screen.getByRole("button", { name: /\+ add 1 empty note/i }));
    expect(screen.getAllByRole("option", { name: "Note 2" }).length).toBeGreaterThan(0);
  });

  it("allows editing metadata fields", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const songNameInput = screen.getByLabelText(/song name/i);
    await user.type(songNameInput, "Cripple Creek");
    expect(songNameInput).toHaveValue("Cripple Creek");
  });

  it("clicking a blank cell and typing a fret fills it in, and shows the edit panel", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await typeFret(user, container, 3, 0, "4");

    expect(screen.getByText(/edit selected note/i)).toBeInTheDocument();
    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("4");
  });

  it("leaving a fret cell blank/backspaced reverts it back to '-' (a rest is just an all-dash note)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    // Fill in string 1, then clear it again.
    await typeFret(user, container, 1, 0, "2");
    let fretTexts = Array.from(container.querySelectorAll(".tab-fret-cell")).map((el) => el.textContent);
    expect(fretTexts).toContain("2");

    await typeFret(user, container, 1, 0, "");
    fretTexts = Array.from(container.querySelectorAll(".tab-fret-cell")).map((el) => el.textContent);
    expect(fretTexts.every((t) => t === "-")).toBe(true);
  });

  it("selecting a note in the preview shows the edit panel and allows deletion", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);
    await typeFret(user, container, 1, 0, "0");
    expect(screen.getByText(/edit selected note/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete this note/i }));
    expect(screen.queryByText(/edit selected note/i)).not.toBeInTheDocument();
  });

  it("supports selecting multiple strings on the same note to create a chord", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await typeFret(user, container, 1, 0, "0");
    await typeFret(user, container, 2, 0, "1");
    await typeFret(user, container, 3, 0, "2");

    expect(screen.getByText(/3 strings selected/i)).toBeInTheDocument();
    const chordCells = container.querySelectorAll(".tab-fret-cell.chord-member");
    expect(chordCells).toHaveLength(3);
  });

  it("supports marking a note with a hammer-on technique, rendered with an 'h' suffix", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await typeFret(user, container, 1, 0, "2");
    await user.selectOptions(screen.getByLabelText(/technique/i), "hammer_on");

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("h2");
  });

  it("supports marking a note with a slide technique and slide-to-fret, rendered as '<fret>s<target>'", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await typeFret(user, container, 1, 0, "2");
    await user.selectOptions(screen.getByLabelText(/technique/i), "slide");

    const slideInput = screen.getByLabelText(/slide to fret/i);
    await user.clear(slideInput);
    await user.type(slideInput, "5");

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("2s5");
  });

  it("supports marking a note with a bend technique and bend amount, rendered as '<fret>b<semitones>'", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await typeFret(user, container, 1, 0, "3");
    await user.selectOptions(screen.getByLabelText(/technique/i), "bend");

    const bendInput = screen.getByLabelText(/bend up/i);
    await user.clear(bendInput);
    await user.type(bendInput, "2");

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("3b2");
  });

  it("supports marking a note with drop-thumb technique and a roll-pattern finger annotation", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await typeFret(user, container, 1, 0, "5");
    await user.selectOptions(screen.getByLabelText(/technique/i), "drop_thumb");
    await user.selectOptions(screen.getByLabelText(/roll finger/i), "thumb");

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    // drop_thumb has no fret suffix, but the finger annotation "T" is appended.
    expect(fretTexts).toContain("5T");
    expect(container.querySelectorAll(".tab-fret-cell.drop-thumb")).toHaveLength(1);
  });

  it("allows setting a capo fret in the metadata form", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const capoInput = screen.getByLabelText(/capo/i);
    await user.clear(capoInput);
    await user.type(capoInput, "3");
    expect(capoInput).toHaveValue(3);
  });

  it("typing a lyric into the box below a note updates it", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    const lyricInput = container.querySelector(".lyric-token-input") as HTMLInputElement;
    await user.type(lyricInput, "Hello");
    expect(lyricInput).toHaveValue("Hello");
  });

  it("clicking a note's duration marker cycles its duration", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    const marker = container.querySelector(".duration-marker") as HTMLElement;
    expect(marker.textContent).toBe(""); // default quarter note has no visible label
    await user.click(marker);
    expect(marker.textContent).toBe("half");
    await user.click(marker);
    expect(marker.textContent).toBe("whole");
  });

  it("supports copying a range of notes and pasting them elsewhere (e.g. to reuse a chorus)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0), createEmptyNote(1)]} />);

    await typeFret(user, container, 1, 0, "1");
    await typeFret(user, container, 1, 1, "2");

    // Copy the range "Note 1" through "Note 2".
    await user.selectOptions(screen.getByLabelText(/range start/i), "Note 1");
    await user.selectOptions(screen.getByLabelText(/range end/i), "Note 2");
    await user.click(screen.getByRole("button", { name: /copy range/i }));
    await user.click(screen.getByRole("button", { name: /paste after selected note/i }));

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells)
      .map((el) => el.textContent)
      .filter((t) => t !== "" && t !== "-");
    // The 2-note range should now appear twice: [1, 2, 1, 2].
    expect(fretTexts).toEqual(["1", "2", "1", "2"]);
  });

  it("adds 1 empty note at a time via the '+ Add 1 empty note' button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /\+ add 1 empty note/i }));
    await user.click(screen.getByRole("button", { name: /\+ add 1 empty note/i }));
    expect(screen.getAllByRole("option", { name: "Note 2" }).length).toBeGreaterThan(0);
  });

  it("adds a line (16 empty notes) at once via the '+ Add a line' button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /\+ add a line/i }));
    expect(screen.getAllByRole("option", { name: "Note 16" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("option", { name: "Note 17" })).not.toBeInTheDocument();
  });

  it("removes a note via the 'Delete this note' button after selecting it", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0), createEmptyNote(1)]} />);

    const firstCell = container.querySelectorAll(".tab-fret-cell.clickable")[0];
    await user.click(firstCell);
    expect(screen.getByText(/edit selected note/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete this note/i }));

    expect(screen.queryByRole("option", { name: "Note 2" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: "Note 1" }).length).toBeGreaterThan(0);
  });

  it("removes an entire line via the 'Remove line' button after selecting a note in it", async () => {
    const user = userEvent.setup();
    const notes = Array.from({ length: 17 }, (_, i) => createEmptyNote(i));
    const { container } = render(<Harness initialNotes={notes} />);

    // Select the first note (line 1: notes 1-16) and remove its line.
    const firstCell = container.querySelectorAll(".tab-fret-cell.clickable")[0];
    await user.click(firstCell);
    await user.click(screen.getByRole("button", { name: /remove line/i }));

    // Only the 17th note (now renumbered as note 1) should remain.
    expect(screen.getAllByRole("option", { name: "Note 1" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("option", { name: "Note 2" })).not.toBeInTheDocument();
  });
});
