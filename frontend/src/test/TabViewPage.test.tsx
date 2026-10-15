import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabViewPage } from "../pages/TabViewPage";
import type { TabDetail } from "../types/api";

const tab: TabDetail = {
  id: "t1",
  song_name: "Cripple Creek",
  artist: null,
  album: null,
  tuning_key: "standard_g",
  tempo_bpm: 100,
  capo_fret: 0,
  bars_per_line: 4,
  clawhammer_timing: false,
  status: "published",
  vote_count: 0,
  owner_id: "u1",
  owner_username: "earl",
  has_voted: false,
  is_favorited: false,
  forked_from: null,
  created_at: "",
  updated_at: "",
  notes: [],
  time_signature: "4/4",
  swing: false,
  fifth_string_capo_fret: null,
  style: null,
  song_key: null,
  difficulty: null,
};

const api = vi.hoisted(() => ({ remove: vi.fn(async () => undefined) }));
// Tests can swap in a tab with notes.
const shown = vi.hoisted(() => ({ tab: null as TabDetail | null }));
vi.mock("../lib/api", () => ({
  TabsApi: { get: vi.fn(async () => shown.tab ?? tab), remove: api.remove },
}));
const auth = vi.hoisted(() => ({ current: { user: null as { id: string; username: string; is_admin?: boolean } | null } }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth.current }));
// No Web Audio in the test environment.
const engine = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../lib/playbackEngine", () => ({
  TabPlaybackEngine: class {
    play = engine.play;
    stop = vi.fn();
    dispose = vi.fn();
  },
}));
vi.mock("../lib/metronome", () => ({
  Metronome: class {
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));

afterEach(() => {
  vi.restoreAllMocks();
  api.remove.mockClear();
  engine.play.mockClear();
  auth.current = { user: null };
  shown.tab = null;
});

describe("TabViewPage auto-scroll", () => {
  it("stops auto-scrolling when the user leaves the page mid-playback", async () => {
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/tabs/t1"]}>
        <Link to="/">Browse</Link>
        <Routes>
          <Route path="/tabs/:tabId" element={<TabViewPage />} />
          <Route path="/" element={<p>Home</p>} />
        </Routes>
      </MemoryRouter>,
    );

    // Auto-scroll is off by default; turn it on.
    const autoScroll = await screen.findByRole("checkbox", { name: /auto-scroll/i });
    expect(autoScroll).not.toBeChecked();
    await user.click(autoScroll);
    await user.click(screen.getByRole("button", { name: /play/i }));
    await waitFor(() => expect(scrollBy).toHaveBeenCalled(), { timeout: 1000 });

    await user.click(screen.getByRole("link", { name: "Browse" }));
    expect(await screen.findByText("Home")).toBeInTheDocument();
    const callsWhenLeaving = scrollBy.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 600)); // three scroll intervals
    expect(scrollBy.mock.calls.length).toBe(callsWhenLeaving);
  });
});

describe("TabViewPage deleting", () => {
  function renderAt() {
    return render(
      <MemoryRouter initialEntries={["/tabs/t1"]}>
        <Routes>
          <Route path="/tabs/:tabId" element={<TabViewPage />} />
          <Route path="/users/:username" element={<p>Profile page</p>} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("lets the owner delete the tab after confirming, then shows their tabs", async () => {
    auth.current = { user: { id: "u1", username: "earl" } };
    const user = userEvent.setup();
    renderAt();

    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.getByText(/delete this tab\? this can't be undone/i)).toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /yes, delete/i }));
    expect(api.remove).toHaveBeenCalledWith("t1");
    expect(await screen.findByText("Profile page")).toBeInTheDocument();
  });

  it("can be cancelled", async () => {
    auth.current = { user: { id: "u1", username: "earl" } };
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/delete this tab\?/i)).not.toBeInTheDocument();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it("isn't offered to other users", async () => {
    auth.current = { user: { id: "someone-else", username: "ralph", is_admin: false } };
    renderAt();
    await screen.findByRole("heading", { name: "Cripple Creek" });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("lets admins delete someone else's tab, but not edit it", async () => {
    auth.current = { user: { id: "admin", username: "mod", is_admin: true } };
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.getByText(/delete earl's tab as an admin\?/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /yes, delete/i }));
    expect(api.remove).toHaveBeenCalledWith("t1");
    expect(await screen.findByText("Profile page")).toBeInTheDocument();
  });
});

describe("TabViewPage loop section", () => {
  // Six quarter notes on the 3rd string, at frets 1-6 (so each cell's text is unique).
  const notes = Array.from({ length: 6 }, (_, i) => ({
    id: `n${i}`,
    position: i,
    duration_beats: 1,
    line_break: false,
    lyric: null,
    is_rest: false,
    thumb_after: false,
    dotted: false,
    triplet: false,
    tied: false,
    chord: null,
    frets: [
      {
        string_number: 3,
        fret: i + 1,
        technique: "normal" as const,
        slide_to_fret: null,
        bend_semitones: null,
        right_hand_finger: null,
      },
    ],
  }));
  const cell = (fret: number) =>
    screen.getAllByText(String(fret)).find((el) => el.classList.contains("tab-fret-cell")) as HTMLElement;

  function renderTab() {
    shown.tab = { ...tab, notes };
    return render(
      <MemoryRouter initialEntries={["/tabs/t1"]}>
        <Routes>
          <Route path="/tabs/:tabId" element={<TabViewPage />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it("is picked by clicking the first and last notes, then loops just those", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole("checkbox", { name: /loop section/i }));
    expect(screen.getByText(/click the first note of the section/i)).toBeInTheDocument();

    await user.click(cell(5));
    expect(screen.getByText(/now click the last note/i)).toBeInTheDocument();
    await user.click(cell(2)); // before the first click: the section still runs in tab order
    expect(screen.getByText("Looping 4 notes: line 1, note 2 to line 1, note 5.")).toBeInTheDocument();
    expect([1, 2, 3, 4, 5, 6].map((fret) => cell(fret).classList.contains("highlighted"))).toEqual([
      false, true, true, true, true, false,
    ]);

    await user.click(screen.getByRole("button", { name: /play/i }));
    expect(engine.play.mock.calls[0][4].loop).toEqual({ startPosition: 1, endPosition: 4 });
  });

  it("starts a new section on a third click, and can be cleared", async () => {
    const user = userEvent.setup();
    renderTab();
    await user.click(await screen.findByRole("checkbox", { name: /loop section/i }));
    await user.click(cell(1));
    await user.click(cell(3));
    await user.click(cell(6));
    expect(screen.getByText(/now click the last note/i)).toBeInTheDocument();
    expect(cell(6)).toHaveClass("highlighted");
    expect(cell(1)).not.toHaveClass("highlighted");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText(/click the first note of the section/i)).toBeInTheDocument();
  });

  it("plays the whole tab when the loop is off or unfinished, and notes aren't clickable", async () => {
    const user = userEvent.setup();
    renderTab();
    const loopToggle = await screen.findByRole("checkbox", { name: /loop section/i });
    await user.click(cell(2)); // loop off: clicking does nothing
    await user.click(loopToggle);
    expect(cell(2)).not.toHaveClass("highlighted");
    await user.click(cell(2)); // only the first note picked
    await user.click(screen.getByRole("button", { name: /play/i }));
    expect(engine.play.mock.calls[0][4].loop).toBeUndefined();
  });
});
