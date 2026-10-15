/**
 * Forgot password: ask for a reset link by email. The reply is the same
 * whether or not the address has an account (so it can't be used to find
 * out who's registered).
 */
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { AuthApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await AuthApi.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't send the reset link.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="panel" style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1>Reset your password</h1>
      {sent ? (
        <>
          <p role="status">
            If an account uses <strong>{email}</strong>, we've emailed it a link to choose a new password. The link
            works for an hour.
          </p>
          <p className="muted-text">Nothing arrived? Check your spam folder, or try again in a few minutes.</p>
          <Link to="/login">Back to log in</Link>
        </>
      ) : (
        <>
          <p>Enter the email address you registered with, and we'll send you a link to choose a new password.</p>
          {error && <p className="error-banner">{error}</p>}
          <form onSubmit={handleSubmit}>
            <label>
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <button type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send reset link"}
            </button>
          </form>
          <p>
            <Link to="/login">Back to log in</Link>
          </p>
        </>
      )}
    </div>
  );
}
