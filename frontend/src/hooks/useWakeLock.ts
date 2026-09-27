/**
 * Keeps the screen from sleeping while `enabled` (e.g. reading a tab on a
 * phone on a music stand), using the Screen Wake Lock API where available.
 * Browsers drop the lock when the page is hidden, so it's re-acquired when
 * the page becomes visible again.
 */
import { useEffect } from "react";

export const wakeLockSupported = typeof navigator !== "undefined" && "wakeLock" in navigator;

export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !wakeLockSupported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) void lock.release();
        else sentinel = lock;
      } catch {
        // Denied (e.g. low battery, or the page isn't visible): nothing to do.
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release();
    };
  }, [enabled]);
}
