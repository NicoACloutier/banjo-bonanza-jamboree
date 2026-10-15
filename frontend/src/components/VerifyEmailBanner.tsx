/**
 * Reminds a logged-in user who hasn't verified their email address yet to
 * open the link we sent, with a button to send it again. Until they do,
 * they can't post (create tabs, vote or fork).
 */
import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { AuthApi } from "../lib/api";
import { ApiRequestError } from "../lib/apiClient";

/** "Resend link" button, which then reports whether it worked. */
export function ResendVerificationButton() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") return <span>Sent! It can take a minute to arrive.</span>;
  return (
    <>
      <button
        type="button"
        className="link-button"
        disabled={state === "sending"}
        onClick={async () => {
          setState("sending");
          setError(null);
          try {
            await AuthApi.resendVerification();
            setState("sent");
          } catch (err) {
            setError(err instanceof ApiRequestError ? err.message : "Couldn't send the link.");
            setState("idle");
          }
        }}
      >
        {state === "sending" ? "Sending..." : "Resend link"}
      </button>
      {error && <span> {error}</span>}
    </>
  );
}

export function VerifyEmailBanner() {
  const { user } = useAuth();
  if (!user || user.email_verified) return null;
  return (
    <p className="info-banner" role="status">
      Check your email: we sent a link to <strong>{user.email}</strong> to confirm your address. Until you open it,
      you can browse and save favorites but not post tabs or vote. <ResendVerificationButton />
    </p>
  );
}
