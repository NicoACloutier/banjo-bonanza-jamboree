import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabLibraryActions } from "../components/TabLibraryActions";
import { HomePage } from "../pages/HomePage";
import type { TabDetail, TabSummary } from "../types/api";

const api = vi.hoisted(() => ({
  search: vi.fn(),
  favorite: vi.fn(),
  fork: vi.fn(),
}));
vi.mock("../lib/api", () => ({
  TabsApi: { search: api.search, favorite: api.favorite, fork: api.fork },
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
});
