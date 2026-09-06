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
 * S2: the sign-out flow clears this cache client-side — the account screen
 * deletes every cache whose name starts with "imechanic-shell-" and
 * unregisters the worker (src/lib/session.ts, `clientSignOutAndClearCache`),
 * so no cached asset state outlives a session.
 */

/* Cache name is versioned per build (QA defect D9). The registrar registers
 * `/sw.js?v=<build id>` — a new id means a new script URL, so the browser
 * installs a fresh worker, `activate` fires, and the previous build's cache
 * is deleted. A literal name here would never be bumped and unhashed assets
 * (icons, manifest, hero images) would freeze forever on returning devices. */
const BUILD_ID =
  new URL(self.location.href).searchParams.get("v") || "unversioned";
const CACHE = `imechanic-shell-${BUILD_ID}`;

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
      .then((cache) =>
        // {cache: "reload"} bypasses the HTTP cache (QA defect D9): the
        // precache must hold what the server serves NOW, not a possibly
        // stale copy the browser already had.
        cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" }))),
      )
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
