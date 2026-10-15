/**
 * Login page: username/password form + Google sign-in.
 */
import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { GoogleLoginButton } from "../components/GoogleLoginButton";
import { useAuth } from "../hooks/useAuth";
import { ApiRequestError } from "../lib/apiClient";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  // Set by the reset password page after a successful reset.
  const passwordWasReset = Boolean((useLocation().state as { passwordReset?: boolean } | null)?.passwordReset);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1>Log in</h1>
      {passwordWasReset && !error && (
        <p className="success-banner" role="status">
          Your password has been changed. Log in with your new password.
        </p>
      )}
      {error && <p className="error-banner">{error}</p>}
      <form onSubmit={handleSubmit}>
        <label>
          Username
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p>
        <Link to="/forgot-password">Forgot your password?</Link>
      </p>
      <hr />
      <GoogleLoginButton />
    </div>
  );
}
