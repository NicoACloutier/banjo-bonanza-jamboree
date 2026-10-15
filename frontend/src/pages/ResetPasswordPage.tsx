/**
 * Choose a new password, from the link in a password reset email
 * (/reset-password?token=...). The token is taken out of the address bar as
 * soon as the page loads, so it doesn't linger in history.
 */
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AuthApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.has("token")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirmation) {
      setError("The passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      await AuthApi.confirmPasswordReset(token, password);
      navigate("/login", { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't reset your password.");
      // The only other 400 is a too-short password, which is checked above.
      setExpired(err instanceof ApiRequestError && err.status === 400);
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="panel" style={{ maxWidth: 420, margin: "0 auto" }}>
        <h1>Choose a new password</h1>
        <p className="error-banner">This page needs the link from a password reset email.</p>
        <Link to="/forgot-password">Ask for a reset link</Link>
      </div>
    );
  }

  return (
    <div className="panel" style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1>Choose a new password</h1>
      {error && (
        <p className="error-banner">
          {error} {expired && <Link to="/forgot-password">Ask for a new link</Link>}
        </p>
      )}
      <form onSubmit={handleSubmit}>
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <label>
          Confirm new password
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Saving..." : "Set new password"}
        </button>
      </form>
      <p className="muted-text">Changing your password logs you out on every device.</p>
    </div>
  );
}
