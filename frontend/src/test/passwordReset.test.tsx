import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../lib/apiClient";
import { ForgotPasswordPage } from "../pages/ForgotPasswordPage";
import { LoginPage } from "../pages/LoginPage";
import { ResetPasswordPage } from "../pages/ResetPasswordPage";

const authApi = vi.hoisted(() => ({ requestPasswordReset: vi.fn(), confirmPasswordReset: vi.fn() }));
vi.mock("../lib/api", () => ({ AuthApi: authApi }));
vi.mock("../hooks/useAuth", () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock("../components/GoogleLoginButton", () => ({ GoogleLoginButton: () => null }));

beforeEach(() => Object.values(authApi).forEach((fn) => fn.mockReset()));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname + location.search}</output>;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("forgot password", () => {
  it("is linked from the login page", () => {
    renderAt("/login");
    expect(screen.getByRole("link", { name: /forgot your password/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("asks for a link and gives the same answer either way", async () => {
    authApi.requestPasswordReset.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderAt("/forgot-password");
    await user.type(screen.getByLabelText(/email/i), "earl@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(authApi.requestPasswordReset).toHaveBeenCalledWith("earl@example.com");
    expect(await screen.findByText(/if an account uses/i)).toHaveTextContent("earl@example.com");
  });

  it("shows rate limit errors", async () => {
    authApi.requestPasswordReset.mockRejectedValue(new ApiRequestError(429, "Too many password reset requests."));
    const user = userEvent.setup();
    renderAt("/forgot-password");
    await user.type(screen.getByLabelText(/email/i), "earl@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));
    expect(await screen.findByText("Too many password reset requests.")).toBeInTheDocument();
  });
});

describe("reset password", () => {
  async function fill(password: string, confirmation = password) {
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^new password/i), password);
    await user.type(screen.getByLabelText(/confirm new password/i), confirmation);
    await user.click(screen.getByRole("button", { name: /set new password/i }));
  }

  it("takes the token out of the address, sets the password, and goes to login", async () => {
    authApi.confirmPasswordReset.mockResolvedValue(undefined);
    renderAt("/reset-password?token=abc123");
    expect(screen.getByTestId("location")).toHaveTextContent(/^\/reset-password$/);
    await fill("N3wBanj0Passw0rd");
    expect(authApi.confirmPasswordReset).toHaveBeenCalledWith("abc123", "N3wBanj0Passw0rd");
    expect(await screen.findByText(/your password has been changed/i)).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/login");
  });

  it("checks the passwords before sending them", async () => {
    renderAt("/reset-password?token=abc123");
    await fill("short");
    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument();
    await fill("N3wBanj0Passw0rd", "Different123");
    expect(screen.getByText(/don't match/i)).toBeInTheDocument();
    expect(authApi.confirmPasswordReset).not.toHaveBeenCalled();
  });

  it("offers a new link when this one has expired", async () => {
    authApi.confirmPasswordReset.mockRejectedValue(
      new ApiRequestError(400, "This reset link is invalid or has expired. Ask for a new one."),
    );
    renderAt("/reset-password?token=old");
    await fill("N3wBanj0Passw0rd");
    expect(await screen.findByText(/invalid or has expired/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ask for a new link/i })).toHaveAttribute("href", "/forgot-password");
  });

  it("explains when opened without a link", () => {
    renderAt("/reset-password");
    expect(screen.getByText(/needs the link from a password reset email/i)).toBeInTheDocument();
  });
});
