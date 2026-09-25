/**
 * The Google Play boundary (slice S9a) — the ONE place that decides whether
 * purchase UI may be rendered at all — plus the shell's home link (slice S9d).
 *
 * Why this module exists: the Android app is the published web app inside a
 * Capacitor WebView, and Play policy forbids selling a digital subscription
 * through anything but Play Billing, and forbids steering the user to buy
 * somewhere else. iMechanic ships no Play Billing, so the Android shell simply
 * never offers a purchase: no price, no band, no Upgrade action, no link to
 * buy, no URL. A gated Pro feature still says plainly that it is part of
 * iMechanic Pro. Entitlement is NOT touched — a user who bought on the web
 * keeps full Pro access in the app (`getEntitlement()` is unchanged).
 *
 * HYDRATION (React #418). The app is server-rendered and the server cannot see
 * `window.Capacitor`, so the answer is not available at SSR time. The rule is
 * therefore:
 *
 *   server render + first client render → platform UNKNOWN → purchase UI hidden
 *   after mount (useEffect)             → ios/web → purchase UI allowed
 *                                         android → still hidden
 *
 * Hidden is the default and the safe direction on every platform, so the
 * server HTML and the first client render are identical (no mismatch) and no
 * Buy button can ever flash inside the Android shell. Nothing on the web
 * changes visibly: every purchase surface already renders after mount anyway,
 * because it waits for `useEntitlement()`'s fetch.
 *
 * Detection itself is not duplicated — `nativePlatform()` in `runtime.ts` owns
 * it, and the User-Agent half (`isAndroidShellUserAgent`) is the server-side
 * mirror used by `createCheckoutSession`.
 */
import { useEffect, useState } from "react";
import { nativePlatform, type NativePlatform } from "./runtime";

/**
 * May any purchase UI render? An explicit allow-list, so an unknown platform
 * (including `null` = "not known yet") is refused rather than allowed.
 */
export function canShowPurchaseUi(platform: NativePlatform | null): boolean {
  return platform === "ios" || platform === "web";
}

/**
 * What the platform resolves to once the client can be asked. Separated out
 * from the hook (and exported) so the post-mount half of the decision is
 * unit-testable without a DOM: the effect body is this exact call.
 */
export function platformAfterMount(): NativePlatform {
  return nativePlatform();
}

/**
 * `null` on the server and on the first client render, then the real platform.
 * Never `"web"` by default: `"web"` would mean "a purchase is allowed", and
 * that must not be assumed for an unknown runtime.
 */
export function useDetectedPlatform(): NativePlatform | null {
  const [platform, setPlatform] = useState<NativePlatform | null>(null);
  useEffect(() => {
    setPlatform(platformAfterMount());
  }, []);
  return platform;
}

/**
 * True only once we know we are inside the Android shell — `false` on the
 * server, on the first client render, and in the iOS shell / browser.
 */
export function useIsAndroidShell(): boolean {
  return useDetectedPlatform() === "android";
}

/**
 * The single gate every purchase surface routes through: `false` until the
 * platform is known, and `false` forever in the Android app.
 */
export function useCanShowPurchaseUi(): boolean {
  return canShowPurchaseUi(useDetectedPlatform());
}

/**
 * Where a "home" link points (slice S9d).
 *
 * The purchase boundary above keeps buying out of the Android app, but the
 * marketing page still *carries* the pricing bands — they are public, and they
 * have to be. So a home link tapped inside the Android app must not land on the
 * landing page: it points at the app instead. Everywhere else (browser, PWA,
 * iOS shell) "/" stays "/" and nothing changes.
 *
 * HYDRATION (React #418) — the same rule as the boundary, with the web answer as
 * the pre-mount default. The server cannot see `window.Capacitor`, so:
 *
 *   server render + first client render → platform unknown → "/" (web answer)
 *   after mount (useEffect)             → android → "/app"
 *                                         web/ios → "/" (unchanged)
 *
 * The server HTML and the first client render are therefore byte-identical and
 * no href can ever flash the wrong target in the other direction. A tap landing
 * in the sub-frame window before the effect runs is not a concern: the mount
 * effect runs before a finger can travel.
 *
 * Exported as a pure function so the decision is unit-testable without a DOM;
 * the hook body is exactly this call.
 */
export function shellHomeHref(isAndroidShell: boolean): string {
  return isAndroidShell ? "/app" : "/";
}

/**
 * The hook form: `"/"` on the server, on the first client render, in the browser
 * and in the iOS shell — and `"/app"` once we know we are in the Android app.
 */
export function useShellHomeHref(): string {
  return shellHomeHref(useIsAndroidShell());
}
