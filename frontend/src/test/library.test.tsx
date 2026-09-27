import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabLibraryActions } from "../components/TabLibraryActions";
import { HomePage } from "../pages/HomePage";
import { SetlistPage } from "../pages/SetlistPage";
import type { SetlistDetail, TabDetail, TabSummary } from "../types/api";

const api = vi.hoisted(() => ({
  search: vi.fn(),
  favorite: vi.fn(),
  fork: vi.fn(),
  setlists: vi.fn(),
  setlist: vi.fn(),
  addToSetlist: vi.fn(),
  updateSetlist: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  TabsApi: { search: api.search, favorite: api.favorite, fork: api.fork },
  LibraryApi: {
    setlists: api.setlists,
    setlist: api.setlist,
    addToSetlist: api.addToSetlist,
    updateSetlist: api.updateSetlist,
  },
}));

beforeEach(() => Object.values(api).forEach((fn) => fn.mockReset()));

function summary(id: string, overrides: Partial<TabSummary> = {}): TabSummary {
  return {
    id,
    song_name: `Song ${id}`,
    artist: null,
    album: null,
    tuning_key: "standard_g",
    status: "published",
    vote_count: 0,
    owner_username: "earl",
    created_at: "",
    updated_at: "",
    style: null,
    song_key: null,
    difficulty: null,
    ...overrides,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

describe("HomePage filters", () => {
  it("searches with the chosen filters, keeps them in the URL, and shows tags", async () => {
    api.search.mockResolvedValue({
      items: [summary("a", { style: "clawhammer", song_key: "D", difficulty: "beginner" })],
      total: 1,
      page: 1,
      page_size: 20,
    });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/?style=clawhammer"]}>
        <HomePage />
        <LocationProbe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(api.search).toHaveBeenCalledWith({ style: "clawhammer" }, 1, 20));
    expect(await screen.findByText("Key of D", { selector: ".tag" })).toBeInTheDocument();
    expect(screen.getByText("Beginner", { selector: ".tag" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/difficulty/i), "beginner");
    await waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith({ style: "clawhammer", difficulty: "beginner" }, 1, 20),
    );
    expect(screen.getByTestId("location")).toHaveTextContent("difficulty=beginner");
  });
});

describe("TabLibraryActions", () => {
  const tab = { id: "t1", is_favorited: false } as TabDetail;

  it("toggles the favorite", async () => {
    api.setlists.mockResolvedValue([]);
    api.favorite.mockResolvedValue({ tab_id: "t1", is_favorited: true });
    const onFavoriteChange = vi.fn();
    render(
      <MemoryRouter>
        <TabLibraryActions tab={tab} onFavoriteChange={onFavoriteChange} />
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /favorite/i }));
    expect(api.favorite).toHaveBeenCalledWith("t1");
    expect(onFavoriteChange).toHaveBeenCalledWith(true);
  });

  it("forks into a draft and opens it in the editor", async () => {
    api.setlists.mockResolvedValue([]);
    api.fork.mockResolvedValue({ id: "fork1" });
    render(
      <MemoryRouter>
        <TabLibraryActions tab={tab} onFavoriteChange={vi.fn()} />
        <LocationProbe />
      </MemoryRouter>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: /fork/i }));
    await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/tabs/fork1/edit"));
  });

  it("adds the tab to a chosen setlist", async () => {
    api.setlists.mockResolvedValue([
      { id: "s1", name: "Friday", tab_count: 0, updated_at: "" },
      { id: "s2", name: "Gig", tab_count: 3, updated_at: "" },
    ]);
    api.addToSetlist.mockResolvedValue({ id: "s2", name: "Gig", updated_at: "", tabs: [] });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TabLibraryActions tab={tab} onFavoriteChange={vi.fn()} />
      </MemoryRouter>,
    );
    await user.selectOptions(await screen.findByLabelText("Setlist"), "s2");
    await user.click(screen.getByRole("button", { name: /add to setlist/i }));
    expect(api.addToSetlist).toHaveBeenCalledWith("s2", "t1");
    expect(await screen.findByText('Added to "Gig".')).toBeInTheDocument();
  });

  it("links to making a setlist when there are none", async () => {
    api.setlists.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <TabLibraryActions tab={tab} onFavoriteChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("link", { name: /make a setlist/i })).toHaveAttribute("href", "/setlists");
  });
});

describe("SetlistPage", () => {
  const setlist: SetlistDetail = { id: "s1", name: "Jam", updated_at: "", tabs: [summary("a"), summary("b"), summary("c")] };

  const renderPage = () =>
    render(
      <MemoryRouter initialEntries={["/setlists/s1"]}>
        <Routes>
          <Route path="/setlists/:setlistId" element={<SetlistPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it("reorders and removes tabs", async () => {
    api.setlist.mockResolvedValue(setlist);
    api.updateSetlist.mockImplementation(async (_id: string, name: string, tabIds: string[]) => ({
      ...setlist,
      name,
      tabs: tabIds.map((id) => summary(id)),
    }));
    const user = userEvent.setup();
    renderPage();

    const moveDown = await screen.findAllByRole("button", { name: "Move down" });
    await user.click(moveDown[0]);
    expect(api.updateSetlist).toHaveBeenLastCalledWith("s1", "Jam", ["b", "a", "c"]);

    await user.click(screen.getAllByRole("button", { name: "Remove from setlist" })[2]);
    expect(api.updateSetlist).toHaveBeenLastCalledWith("s1", "Jam", ["b", "a"]);
    expect(screen.getAllByRole("link", { name: /^Song / }).map((a) => a.textContent)).toEqual(["Song b", "Song a"]);
  });

  it("can't move the first tab up or the last tab down", async () => {
    api.setlist.mockResolvedValue(setlist);
    renderPage();
    expect((await screen.findAllByRole("button", { name: "Move up" }))[0]).toBeDisabled();
    expect(screen.getAllByRole("button", { name: "Move down" })[2]).toBeDisabled();
  });
});
