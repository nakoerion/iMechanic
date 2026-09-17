// Production server for the built site. The TanStack Start build emits a portable
// fetch handler (dist/server/server.js) plus static client assets (dist/client);
// this wraps them in a Bun server on port 3000 — static files first, SSR for the
// rest. Run `bun run build` before starting. Restart it with `bun run publish`.
//
// Starting a new instance supersedes the old one: it frees the port no matter
// which user owns the current server (provisioning starts it as `engine`; a team
// member's `bun run publish` runs as their own user), so publish never collides
// with an already-running server. Every sandbox user has passwordless sudo, so
// the takeover works across user boundaries.
import handler from "./dist/server/server.js";

/* Bun's runtime globals are not part of the TS DOM lib. Rather than pull in
 * `@types/bun` (whose global set would then be applied to the WHOLE program
 * alongside `vite/client` + DOM, and could clash with them), the small surface
 * this file actually uses is declared here. These are type-only declarations:
 * the runtime behaviour of `import.meta.dir`, `Bun.$`, `Bun.serve`,
 * `Bun.file` and `Bun.sleep` is untouched. This file is the dev/prod server
 * (`bun run serve.ts`), not part of `vite build`. */
declare global {
  interface ImportMeta {
    /** Absolute directory of this module (Bun-specific). */
    dir: string;
  }
}
declare const Bun: {
  $(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): { quiet(): { nothrow(): Promise<unknown> } };
  sleep(ms: number): Promise<void>;
  file(path: string): Blob & { exists(): Promise<boolean> };
  serve(options: {
    port: number;
    hostname: string;
    fetch: (req: Request) => Response | Promise<Response>;
  }): unknown;
};

// Pinned, NOT read from the environment. The published preview URL
// (<label>.<PUBLIC_SITE_DOMAIN>) is reverse-proxied to 0.0.0.0:3000 inside the
// sandbox, so the default site MUST bind there. Bun auto-loads .env files, so
// honouring process.env.PORT/HOST would let a stray env var or a .env in the site
// dir silently move the site off :3000 (or onto loopback) and break the public URL.
const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

/* Cache-Control per path (QA defect D10):
 *  - /sw.js and the manifest must NEVER be cached: the service worker is the
 *    escape hatch for unsticking users — if the browser caches it, the escape
 *    hatch is itself stuck. `no-cache` forces revalidation on every check.
 *  - Vite-hashed /assets/* are content-addressed, so they are immutable.
 *  - Everything else (icons, hero images, fonts — stable but not hashed)
 *    gets a modest hour with revalidation. */
function cacheControlFor(pathname: string): string {
  if (pathname === "/sw.js" || pathname === "/manifest.webmanifest") {
    return "no-cache";
  }
  if (pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600, must-revalidate";
}

// Free PORT regardless of which user owns the current listener. lsof runs under
// sudo so it can see (and the kill can signal) a process owned by another user;
// the loop waits for the socket to actually release before we bind.
const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

// Take over the port, re-freeing and retrying if another publish grabbed it in the
// gap between freeing and binding (last publish wins). Bun.serve throws EADDRINUSE
// synchronously, so without this a raced publish would die while the shell already
// reported success.
for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);
        if (pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + pathname);
          if (await file.exists()) {
            return new Response(file, {
              headers: { "Cache-Control": cacheControlFor(pathname) },
            });
          }
        }
        return (handler as { fetch: (r: Request) => Response | Promise<Response> }).fetch(req);
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`team-site serving on http://${HOST}:${String(PORT)}`);
