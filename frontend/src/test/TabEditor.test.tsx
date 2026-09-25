import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabEditor, createEmptyNote, type TabMetadata } from "../components/TabEditor";
import { FALLBACK_TUNINGS } from "../lib/tunings";
import type { NoteOut } from "../types/api";

// No Web Audio in the test environment: stand in for the playback engine.
const enginePlay = vi.fn();
const engineStop = vi.fn();
vi.mock("../lib/playbackEngine", () => ({
  TabPlaybackEngine: class {
    play = enginePlay;
    stop = engineStop;
    dispose = vi.fn();
  },
}));
beforeEach(() => {
  enginePlay.mockClear();
  engineStop.mockClear();
});

function Harness({ initialNotes = [] as NoteOut[] }: { initialNotes?: NoteOut[] }) {
  const [metadata, setMetadata] = useState<TabMetadata>({
    songName: "",
    artist: "",
    album: "",
    tuningKey: FALLBACK_TUNINGS[0].key,
    tempoBpm: 100,
    capoFret: 0,
    barsPerLine: 4,
    clawhammerTiming: false,
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

  it("shows the technique editor immediately on a single click, before pressing Enter", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    const cell = container.querySelectorAll(".tab-fret-cell.clickable")[0];
    await user.click(cell);

    // No typing/Enter yet -- the click alone should already commit fret 0 and
    // show the technique editor, not the "blank on every string" message.
    expect(screen.getByText(/edit selected note/i)).toBeInTheDocument();
    expect(screen.queryByText(/blank on every string/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/technique/i)).toBeInTheDocument();
  });

  it("pressing a technique shortcut immediately after clicking a blank cell applies it, even before Enter", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    const cell = container.querySelectorAll(".tab-fret-cell.clickable")[0];
    await user.click(cell);
    // The inline fret-number input auto-focuses after the click; typing "h" here
    // should still apply the hammer-on shortcut rather than being swallowed.
    await user.keyboard("h");
    await user.keyboard("{Enter}");

    const fretTexts = Array.from(container.querySelectorAll(".tab-fret-cell")).map((el) => el.textContent);
    expect(fretTexts).toContain("h0");
  });

  it("pressing Escape right after clicking a blank cell fully reverts it back to '-'", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    const cell = container.querySelectorAll(".tab-fret-cell.clickable")[0];
    await user.click(cell);
    await user.keyboard("{Escape}");

    const fretTexts = Array.from(container.querySelectorAll(".tab-fret-cell")).map((el) => el.textContent);
    expect(fretTexts.every((t) => t === "-")).toBe(true);
    // The note stays selected (same as "Clear this note"), just reverted to blank.
    expect(screen.getByText(/blank on every string/i)).toBeInTheDocument();
  });

  it("puts the 'Edit selected note' panel beside the tab preview as two columns", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    expect(container.querySelector(".tab-with-editor")).not.toBeInTheDocument();

    const cell = container.querySelectorAll(".tab-fret-cell.clickable")[0];
    await user.click(cell);

    const layout = container.querySelector(".tab-with-editor");
    expect(layout).toBeInTheDocument();
    expect(layout!.querySelector(".tab-preview-col")).toBeInTheDocument();
    expect(layout!.querySelector(".edit-note-col")).toBeInTheDocument();
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

  it("selecting a note in the preview shows the edit panel and allows clearing it back to blank", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);
    await typeFret(user, container, 1, 0, "0");
    expect(screen.getByText(/edit selected note/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /clear this note/i }));
    // The note stays selected, but reverts to the blank/rest messaging.
    expect(screen.getByText(/edit selected note/i)).toBeInTheDocument();
    expect(screen.getByText(/blank on every string/i)).toBeInTheDocument();
  });

  it("clears a note via 'Clear this note' without removing its slot from the tab", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0), createEmptyNote(1)]} />);

    await typeFret(user, container, 1, 0, "3");
    await typeFret(user, container, 1, 1, "5");

    const firstCell = container.querySelectorAll(".tab-fret-cell.clickable")[0];
    await user.click(firstCell);
    await user.click(screen.getByRole("button", { name: /clear this note/i }));

    const fretTexts = Array.from(container.querySelectorAll(".tab-fret-cell"))
      .map((el) => el.textContent)
      .filter((t) => t !== "" && t !== "-");
    // The first note's fret is cleared back to "-"; the second note is untouched.
    expect(fretTexts).toEqual(["5"]);
    // Both note slots (10 cells = 5 strings x 2 notes) still exist -- nothing was removed.
    expect(container.querySelectorAll(".tab-fret-cell.clickable")).toHaveLength(10);
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
    // drop_thumb appends a "d" label, plus the finger annotation "T".
    expect(fretTexts).toContain("5dT");
    expect(container.querySelectorAll(".tab-fret-cell.drop-thumb")).toHaveLength(1);
  });

  it("lists a single-letter keyboard shortcut alongside each technique option", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);
    await typeFret(user, container, 1, 0, "2");

    const options = ["Normal (n)", "Hammer-on (h)", "Pull-off (p)", "Slide (s)", "Bend/choke (b)", "Drop-thumb (d)"];
    for (const label of options) {
      expect(screen.getByRole("option", { name: label })).toBeInTheDocument();
    }
  });

  it("applies a technique via its keyboard shortcut while a note is selected", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await typeFret(user, container, 1, 0, "2");
    expect(screen.getByText(/edit selected note/i)).toBeInTheDocument();

    await user.keyboard("h");

    const fretTexts = Array.from(container.querySelectorAll(".tab-fret-cell")).map((el) => el.textContent);
    expect(fretTexts).toContain("h2");
    expect(screen.getByLabelText(/technique/i)).toHaveValue("hammer_on");
  });

  it("ignores technique keyboard shortcuts while typing in a text field", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await typeFret(user, container, 1, 0, "2");
    const lyricInput = container.querySelector(".lyric-token-input") as HTMLInputElement;
    await user.click(lyricInput);
    await user.type(lyricInput, "ha");

    expect(lyricInput).toHaveValue("ha");
    const fretTexts = Array.from(container.querySelectorAll(".tab-fret-cell")).map((el) => el.textContent);
    expect(fretTexts).toContain("2");
    expect(fretTexts).not.toContain("h2");
  });

  it("allows setting a capo fret in the metadata form", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const capoInput = screen.getByLabelText(/capo/i);
    await user.clear(capoInput);
    await user.type(capoInput, "3");
    expect(capoInput).toHaveValue(3);
  });

  it("lets the user choose 1, 2, or 4 bars per line", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);

    await user.click(screen.getByRole("button", { name: "2 bars" }));
    expect(container.querySelectorAll(".bar-break")).toHaveLength(0); // only 1 note, no break yet

    await user.click(screen.getByRole("button", { name: "1 bar" }));
    expect(screen.getByRole("button", { name: "1 bar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a bar-break divider at each bar boundary within a line", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole("button", { name: /\+ add a line/i }));
    await user.click(screen.getByRole("button", { name: "4 bars" }));

    // 16 notes / 4 bars per line = a break every 4th note (at indices 4, 8, 12).
    expect(container.querySelectorAll(".tab-fret-cell.bar-break")).toHaveLength(3 * 5); // 3 breaks x 5 strings
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

  it("supports copying a range of notes (by line + note-in-line) and pasting them elsewhere", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0), createEmptyNote(1)]} />);

    await typeFret(user, container, 1, 0, "1");
    await typeFret(user, container, 1, 1, "2");

    // Both notes are on line 1; copy from note 1 (the default) through note 2.
    await user.selectOptions(screen.getByLabelText("Range end (note in line)"), "Note 2");
    await user.click(screen.getByRole("button", { name: /copy range/i }));
    await user.click(screen.getByRole("button", { name: /paste after selected note/i }));

    const fretCells = container.querySelectorAll(".tab-fret-cell");
    const fretTexts = Array.from(fretCells)
      .map((el) => el.textContent)
      .filter((t) => t !== "" && t !== "-");
    // The 2-note range should now appear twice: [1, 2, 1, 2].
    expect(fretTexts).toEqual(["1", "2", "1", "2"]);
  });

  it("adds a line (16 empty notes) at once via the '+ Add a line' button", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("button", { name: /\+ add a line/i }));
    expect(screen.getAllByRole("option", { name: "Note 16" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("option", { name: "Note 17" })).not.toBeInTheDocument();
  });

  it("removes an entire line via the 'Remove line' button after selecting a note in it", async () => {
    const user = userEvent.setup();
    const notes = Array.from({ length: 17 }, (_, i) => createEmptyNote(i));
    const { container } = render(<Harness initialNotes={notes} />);

    // Select the first note (line 1: notes 1-16) and remove its line.
    const firstCell = container.querySelectorAll(".tab-fret-cell.clickable")[0];
    await user.click(firstCell);
    await user.click(screen.getByRole("button", { name: /remove line/i }));

    // Only the 17th note (now renumbered as note 1, alone on line 1) should remain.
    const lineDropdown = screen.getByLabelText("Range start (line)");
    expect(within(lineDropdown).getAllByRole("option")).toHaveLength(1);
  });

  it("toggles a clawhammer thumb pluck with T or the panel, shown as (0) on the 5th string", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0), createEmptyNote(1)]} />);
    await typeFret(user, container, 3, 0, "2");
    const fifthStringCells = () =>
      Array.from(container.querySelectorAll(".tab-string-row")[4].querySelectorAll(".tab-fret-cell")).map(
        (c) => c.textContent,
      );

    // T does nothing until clawhammer mode is on.
    await user.keyboard("t");
    expect(fifthStringCells()).toEqual(["-", "-"]);

    await user.click(screen.getByLabelText(/clawhammer mode/i));
    await user.keyboard("t");
    expect(fifthStringCells()).toEqual(["(0)", "-"]);

    await user.click(screen.getByLabelText(/then pluck the 5th string/i));
    expect(fifthStringCells()).toEqual(["-", "-"]);
  });

  it("shows a thumb pluck after a note that also plays the 5th string as e.g. '2 (0)'", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);
    await user.click(screen.getByLabelText(/clawhammer mode/i));
    await typeFret(user, container, 5, 0, "2");
    await user.keyboard("t");
    const cell = container.querySelectorAll(".tab-string-row")[4].querySelector(".tab-fret-cell");
    expect(cell).toHaveTextContent("2 (0)");
  });

  it("T works on a blank note (a thumb pluck can follow a rest)", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);
    await user.click(screen.getByLabelText(/clawhammer mode/i));
    await user.click(container.querySelector(".duration-marker") as HTMLElement); // selects the note
    await user.keyboard("t");
    expect(container.querySelectorAll(".thumb-pluck")).toHaveLength(1);
  });

  it("plays the tab, or from the selected note, with the tab's settings", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0), createEmptyNote(1)]} />);
    await user.click(screen.getByRole("button", { name: /^▶ play$/i }));
    expect(enginePlay).toHaveBeenCalledTimes(1);
    const [playedNotes, tuning, tempo, transpose, options] = enginePlay.mock.calls[0];
    expect(playedNotes).toHaveLength(2);
    expect(tuning.key).toBe(FALLBACK_TUNINGS[0].key);
    expect([tempo, transpose]).toEqual([100, 0]);
    expect(options).toEqual({ capoFret: 0, clawhammerTiming: false });

    await user.click(screen.getByRole("button", { name: /stop/i }));
    expect(engineStop).toHaveBeenCalled();

    await typeFret(user, container, 1, 1, "3"); // selects the second note
    await user.click(screen.getByRole("button", { name: /play from selected note/i }));
    expect(enginePlay.mock.calls[1][0]).toHaveLength(1);
  });

  it("typing into a cell that already has a fret replaces it instead of appending", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);
    await typeFret(user, container, 3, 0, "2");

    const cell = container.querySelectorAll(".tab-string-row")[2].querySelector(".tab-fret-cell.clickable")!;
    await user.click(cell);
    await user.keyboard("5{Enter}");
    expect(container.querySelectorAll(".tab-string-row")[2].querySelector(".tab-fret-cell")).toHaveTextContent("5");
  });

  it("shows a technique set with its shortcut while the fret is still being typed", async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness initialNotes={[createEmptyNote(0)]} />);
    const cell = container.querySelectorAll(".tab-string-row")[2].querySelector(".tab-fret-cell.clickable")!;
    await user.click(cell);
    await user.keyboard("2h");

    const input = screen.getByLabelText("Fret for string 3");
    expect(input).toHaveValue("2");
    expect(input.closest(".tab-fret-cell")).toHaveTextContent(/^h$/); // "h" shown beside the input

    await user.keyboard("{Enter}");
    expect(container.querySelectorAll(".tab-string-row")[2].querySelector(".tab-fret-cell")).toHaveTextContent("h2");
  });

  it("plays with the chosen transposition", async () => {
    const user = userEvent.setup();
    render(<Harness initialNotes={[createEmptyNote(0)]} />);
    const slider = screen.getByLabelText(/transpose playback/i);
    // Range inputs can't be typed into; set the value like a drag would.
    fireEvent.change(slider, { target: { value: "2" } });
    expect(screen.getByText(/transpose: \+2 frets/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^▶ play$/i }));
    expect(enginePlay.mock.calls[0][3]).toBe(2);
  });
});
