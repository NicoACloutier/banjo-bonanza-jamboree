/**
 * Offline support: registers the service worker (see public/sw.js), and
 * pre-fetches tabs so the service worker caches them for use without a
 * connection (e.g. a whole setlist before a jam out of signal).
 */
import { TabsApi } from "./api";

/** Must match API_CACHE in public/sw.js. */
const API_CACHE = "bbj-api-v1";

/** Drop cached API responses (e.g. on logout, so the next user of the device can't see them offline). */
export async function clearCachedApiData(): Promise<void> {
  if (typeof caches !== "undefined") await caches.delete(API_CACHE);
}

/** Register the service worker (production builds only; it would fight Vite's dev server). */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a nice-to-have; the app works without it.
    });
  });
}

/** Whether a service worker is controlling this page, i.e. fetched tabs will be cached. */
export function offlineCachingAvailable(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.serviceWorker?.controller);
}

/**
 * Fetch each tab (and the tuning list) so the service worker caches it.
 * Returns how many tabs were saved; tabs that fail to load are skipped.
 */
export async function saveTabsForOffline(tabIds: string[]): Promise<number> {
  const results = await Promise.allSettled([TabsApi.tunings(), ...tabIds.map((id) => TabsApi.get(id))]);
  return results.slice(1).filter((r) => r.status === "fulfilled").length;
}
