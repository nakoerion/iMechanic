import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config (slice S7 — native wrappers, build artifacts only).
 *
 * iMechanic ships one codebase across three surfaces: the marketing site, the
 * mobile-first PWA at `/app`, and these native iOS/Android shells. The shells
 * are not cosmetic: **iOS Safari has no Web Bluetooth**, so a real OBD2
 * adapter on an iPhone can only be reached through the app's own native BLE
 * bridge (`iMechanicBle`, see `ios/`, `android/` and `native/README.md`).
 *
 * Two things to know before you build:
 *
 * 1. **`server.url` is set on purpose.** The web app is server-rendered
 *    (TanStack Start server functions, session cookies, waitlist writes), so
 *    the shell loads the deployed origin rather than a locally bundled copy.
 *    `webDir` still points at the prepared web assets so `cap copy`/`cap sync`
 *    have something to bundle and the offline path has a real page to show.
 *    Override the origin without editing this file with `CAPACITOR_SERVER_URL`
 *    (e.g. to point a shell at the working site while testing).
 *
 * 2. **`appId` is a PLACEHOLDER.** `app.imechanic` must be confirmed by the
 *    owner before any store submission — it is the permanent bundle
 *    identifier and cannot be changed after the first release. Store
 *    submission itself is a later owner step (Apple Developer + Google Play
 *    accounts), not part of this slice.
 */

/** The deployed web app the shell loads. */
const DEFAULT_SERVER_URL = "https://www.imechanic.app";

/** Read a build-time override without pulling Node types into the site tsconfig. */
function envValue(name: string): string | undefined {
  const g = globalThis as {
    process?: { env?: Record<string, string | undefined> };
  };
  const value = g.process?.env?.[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

const serverUrl = envValue("CAPACITOR_SERVER_URL") ?? DEFAULT_SERVER_URL;

const config: CapacitorConfig = {
  /**
   * PLACEHOLDER — owner must confirm before store submission. Changing it
   * after the first App Store / Play release means shipping a new app.
   */
  appId: "app.imechanic",
  appName: "iMechanic",
  /** Prepared by `bun run native:prepare` (copies the built web assets). */
  webDir: "native/www",
  /** Native shell backdrop; matches the published dark theme-color. */
  backgroundColor: "#070d18",
  server: {
    /** The deployed, server-rendered app. See note 1 above. */
    url: serverUrl,
    /** Never allow plaintext traffic — the app is HTTPS-only. */
    cleartext: false,
    androidScheme: "https",
    /** Shown when the origin above cannot be reached — honest, not blank. */
    errorPath: "offline.html",
  },
  ios: {
    /**
     * The app draws its own safe-area padding, so let the WebView scroll under
     * the notch instead of UIKit insetting every screen.
     */
    contentInset: "never",
    backgroundColor: "#070d18",
  },
  android: {
    backgroundColor: "#070d18",
    allowMixedContent: false,
  },
  plugins: {
    /**
     * The native BLE bridge is a *local* plugin compiled into each app target,
     * so it needs no npm install — but it must be discoverable by name for the
     * JS `registerPlugin("iMechanicBle")` call to resolve.
     */
    IMechanicBle: {
      /** Give the radio a moment before we report that nothing answered. */
      scanTimeoutMs: 12_000,
      /** ELM327 clones answer in well under a second; 8s is a lost link. */
      commandTimeoutMs: 8_000,
      /**
       * How long the native bridge waits for the adapter's Bluetooth link to
       * open (Swift/Kotlin default 15s). Declared here so the values the
       * native plugins actually read are all visible in one place — see
       * APP_NOTES ("scanTimeoutMs / commandTimeoutMs / connectTimeoutMs").
       */
      connectTimeoutMs: 15_000,
      /**
       * How long the bridge waits for the user to answer the iOS Bluetooth
       * permission prompt before reporting honestly that it is still
       * unanswered (Swift default 20s). The system dialog stays on screen.
       */
      permissionTimeoutMs: 20_000,
    },
  },
};

export default config;
