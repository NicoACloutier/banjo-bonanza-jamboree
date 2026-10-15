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

describe("HomePage pagination", () => {
  const page = (n: number, total: number) => ({
    items: Array.from({ length: Math.min(20, total - (n - 1) * 20) }, (_, i) => summary(`p${n}-${i}`)),
    total,
    page: n,
    page_size: 20,
  });

  it("pages through results, keeping the page in the URL", async () => {
    window.scrollTo = vi.fn();
    api.search.mockImplementation(async (_filters, n: number) => page(n, 45));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/?style=clawhammer"]}>
        <HomePage />
        <LocationProbe />
      </MemoryRouter>,
    );
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(api.search).toHaveBeenLastCalledWith({ style: "clawhammer" }, 2, 20);
    expect(screen.getByTestId("location")).toHaveTextContent("page=2");

    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText("Page 3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();

    // Changing a filter goes back to the first page.
    await user.selectOptions(screen.getByLabelText(/difficulty/i), "beginner");
    await waitFor(() =>
      expect(api.search).toHaveBeenLastCalledWith({ style: "clawhammer", difficulty: "beginner" }, 1, 20),
    );
    expect(screen.getByTestId("location")).not.toHaveTextContent("page=");
  });

  it("hides the controls when everything fits on one page", async () => {
    api.search.mockResolvedValue(page(1, 3));
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    );
    await screen.findByText("Song p1-0");
    expect(screen.queryByRole("navigation", { name: "Pages" })).not.toBeInTheDocument();
  });

  it("offers a way back from a page past the end", async () => {
    api.search.mockImplementation(async (_filters, n: number) =>
      n === 1 ? page(1, 3) : { ...page(1, 3), items: [], page: n },
    );
    window.scrollTo = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/?page=9"]}>
        <HomePage />
      </MemoryRouter>,
    );
    await user.click(await screen.findByRole("button", { name: /go to the first page/i }));
    expect(await screen.findByText("Song p1-0")).toBeInTheDocument();
    expect(api.search).toHaveBeenLastCalledWith({}, 1, 20);
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
