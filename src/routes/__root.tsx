import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { themeInitScript } from "~/lib/theme";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "iMechanic — From fault code to completed repair",
      },
      {
        name: "description",
        content:
          "iMechanic takes you from a check-engine light to a completed, affordable repair: AI root-cause diagnosis, an honest severity verdict, and a DIY-vs-workshop cost decision. Reading codes and clearing them is free, always.",
      },
      /* Navy chrome in the light theme; the dark app background in the dark
         theme, so the installed PWA's system bars match what's on screen. */
      {
        name: "theme-color",
        media: "(prefers-color-scheme: light)",
        content: "#0b1220",
      },
      {
        name: "theme-color",
        media: "(prefers-color-scheme: dark)",
        content: "#070d18",
      },
      { property: "og:title", content: "iMechanic — From fault code to completed repair" },
      {
        property: "og:description",
        content:
          "AI root-cause diagnosis, an honest severity verdict, a DIY-vs-workshop cost decision, and step-by-step guided repairs. Reading codes and clearing them is free, always.",
      },
      { property: "og:type", content: "website" },
      /* iOS home-screen installs (QA defect D16): without these an
         iPhone install opens in Safari chrome instead of standalone.
         `black-translucent` lets our navy pt-safe header own the
         status-bar area. `mobile-web-app-capable` is the modern
         cross-platform equivalent. */
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "iMechanic" },
    ],
    links: [
      /* Inter is self-hosted (QA defect D15) — never link fonts from a
         Google domain; the @font-face rules live in app.css. */
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      /* Opaque 180x180 — iOS composites transparency onto black (D16). */
      { rel: "apple-touch-icon", sizes: "180x180", href: "/icons/apple-touch-icon.png" },
      {
        rel: "icon",
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'/%3E%3C/svg%3E",
      },
    ],
  }),
  notFoundComponent: NotFound,
  component: RootComponent,
});

/** Styled 404 (QA defect D21). Plain statement of fact, a way back in —
 *  no chrome, so it works for both marketing and app URLs. */
function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-app-bg px-6 text-center text-fg">
      <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        404
      </p>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
        This page doesn't exist
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-fg-muted">
        The address may be mistyped, or the page may have moved. Nothing you
        saved is affected.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <a
          href="/app"
          className="rounded-control bg-navy-950 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-900"
        >
          Open the app
        </a>
        <a
          href="/"
          className="rounded-control border border-line-strong px-5 py-3 text-sm font-semibold text-fg transition-colors hover:bg-neutral-fill"
        >
          Go to the homepage
        </a>
      </div>
    </main>
  );
}

function RootComponent() {
  return (
    <RootDocument>
      <ServiceWorkerRegistrar />
      <Outlet />
    </RootDocument>
  );
}

/** Registers the app-shell service worker. Client-only, never blocks render.
 *
 * Gated on the production build (QA defect D8) — "is HTTPS" was the wrong
 * gate: the working/dev site is also HTTPS, so the SW installed there and
 * served stale cache-first assets during development. In dev we additionally
 * unregister any SW left behind by an earlier build and drop its caches. */
function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!import.meta.env.PROD) {
      // Clean up any stale registration from before this gate existed.
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      return;
    }

    /* The build id is stamped into the SW URL (QA defect D9): sw.js derives
       its cache name from `?v=`, so every deploy re-installs the worker,
       `activate` fires, and stale caches from previous builds are deleted.
       Without this the literal cache name froze unhashed assets forever. */
    const register = () => {
      navigator.serviceWorker
        .register(`/sw.js?v=${__BUILD_ID__}`, { scope: "/" })
        .catch((err) => {
          console.warn("[iMechanic] service worker registration failed:", err);
        });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Applies the stored theme before first paint — no flash of the
            wrong theme when someone opens the app at night. Must stay inline
            and blocking; do not move it into a module. */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}