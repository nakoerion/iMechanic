/**
 * S9a — Google Play payments compliance: the purchase boundary.
 *
 * Play policy forbids selling (or steering to a purchase of) a digital
 * subscription through anything but Play Billing, and iMechanic ships no Play
 * Billing. So the Android shell must never render a purchase entry point, while
 * entitlement itself stays exactly as it was — a user who bought on the web
 * keeps full Pro access in the app.
 *
 * Pure unit tests, no DOM: the DOM-visible half of the contract is the exported
 * logic below (`canShowPurchaseUi`, `isAndroidShellUserAgent`,
 * `platformAfterMount`) plus the React SSR pass, which needs no DOM either. The
 * React-19-correct way to mount the hook client-side would be
 * `@testing-library/react` or `react-dom/test-utils` via `act()`; neither is a
 * dependency of this repo and adding one to test a three-line `useState`/
 * `useEffect` wrapper is not worth the install. The hook body is exactly
 * `platformAfterMount()`, so the exported function IS the logic under test, and
 * the SSR test below covers the other half of the hydration contract (server
 * render → hidden).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import {
  canShowPurchaseUi,
  platformAfterMount,
  shellHomeHref,
  useCanShowPurchaseUi,
  useIsAndroidShell,
  useShellHomeHref,
} from "../src/native/android-shell";
import {
  ANDROID_SHELL_USER_AGENT,
  isAndroidShellUserAgent,
  nativePlatform,
  type NativePlatform,
} from "../src/native/runtime";

const g = globalThis as unknown as Record<string, unknown>;

/** The same shape `runtime.ts` reads off the Capacitor-injected global. */
function setCapacitor(value: unknown) {
  Object.defineProperty(g, "Capacitor", {
    value,
    configurable: true,
    writable: true,
    enumerable: true,
  });
}

beforeEach(() => {
  delete g.Capacitor;
});

afterEach(() => {
  delete g.Capacitor;
});

describe("canShowPurchaseUi — an allow-list, so unknown is refused", () => {
  it("refuses `null` (the platform is not known yet — server + first render)", () => {
    expect(canShowPurchaseUi(null)).toBe(false);
  });

  it("allows the two platforms that may sell: the browser and the iOS shell", () => {
    expect(canShowPurchaseUi("web")).toBe(true);
    expect(canShowPurchaseUi("ios")).toBe(true);
  });

  it("refuses the Android shell — no Play Billing exists, so there is nothing to offer", () => {
    expect(canShowPurchaseUi("android")).toBe(false);
  });

  it("refuses anything that is not an allowed platform, rather than defaulting to allowed", () => {
    for (const value of ["", "Android", "ANDROID", "native", "desktop", "webview"]) {
      expect(canShowPurchaseUi(value as unknown as NativePlatform), value).toBe(
        false,
      );
    }
    expect(canShowPurchaseUi(undefined as unknown as NativePlatform)).toBe(false);
    expect(canShowPurchaseUi(0 as unknown as NativePlatform)).toBe(false);
  });
});

describe("isAndroidShellUserAgent — the server-side mirror of the boundary", () => {
  it("recognises the token the shell appends", () => {
    expect(ANDROID_SHELL_USER_AGENT).toBe("iMechanicAndroid");
    expect(isAndroidShellUserAgent(ANDROID_SHELL_USER_AGENT)).toBe(true);
  });

  it("recognises it embedded in a real WebView User-Agent, in any case", () => {
    const real = `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 ${ANDROID_SHELL_USER_AGENT}`;
    expect(isAndroidShellUserAgent(real)).toBe(true);
    expect(isAndroidShellUserAgent("imechanicandroid")).toBe(true);
    expect(isAndroidShellUserAgent("IMEchanicANDROID")).toBe(true);
    expect(
      isAndroidShellUserAgent("prefix-iMechanicAndroid-suffix"),
    ).toBe(true);
  });

  it("treats a missing User-Agent header as 'not the Android app'", () => {
    expect(isAndroidShellUserAgent(null)).toBe(false);
    expect(isAndroidShellUserAgent(undefined)).toBe(false);
    expect(isAndroidShellUserAgent("")).toBe(false);
  });

  it("does not mistake a plain browser, or Android in general, for the shell app", () => {
    expect(
      isAndroidShellUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isAndroidShellUserAgent(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isAndroidShellUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"),
    ).toBe(false);
  });

  it("reads the header the way the checkout handler does", () => {
    /* `createCheckoutSession` calls `getRequestHeaders().get("user-agent")` and
       hands the result straight to this function; a `Headers` instance is the
       same accessor path, so the refusal is proven against a real header read
       rather than a hand-passed string. */
    const shell = new Headers({
      "user-agent": `Mozilla/5.0 (Linux; Android 14) ${ANDROID_SHELL_USER_AGENT}`,
    });
    const browser = new Headers({ "user-agent": "Mozilla/5.0 (Linux; Android 14)" });
    expect(isAndroidShellUserAgent(shell.get("user-agent"))).toBe(true);
    expect(isAndroidShellUserAgent(browser.get("user-agent"))).toBe(false);
    expect(isAndroidShellUserAgent(new Headers().get("user-agent"))).toBe(false);
  });
});

describe("platformAfterMount — the post-mount half of the decision", () => {
  it("resolves to 'android' inside the Android shell, so purchase UI stays hidden", () => {
    setCapacitor({ getPlatform: () => "android" });
    expect(nativePlatform()).toBe("android");
    expect(platformAfterMount()).toBe("android");
    expect(canShowPurchaseUi(platformAfterMount())).toBe(false);
  });

  it("resolves to 'ios' inside the iOS shell, where a purchase is allowed", () => {
    setCapacitor({ getPlatform: () => "ios", isNativePlatform: () => true });
    expect(platformAfterMount()).toBe("ios");
    expect(canShowPurchaseUi(platformAfterMount())).toBe(true);
  });

  it("resolves to 'web' when Capacitor is absent (browser, PWA and server)", () => {
    expect(platformAfterMount()).toBe("web");
    expect(canShowPurchaseUi(platformAfterMount())).toBe(true);
  });

  it("falls back to 'web' for an injected runtime it does not recognise", () => {
    setCapacitor({ getPlatform: () => "windows" });
    expect(platformAfterMount()).toBe("web");
  });
});

describe("hydration contract — the server render never shows a purchase surface", () => {
  /**
   * Minimal stand-ins for the real surfaces: each renders a different word for
   * "purchase UI may show" vs. "it may not" so the SSR output is the assertion.
   */
  function PurchaseProbe() {
    return createElement(
      "span",
      null,
      useCanShowPurchaseUi() ? "purchase" : "hidden",
    );
  }
  function AndroidProbe() {
    return createElement("span", null, String(useIsAndroidShell()));
  }

  it("hides purchase UI on the server even when the shell is asking (Capacitor present)", () => {
    /* The server cannot see `window.Capacitor`, and a first client render must
       match the server HTML — so the answer before mount is hidden on every
       platform. This is the React #418 fix: no Buy button may flash. */
    setCapacitor({ getPlatform: () => "android" });
    expect(renderToString(createElement(PurchaseProbe))).toContain("hidden");
    expect(renderToString(createElement(PurchaseProbe))).not.toContain(
      "purchase",
    );
  });

  it("hides purchase UI on the server in a browser too (identical first render)", () => {
    expect(renderToString(createElement(PurchaseProbe))).toContain("hidden");
  });

  it("never claims 'inside the Android shell' before mount", () => {
    setCapacitor({ getPlatform: () => "android" });
    expect(renderToString(createElement(AndroidProbe))).toContain("false");
  });
});

describe("config drift — the shell token and the server token must be the same string", () => {
  it("capacitor.config.ts appends exactly the token the server refuses", () => {
    /* If these ever drift, the shell would tag its requests with a token the
       server does not recognise and the refusal would silently stop firing —
       the one failure mode this pair cannot be allowed to have. */
    const config = readFileSync(
      new URL("../capacitor.config.ts", import.meta.url),
      "utf8",
    );
    expect(config).toContain(`appendUserAgent: "${ANDROID_SHELL_USER_AGENT}"`);
    const androidBlock = config.slice(config.indexOf("android: {"));
    expect(androidBlock).toContain("appendUserAgent");
  });
});

describe("S9d — the Android shell's home link never reaches the marketing page", () => {
  it("routes to /app only when the platform is known to be android", () => {
    expect(shellHomeHref(true)).toBe("/app");
  });

  it("keeps the web answer for the browser, the iOS shell and the server", () => {
    /* `false` is what `useIsAndroidShell()` returns on the server, on the first
       client render, in a browser and in the iOS shell — so all four get "/". */
    expect(shellHomeHref(false)).toBe("/");
  });

  it("is never '/app' before mount, even when the shell is asking — no hydration mismatch", () => {
    /* The React #418 contract: the server cannot see `window.Capacitor`, and the
       first client render has to match the server HTML. So even with Capacitor
       injected as Android, the pre-mount render is the web answer. The Android
       shell re-renders to "/app" after the effect; nothing renders "/app" into
       the server HTML. */
    setCapacitor({ getPlatform: () => "android" });
    function HomeLinkProbe() {
      return createElement("a", { href: useShellHomeHref() }, "home");
    }
    const html = renderToString(createElement(HomeLinkProbe));
    expect(html).toContain('href="/"');
    expect(html).not.toContain("/app");
  });

  it("no component ships a hard-coded link to the landing page", () => {
    /* A regression guard, in the same spirit as the token-drift test above: if
       someone re-adds `href="/"` to either spot, the Android shell silently
       regains a route to the pricing bands. The two files that had one are the
       legal-page brand mark and the 404's "Go to the homepage". */
    for (const file of [
      "../src/routes/__root.tsx",
      "../src/components/legal/legal-page.tsx",
    ]) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toContain('href="/"');
      expect(source, file).toContain("useShellHomeHref");
    }
  });
});
