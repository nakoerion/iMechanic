/* iMechanic service worker — caches the app shell for offline use.
 *
 * Deliberately conservative:
 *  - Never caches anything that isn't a same-origin GET.
 *  - Never caches API/server-function responses (POST, /api/*, /_server/*, and
 *    GET requests carrying `?data=` — TanStack Start's server-fn transport).
 *  - NAVIGATION RESPONSES ARE NEVER CACHED (QA defect D1). After S2 they will
 *    be SSR'd authenticated HTML; writing them to a cache that is not
 *    partitioned by user would serve one user's pages to the next person on
 *    the browser profile. Navigations go to the network; when that fails, the
 *    static precached /offline.html is the only fallback.
 *  - Static assets (JS/CSS/img/font) are cache-first with network fill.
 *
 * TODO(S2): the sign-out flow MUST clear this cache — call
 * `caches.delete("imechanic-shell-v1")` (and ideally unregister + re-register)
 * from the sign-out handler so no cached asset state outlives a session.
 */
const CACHE = "imechanic-shell-v1";

/* Only genuinely static, user-independent files. Never precache an SSR'd
 * route here — at install time it could capture user-specific HTML. */
const PRECACHE = [
  "./offline.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never cache POSTs / server functions
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/_server") ||
    url.search.includes("data=")
  ) {
    return; // never cache server-function or API traffic
  }

  if (req.mode === "navigate") {
    // Network only — navigation responses are NEVER written to the cache
    // (see D1 note above). The static offline shell is the sole fallback.
    event.respondWith(
      fetch(req).catch(() => caches.match("./offline.html")),
    );
    return;
  }

  // Static assets: cache-first with network fill.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, clone));
          }
          return res;
        }),
    ),
  );
});
