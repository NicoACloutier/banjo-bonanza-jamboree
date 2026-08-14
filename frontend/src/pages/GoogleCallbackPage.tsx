/**
 * Handles the redirect back from Google's OAuth2 consent screen: reads the
 * `code` query param and exchanges it for our own JWTs via AuthContext.
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ApiRequestError } from "../lib/apiClient";

export function GoogleCallbackPage() {
  const [searchParams] = useSearchParams();
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("No authorization code was returned by Google.");
      return;
    }
    loginWithGoogle(code)
      .then(() => navigate("/"))
      .catch((err) => setError(err instanceof ApiRequestError ? err.message : "Google sign-in failed."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="panel">
      <h1>Signing in with Google...</h1>
      {error && <p className="error-banner">{error}</p>}
    </div>
  );
}
