/**
 * Client-side session helpers (browser bundle safe).
 *
 * `clientSignOutAndClearCache` is the full sign-out: it wipes every service
 * worker cache whose name starts with `imechanic-shell-` (the `TODO(S2)` in
 * public/sw.js — no cached asset state may outlive a session), unregisters
 * the worker, then calls the server `signOut` to delete the session row and
 * clear the cookie. Cache steps are best-effort: even if they fail, the
 * server session still dies.
 */
import { signOut } from "../server/auth";

export async function clientSignOutAndClearCache(): Promise<void> {
  if (typeof window !== "undefined" && "caches" in window) {
    try {
      const keys = await window.caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("imechanic-shell-"))
          .map((k) => window.caches.delete(k)),
      );
    } catch {
      /* best-effort — the session must still die */
    }
  }
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      /* best-effort */
    }
  }
  await signOut();
}