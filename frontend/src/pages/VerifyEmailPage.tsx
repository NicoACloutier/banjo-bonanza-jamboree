/**
 * Opened from the link in the verification email (/verify-email?token=...):
 * verifies the address straight away. Works whether or not you're logged in
 * on this browser. The token is taken out of the address bar at once.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ResendVerificationButton } from "../components/VerifyEmailBanner";
import { useAuth } from "../hooks/useAuth";
import { AuthApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";

export function VerifyEmailPage() {
  const { user, refreshUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [result, setResult] = useState<"verifying" | "verified" | "failed">(token ? "verifying" : "failed");
  const [error, setError] = useState("This page needs the link from a verification email.");
  const started = useRef(false);

  useEffect(() => {
    if (searchParams.has("token")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    // Once only (React's development mode runs effects twice, and a link works once).
    if (!token || started.current) return;
    started.current = true;
    AuthApi.verifyEmail(token)
      .then(async () => {
        setResult("verified");
        await refreshUser();
      })
      .catch((err) => {
        setError(err instanceof ApiRequestError ? err.message : "Couldn't verify your email.");
        setResult("failed");
      });
  }, [token, refreshUser]);

  return (
    <div className="panel" style={{ maxWidth: 480, margin: "0 auto" }}>
      <h1>Verify your email</h1>
      {result === "verifying" && <p>Verifying...</p>}
      {result === "verified" && (
        <>
          <p className="success-banner" role="status">
            Your email address is verified. You can now post tabs and vote.
          </p>
          {user ? <Link to="/tabs/new">Create a tab</Link> : <Link to="/login">Log in</Link>}
        </>
      )}
      {result === "failed" && (
        <>
          <p className="error-banner">{error}</p>
          {user && !user.email_verified ? (
            <p>
              <ResendVerificationButton />
            </p>
          ) : (
            !user && (
              <p>
                <Link to="/login">Log in</Link> to get a new link.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
