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

vi.mock("../lib/api", () => ({ TabsApi: { get: vi.fn(async () => tab) } }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ user: null }) }));
// No Web Audio in the test environment.
vi.mock("../lib/playbackEngine", () => ({
  TabPlaybackEngine: class {
    play = vi.fn();
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

afterEach(() => vi.restoreAllMocks());

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

    await user.click(await screen.findByRole("button", { name: /play/i }));
    await waitFor(() => expect(scrollBy).toHaveBeenCalled(), { timeout: 1000 });

    await user.click(screen.getByRole("link", { name: "Browse" }));
    expect(await screen.findByText("Home")).toBeInTheDocument();
    const callsWhenLeaving = scrollBy.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 600)); // three scroll intervals
    expect(scrollBy.mock.calls.length).toBe(callsWhenLeaving);
  });
});
