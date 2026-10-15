/**
 * Offline support: registers the service worker (see public/sw.js), which
 * keeps the tabs you've opened available without a connection.
 */

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
