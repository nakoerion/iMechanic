/**
 * Native-runtime detection (slice S7). Client-side ONLY.
 *
 * The web app runs in three places: a normal browser (desktop + mobile PWA),
 * the Capacitor iOS shell and the Capacitor Android shell. iOS Safari has no
 * Web Bluetooth, so on iPhone a real OBD2 adapter can only be reached through
 * the app's own native BLE bridge — this module is how the app knows which
 * world it is in.
 *
 * It deliberately reads the runtime injected by Capacitor
 * (`window.Capacitor`, present in every Capacitor WebView) instead of
 * importing `@capacitor/core` at module scope:
 *
 *  - it stays synchronous, so `browserCapabilities()` can report the native
 *    transport in the same call that reports Web Bluetooth / Web Serial;
 *  - it is safe on the server (`typeof window === "undefined"` → web), so an
 *    SSR render never touches it;
 *  - the web bundle never pays for Capacitor unless the bridge is actually
 *    used (`loadBleBridge()` imports it lazily).
 *
 * Nothing here throws: an unrecognised runtime is simply "web", and every
 * later decision is made by the honest error from `ble-bridge.ts`.
 */

export type NativePlatform = "ios" | "android" | "web";

/** The slice of the injected `window.Capacitor` object this module relies on. */
type InjectedCapacitor = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  isPluginAvailable?: (name: string) => boolean;
};

function injectedCapacitor(): InjectedCapacitor | null {
  if (typeof globalThis === "undefined") return null;
  const holder = globalThis as { Capacitor?: InjectedCapacitor };
  return holder.Capacitor ?? null;
}

/** `"ios" | "android"` inside a native shell, `"web"` everywhere else. */
export function nativePlatform(): NativePlatform {
  const platform = injectedCapacitor()?.getPlatform?.();
  if (platform === "ios" || platform === "android") return platform;
  return "web";
}

/**
 * True only inside the iOS/Android shell. A plain browser, the PWA, and the
 * server all report `false` — the native path is never offered where it
 * cannot work.
 */
export function isNativeRuntime(): boolean {
  const capacitor = injectedCapacitor();
  if (!capacitor) return false;
  if (typeof capacitor.isNativePlatform === "function") {
    try {
      return capacitor.isNativePlatform() === true;
    } catch {
      return false;
    }
  }
  return nativePlatform() !== "web";
}

/**
 * The User-Agent token the Android shell appends to every request it makes
 * (`appendUserAgent` in `capacitor.config.ts`, slice S9a).
 *
 * It exists because the Android WebView is the one client that must not show a
 * purchase entry point (Google Play forbids selling a digital subscription
 * through anything but Play Billing), and a client-side check alone is not
 * defence in depth: the server has to be able to recognise the app too.
 */
export const ANDROID_SHELL_USER_AGENT = "iMechanicAndroid";

/**
 * Does this User-Agent belong to the Android shell? Deliberately pure and
 * server-safe — unlike the rest of this module it never touches `window`, so
 * `src/server/pro.ts` can use it to refuse a purchase that the app itself
 * cannot legally offer. Case-insensitive, and `null`/`undefined` (no
 * User-Agent header at all) is simply "not the Android app".
 */
export function isAndroidShellUserAgent(
  userAgent: string | null | undefined,
): boolean {
  if (typeof userAgent !== "string") return false;
  return userAgent
    .toLowerCase()
    .includes(ANDROID_SHELL_USER_AGENT.toLowerCase());
}

/**
 * Is the `iMechanicBle` plugin registered in this shell? Optimistic when the
 * runtime does not expose the check — a missing plugin then fails with a
 * clear "not implemented" error from the bridge rather than being silently
 * treated as unsupported.
 */
export function isBlePluginAvailable(): boolean {
  if (!isNativeRuntime()) return false;
  const check = injectedCapacitor()?.isPluginAvailable;
  if (typeof check !== "function") return true;
  try {
    return check("iMechanicBle") === true;
  } catch {
    return true;
  }
}
