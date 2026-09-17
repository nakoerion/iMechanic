/**
 * Pro server functions — Slice S6a (backend only; S6b gates the UI on these).
 *
 * Thin RPC stubs, same bundle-boundary rule as `auth.ts`: only
 * `createServerFn` and the client-safe `market.ts` are imported statically.
 * Everything that carries the Stripe SDK, `node:*` builtins or the DB handle
 * is loaded with a DYNAMIC import inside the handler, so the client bundle
 * never links it.
 */
import { createServerFn } from "@tanstack/react-start";
import { PRICE_BANDS } from "../lib/market";
import type { BandId } from "./stripe-catalog";

export type { BandId };

/** True when a Stripe secret key is present — a boolean, never the key. */
function stripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(key && key.length > 0);
}

/**
 * True when the configured key is a Stripe TEST key. Added in S6b because the
 * upgrade screen has to be honest about whether pressing Upgrade can take a real
 * payment: with a test key the checkout page is Stripe's test checkout and no
 * money moves, and the UI says exactly that. Anything unrecognised — including
 * a live key — reports false, so the app never claims "test mode" it cannot
 * prove. The key itself is never returned, only this boolean.
 */
function stripeTestMode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim() ?? "";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return false;
  return key.includes("_test_");
}

/**
 * Start a Stripe Checkout Session (subscription mode) for one of the three
 * annual bands and return the hosted URL for the client to redirect to.
 *
 * Honest failure modes, in order:
 *  - no session → "Sign in to upgrade."
 *  - unknown band id → rejected by the validator
 *  - no Stripe key → "payments are not configured yet"
 *  - catalogue not filled in for that band → "checkout is not configured yet"
 * No price is ever hard-coded here; the Stripe price created from
 * `PRICE_BANDS` is looked up by band id.
 */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const bandId = (input as { bandId?: unknown } | null)?.bandId;
    const known = PRICE_BANDS.some((band) => band.id === bandId);
    if (!known) {
      throw new Error("That plan is not available.");
    }
    return { bandId: bandId as BandId };
  })
  .handler(async ({ data: { bandId } }) => {
    if (!stripeConfigured()) {
      throw new Error("Pro checkout is not configured yet.");
    }
    const { createCheckoutSessionCore } = await import("./pro-checkout");
    return createCheckoutSessionCore(bandId);
  });

/**
 * Entitlement for the current session, for S6b to consume. Never throws: a
 * signed-out visitor is simply not Pro. Also reports whether Stripe is
 * connected, so the UI can say "not configured yet" instead of offering a
 * button that cannot work.
 */
export const getEntitlement = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getEntitlementCore } = await import("./pro-core");
    const entitlement = await getEntitlementCore();
    return {
      ...entitlement,
      stripeConfigured: stripeConfigured(),
      /* S6b added this field (additive — S6a's fields are unchanged) so the
         upgrade UI can say "test mode, no card is charged" only when that is
         actually true. */
      stripeTestMode: stripeTestMode(),
    };
  }
);
