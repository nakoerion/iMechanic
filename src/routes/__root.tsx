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
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/icon-192.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap",
      },
      {
        rel: "icon",
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23f59e0b' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'/%3E%3C/svg%3E",
      },
    ],
  }),
  notFoundComponent: () => <div>Page not found</div>,
  component: RootComponent,
});

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

    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((err) => {
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