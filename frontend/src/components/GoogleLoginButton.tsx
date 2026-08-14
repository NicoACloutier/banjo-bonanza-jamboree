/**
 * Google OAuth2 "sign in" button using the standard authorization-code
 * redirect flow: we send the user to Google's consent screen, and Google
 * redirects back to our `/auth/google/callback` route with a `code` query
 * param, which `GoogleCallbackPage` exchanges for our own JWTs.
 */
const GOOGLE_CLIENT_ID: string = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
const GOOGLE_REDIRECT_URI: string = import.meta.env.VITE_GOOGLE_REDIRECT_URI ?? "";

export function GoogleLoginButton() {
  const disabled = !GOOGLE_CLIENT_ID || !GOOGLE_REDIRECT_URI;

  const handleClick = () => {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      access_type: "online",
      prompt: "select_account",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  };

  return (
    <button type="button" className="secondary" onClick={handleClick} disabled={disabled}>
      {disabled ? "Google sign-in not configured" : "Sign in with Google"}
    </button>
  );
}
