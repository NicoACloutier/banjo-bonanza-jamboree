import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest, getAccessToken, storeTokens } from "../lib/apiClient";
import { UserProfilePage } from "../pages/UserProfilePage";
import type { TabSummary } from "../types/api";

const users = vi.hoisted(() => ({ get: vi.fn(), tabs: vi.fn() }));
const auth = vi.hoisted(() => ({ current: { user: null as { username: string } | null, loading: false } }));
vi.mock("../lib/api", () => ({ UsersApi: users }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth.current }));

function summary(id: string, status: TabSummary["status"]): TabSummary {
  return {
    id,
    song_name: `Song ${id}`,
    artist: null,
    album: null,
    tuning_key: "standard_g",
    status,
    vote_count: 0,
    owner_username: "earl",
    created_at: "",
    updated_at: "",
    style: null,
    song_key: null,
    difficulty: null,
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.search}</output>;
}

function renderProfile(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/users/earl${search}`]}>
      <Routes>
        <Route path="/users/:username" element={<UserProfilePage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

// 45 drafts (3 pages) and 25 published tabs (2 pages), named like "draft-p2-0".
const TOTALS = { draft: 45, published: 25 } as const;
function listing(_username: string, page: number, pageSize: number, status: TabSummary["status"]) {
  const count = Math.max(0, Math.min(pageSize, TOTALS[status] - (page - 1) * pageSize));
  return Promise.resolve({
    items: Array.from({ length: count }, (_, i) => summary(`${status}-p${page}-${i}`, status)),
    total: TOTALS[status],
    page,
    page_size: pageSize,
  });
}

describe("UserProfilePage", () => {
  beforeEach(() => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    users.get.mockResolvedValue({ id: "u1", username: "earl", created_at: "" });
    users.tabs.mockReset();
    users.tabs.mockImplementation(listing);
  });

  it("gives owners separate drafts and published sections", async () => {
    auth.current = { user: { username: "earl" }, loading: false };
    renderProfile();
    expect(await screen.findByRole("heading", { name: "My Tabs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Drafts" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Song draft-p1-0" })).toHaveAttribute("href", "/tabs/draft-p1-0");
    expect(await screen.findByRole("link", { name: "Song published-p1-0" })).toBeInTheDocument();
    expect(users.tabs).toHaveBeenCalledWith("earl", 1, 20, "draft");
    expect(users.tabs).toHaveBeenCalledWith("earl", 1, 20, "published");
  });

  it("shows other visitors only the published tabs", async () => {
    auth.current = { user: null, loading: false };
    renderProfile();
    expect(await screen.findByRole("heading", { name: "earl's Tabs" })).toBeInTheDocument();
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Drafts" })).not.toBeInTheDocument();
    expect(users.tabs).not.toHaveBeenCalledWith("earl", expect.anything(), expect.anything(), "draft");
  });

  it("pages drafts and published tabs independently", async () => {
    auth.current = { user: { username: "earl" }, loading: false };
    const user = userEvent.setup();
    renderProfile();
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument(); // drafts
    expect(await screen.findByText("Page 1 of 2")).toBeInTheDocument(); // published
    const [drafts, published] = screen.getAllByRole("navigation", { name: "Pages" });

    await user.click(within(drafts).getByRole("button", { name: /next/i }));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Song draft-p2-0" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Song published-p1-0" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("?drafts_page=2");

    await user.click(within(published).getByRole("button", { name: /next/i }));
    expect(await screen.findByRole("link", { name: "Song published-p2-0" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Song draft-p2-0" })).toBeInTheDocument();
    expect(screen.getByTestId("location").textContent).toBe("?drafts_page=2&page=2");
    // Paging published tabs didn't refetch the drafts.
    expect(users.tabs.mock.calls.filter((call) => call[3] === "draft")).toHaveLength(2);
  });

  it("opens each section at the page in the URL", async () => {
    auth.current = { user: { username: "earl" }, loading: false };
    renderProfile("?drafts_page=3&page=2");
    expect(await screen.findByRole("link", { name: "Song draft-p3-0" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Song published-p2-0" })).toBeInTheDocument();
  });
});

describe("apiRequest with a rejected token", () => {
  const fetchMock = vi.fn();
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    storeTokens({ access_token: "old-access", refresh_token: "old-refresh", token_type: "bearer" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const authHeader = (call: number) =>
    (fetchMock.mock.calls[call][1] as RequestInit).headers as Record<string, string>;

  it("refreshes the token and retries with the new one", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: "expired" }))
      .mockResolvedValueOnce(json(200, { access_token: "new-access", refresh_token: "new-refresh", token_type: "bearer" }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiRequest("/api/tabs/d")).resolves.toEqual({ ok: true });
    expect(authHeader(2).Authorization).toBe("Bearer new-access");
  });

  it("drops dead tokens and retries anonymously when the refresh fails", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { detail: "expired" }))
      .mockResolvedValueOnce(json(401, { detail: "bad refresh" }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(apiRequest("/api/users/earl/tabs")).resolves.toEqual({ ok: true });
    expect(authHeader(2).Authorization).toBeUndefined();
    expect(getAccessToken()).toBeNull();
  });
});
