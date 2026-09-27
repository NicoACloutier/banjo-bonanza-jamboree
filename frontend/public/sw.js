/*
 * Service worker: makes the app usable offline (e.g. at a jam with no signal).
 *
 * - The app shell (HTML, JS/CSS bundles, icons) is cached as it's loaded,
 *   and page navigations fall back to the cached shell when offline.
 * - Read-only API responses for tabs, setlists and favorites are cached
 *   network-first: always fresh when online, the last copy when offline.
 *   (Saving a setlist for offline just fetches each of its tabs through here.)
 * - Everything else (auth, writes) goes straight to the network.
 *
 * Bump SHELL_CACHE/API_CACHE when changing caching behaviour.
 */
const SHELL_CACHE = "bbj-shell-v1";
const API_CACHE = "bbj-api-v1";
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icon.svg", "/icon-192.png"];
// API paths whose GET responses are worth keeping for offline use.
const CACHED_API_PATHS = [/^\/api\/tabs(\/|$)/, /^\/api\/setlists(\/|$)/, /^\/api\/me\/favorites$/];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL_CACHE, API_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(fallbackUrl ?? request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Page loads: the SPA shell ("/" serves index.html for every route).
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/"));
    return;
  }
  // The API may live on another origin (VITE_API_BASE_URL), so match by path.
  if (CACHED_API_PATHS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(networkFirst(request, API_CACHE));
    return;
  }
  // Same-origin static files: hashed bundles never change, so cache-first is safe.
  if (url.origin === self.location.origin && !url.pathname.startsWith("/api/")) {
    event.respondWith(cacheFirst(request));
  }
});
