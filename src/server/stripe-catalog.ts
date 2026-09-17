/**
 * Stripe catalogue config — Slice S6a.
 *
 * This is the one place the Stripe object ids live. They are ids, never
 * amounts: every price amount is created from `PRICE_BANDS` in
 * `src/lib/market.ts` (the single source of truth) by the idempotent ensure
 * routine in `src/server/stripe-ensure.ts`, runnable with
 * `bun run stripe:ensure`. Nothing in the app hard-codes a price, and no
 * amount is ever stored here or in the database (the `subscriptions` table
 * stores WHICH band, not how much).
 *
 * The ids below were created in the sandbox by that routine. They are not
 * secrets (a price id is public — it appears in hosted checkout URLs), but
 * they are environment-specific: the sandbox ids differ from the live ones,
 * so when the owner connects the live Stripe account the ensure routine is
 * run against it and its output pasted here.
 *
 * A missing/placeholder id is never guessed: `priceIdForBand()` returns null
 * and checkout fails loudly with "not configured yet" rather than charging
 * the wrong price.
 */

/** The three band ids are owned by `PRICE_BANDS` in `src/lib/market.ts`. */
export type BandId = "a" | "b" | "c";

/** Marker so an un-run ensure routine can never look like a real id. */
const NOT_CONFIGURED = "NOT_CONFIGURED";

/** Stripe product that all three band prices hang off. */
export const STRIPE_PRODUCT_ID = "prod_VHIrXSpHFehb4l";

/** band id → Stripe recurring annual price id. */
export const STRIPE_PRICE_IDS: Record<BandId, string> = {
  a: "price_1UGkG61sse5lyQAYSanAj0G3",
  b: "price_1UGkG61sse5lyQAYnSNmWwf5",
  c: "price_1UGkG71sse5lyQAYvbX5SY3Q",
};

/** All three band ids, in market.ts order. */
export const BAND_IDS: BandId[] = ["a", "b", "c"];

export function isBandId(value: unknown): value is BandId {
  return typeof value === "string" && (BAND_IDS as string[]).includes(value);
}

/** Stripe price id for a band, or null when the catalogue is not filled in. */
export function priceIdForBand(bandId: BandId): string | null {
  const id = STRIPE_PRICE_IDS[bandId];
  return id && id !== NOT_CONFIGURED ? id : null;
}

/**
 * Reverse lookup used by the webhook: a Stripe price id → our band id.
 * Unknown ids (a price created by hand in the dashboard, a legacy price, or
 * a not-yet-refreshed catalogue) return null and the subscription is stored
 * with `price_band` null rather than being attributed to a band we cannot
 * prove.
 */
export function bandIdForPriceId(priceId: string | null | undefined): BandId | null {
  if (!priceId) return null;
  for (const bandId of BAND_IDS) {
    if (STRIPE_PRICE_IDS[bandId] === priceId) return bandId;
  }
  return null;
}

/** The ensure routine's product name — also the idempotency key for it. */
export const STRIPE_PRODUCT_NAME = "iMechanic Pro";
export const PRODUCT_METADATA_KEY = "imechanic_product";
export const PRODUCT_METADATA_VALUE = "pro";
export const BAND_METADATA_KEY = "imechanic_band";
