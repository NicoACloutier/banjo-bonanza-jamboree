import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TabEditor, type TabMetadata } from "../components/TabEditor";
import { FALLBACK_TUNINGS } from "../lib/tunings";
import type { NoteOut } from "../types/api";

function Harness() {
  const [metadata, setMetadata] = useState<TabMetadata>({
    songName: "",
    artist: "",
    album: "",
    tuningKey: FALLBACK_TUNINGS[0].key,
    tempoBpm: 100,
  });
  const [notes, setNotes] = useState<NoteOut[]>([]);
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

describe("TabEditor", () => {
  it("adds a note with the selected string and fret when 'Add Note' is clicked", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    // String 1 is selected by default; toggle to string 3 instead.
    await user.click(screen.getByRole("button", { name: "Str 1" }));
    await user.click(screen.getByRole("button", { name: "Str 3" }));
    const fretInput = screen.getByLabelText(/^fret$/i);
    await user.clear(fretInput);
    await user.type(fretInput, "4");
    await user.click(screen.getByRole("button", { name: /\+ add note/i }));

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("4");
  });

  it("allows editing metadata fields", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const songNameInput = screen.getByLabelText(/song name/i);
    await user.type(songNameInput, "Cripple Creek");
    expect(songNameInput).toHaveValue("Cripple Creek");
  });

  it("selecting a note in the preview shows the edit panel and allows deletion", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /\+ add note/i }));
    await user.click(screen.getByText("0"));
    expect(screen.getByText(/edit selected note/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /delete this note/i }));
    expect(screen.queryByText(/edit selected note/i)).not.toBeInTheDocument();
  });

  it("adds a rest note (no fret digit rendered) when the rest checkbox is checked", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    await user.click(screen.getByLabelText(/this is a rest/i));
    await user.click(screen.getByRole("button", { name: /\+ add note \(rest\)/i }));

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    // A rest never shows a digit, so none of the string rows should show "0".
    expect(fretTexts).not.toContain("0");
    expect(fretTexts.every((t) => t === "")).toBe(true);
  });

  it("supports selecting multiple strings to create a chord", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    // String 1 is selected by default; add strings 2 and 3 for a 3-note chord.
    await user.click(screen.getByRole("button", { name: "Str 2" }));
    await user.click(screen.getByRole("button", { name: "Str 3" }));
    expect(screen.getByText(/3 strings selected/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /\+ add note \(chord\)/i }));

    const chordCells = container.querySelectorAll(".tab-fret-cell.chord-member");
    expect(chordCells).toHaveLength(3);
  });

  it("supports marking a note with a hammer-on technique, rendered with an 'h' suffix", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    const fretInput = screen.getByLabelText(/^fret$/i);
    await user.clear(fretInput);
    await user.type(fretInput, "2");
    await user.selectOptions(screen.getByLabelText(/technique/i), "hammer_on");
    await user.click(screen.getByRole("button", { name: /\+ add note/i }));

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("h2");
  });

  it("supports marking a note with a slide technique and slide-to-fret, rendered as '<fret>s<target>'", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);

    const fretInput = screen.getByLabelText(/^fret$/i);
    await user.clear(fretInput);
    await user.type(fretInput, "2");
    await user.selectOptions(screen.getByLabelText(/technique/i), "slide");

    const slideInput = screen.getByLabelText(/slide to fret/i);
    await user.clear(slideInput);
    await user.type(slideInput, "5");
    await user.click(screen.getByRole("button", { name: /\+ add note/i }));

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells).map((el) => el.textContent);
    expect(fretTexts).toContain("2s5");
  });
});
