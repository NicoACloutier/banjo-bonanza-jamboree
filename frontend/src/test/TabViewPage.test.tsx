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
vi.mock("../lib/api", () => ({
  TabsApi: { get: vi.fn(async () => tab), remove: api.remove },
}));
const auth = vi.hoisted(() => ({ current: { user: null as { id: string; username: string; is_admin?: boolean } | null } }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth.current }));
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

afterEach(() => {
  vi.restoreAllMocks();
  api.remove.mockClear();
  auth.current = { user: null };
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
