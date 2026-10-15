import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={["/users/earl"]}>
      <Routes>
        <Route path="/users/:username" element={<UserProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("UserProfilePage drafts", () => {
  beforeEach(() => {
    users.get.mockResolvedValue({ id: "u1", username: "earl", created_at: "" });
    users.tabs.mockResolvedValue({
      items: [summary("d", "draft"), summary("p", "published")],
      total: 2,
      page: 1,
      page_size: 50,
    });
  });

  it("gives owners a drafts section linking to each draft", async () => {
    auth.current = { user: { username: "earl" }, loading: false };
    renderProfile();
    expect(await screen.findByRole("heading", { name: "My Tabs" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Drafts" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Song d" })).toHaveAttribute("href", "/tabs/d");
    expect(screen.getByRole("link", { name: "Song p" })).toBeInTheDocument();
  });

  it("shows other visitors only the published tabs", async () => {
    auth.current = { user: null, loading: false };
    renderProfile();
    expect(await screen.findByRole("heading", { name: "earl's Tabs" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Drafts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Song d" })).not.toBeInTheDocument();
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
