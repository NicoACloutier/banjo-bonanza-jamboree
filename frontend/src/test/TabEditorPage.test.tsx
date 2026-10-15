import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabEditorPage } from "../pages/TabEditorPage";

const auth = vi.hoisted(() => ({
  current: {
    user: null as { username: string; email: string; email_verified: boolean } | null,
    loading: false,
  },
}));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth.current }));
vi.mock("../lib/api", () => ({
  TabsApi: { tunings: vi.fn(() => new Promise(() => {})) },
  AuthApi: { resendVerification: vi.fn(async () => undefined) },
}));
// No Web Audio in the test environment.
vi.mock("../lib/playbackEngine", () => ({
  TabPlaybackEngine: class {
    play = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
  },
}));

beforeEach(() => {
  auth.current = { user: null, loading: false };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <TabEditorPage />
    </MemoryRouter>,
  );
}

describe("TabEditorPage", () => {
  it("asks logged-out visitors to log in instead of showing the editor", () => {
    renderPage();
    expect(screen.getByText(/you need an account to create and edit tabs/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: /register/i })).toHaveAttribute("href", "/register");
    expect(screen.queryByRole("button", { name: /publish/i })).not.toBeInTheDocument();
  });

  it("shows the editor, with draft and publish, to logged-in users", () => {
    auth.current = { user: { username: "earl", email: "earl@example.com", email_verified: true }, loading: false };
    renderPage();
    expect(screen.getByRole("button", { name: /save draft/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /publish/i })).toBeInTheDocument();
  });

  it("asks users to verify their email before creating tabs", () => {
    auth.current = { user: { username: "earl", email: "earl@example.com", email_verified: false }, loading: false };
    renderPage();
    expect(screen.getByText(/verify your email to create and edit tabs/i)).toHaveTextContent("earl@example.com");
    expect(screen.getByRole("button", { name: /resend link/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).not.toBeInTheDocument();
  });
});
