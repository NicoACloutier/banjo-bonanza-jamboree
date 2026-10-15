import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyEmailBanner } from "../components/VerifyEmailBanner";
import { VoteButton } from "../components/VoteButton";
import { ApiRequestError } from "../lib/apiClient";
import { VerifyEmailPage } from "../pages/VerifyEmailPage";

const authApi = vi.hoisted(() => ({ verifyEmail: vi.fn(), resendVerification: vi.fn() }));
vi.mock("../lib/api", () => ({ AuthApi: authApi }));

type FakeUser = { username: string; email: string; email_verified: boolean };
const auth = vi.hoisted(() => ({ current: { user: null as FakeUser | null, refreshUser: vi.fn(async () => undefined) } }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => auth.current }));

const unverified: FakeUser = { username: "earl", email: "earl@example.com", email_verified: false };

beforeEach(() => {
  Object.values(authApi).forEach((fn) => fn.mockReset());
  auth.current.refreshUser.mockClear();
  auth.current.user = null;
});

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

describe("VerifyEmailBanner", () => {
  it("reminds unverified users, and resends the link", async () => {
    auth.current.user = unverified;
    authApi.resendVerification.mockResolvedValue(undefined);
    render(<VerifyEmailBanner />);
    expect(screen.getByText(/we sent a link to/i)).toHaveTextContent("earl@example.com");
    await userEvent.setup().click(screen.getByRole("button", { name: /resend link/i }));
    expect(authApi.resendVerification).toHaveBeenCalled();
    expect(await screen.findByText(/sent!/i)).toBeInTheDocument();
  });

  it("shows resend errors, like the rate limit", async () => {
    auth.current.user = unverified;
    authApi.resendVerification.mockRejectedValue(new ApiRequestError(429, "Too many verification emails."));
    render(<VerifyEmailBanner />);
    await userEvent.setup().click(screen.getByRole("button", { name: /resend link/i }));
    expect(await screen.findByText(/too many verification emails/i)).toBeInTheDocument();
  });

  it("isn't shown to verified or logged-out users", () => {
    const { container, rerender } = render(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
    auth.current.user = { ...unverified, email_verified: true };
    rerender(<VerifyEmailBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("VerifyEmailPage", () => {
  function renderAt(path: string) {
    return render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
  }

  it("verifies the link's token once, hides it, and refreshes the user", async () => {
    auth.current.user = unverified;
    authApi.verifyEmail.mockResolvedValue(undefined);
    renderAt("/verify-email?token=abc123");
    expect(await screen.findByText(/your email address is verified/i)).toBeInTheDocument();
    expect(authApi.verifyEmail).toHaveBeenCalledTimes(1);
    expect(authApi.verifyEmail).toHaveBeenCalledWith("abc123");
    expect(auth.current.refreshUser).toHaveBeenCalled();
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/verify-email$/);
  });

  it("offers a new link when this one has expired", async () => {
    auth.current.user = unverified;
    authApi.verifyEmail.mockRejectedValue(
      new ApiRequestError(400, "This verification link is invalid or has expired. Log in to get a new one."),
    );
    renderAt("/verify-email?token=old");
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /resend link/i })).toBeInTheDocument();
  });

  it("asks logged-out visitors with a bad link to log in", async () => {
    authApi.verifyEmail.mockRejectedValue(new ApiRequestError(400, "This verification link is invalid or has expired."));
    renderAt("/verify-email?token=old");
    expect(await screen.findByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
  });

  it("explains when opened without a link", () => {
    renderAt("/verify-email");
    expect(screen.getByText(/needs the link from a verification email/i)).toBeInTheDocument();
    expect(authApi.verifyEmail).not.toHaveBeenCalled();
  });
});

describe("VoteButton", () => {
  it("asks unverified users to verify before voting", () => {
    auth.current.user = unverified;
    render(<VoteButton voteCount={3} hasVoted={false} onVote={vi.fn()} />);
    expect(screen.getByText(/verify your email to vote/i)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("lets verified users vote", () => {
    auth.current.user = { ...unverified, email_verified: true };
    render(<VoteButton voteCount={3} hasVoted={false} onVote={vi.fn()} />);
    expect(screen.getByRole("button", { name: /3/ })).toBeInTheDocument();
  });
});
