/**
 * Stripe client — Slice S6a.
 *
 * IMPORTANT — module-boundary contract (same rule as `db.ts` / `auth-core.ts`):
 * this module carries the Stripe Node SDK, so it must only ever be imported
 * from server code — inside a `createServerFn()` handler body, inside
 * `src/routes/api/*`, or from the `scripts/` ensure routine. It is never
 * imported statically by a route component; server functions import it
 * dynamically so the client bundle never links it.
 *
 * The secret key comes from `process.env.STRIPE_SECRET_KEY` (owner secrets in
 * Settings → Secrets; never committed, never read in the browser). The handle
 * is resolved lazily on first use, so the site still builds and serves before
 * Stripe is connected — an honest error only surfaces if a payment path is
 * actually reached without a key. That mirrors `src/db.ts`.
 */

import Stripe from "stripe";

/** The raw secret key, or null when Stripe is not connected yet. */
export function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key && key.length > 0 ? key : null;
}

/** True when a secret key is present. Never reveals the key itself. */
export function isStripeConfigured(): boolean {
  return stripeSecretKey() !== null;
}

let cached: Stripe | null = null;

/**
 * The Stripe client. Throws an honest, actionable error when no key is
 * connected — callers that need a graceful degradation (an "unavailable"
 * card, a "not configured yet" webhook response) must check
 * `isStripeConfigured()` first rather than catching this.
 *
 * No `apiVersion` is pinned: the account's default version is used, which
 * keeps the sandbox and the live account consistent. Reads are written
 * version-tolerantly (see `subscriptionInputFromStripeSubscription`).
 */
export function stripeClient(): Stripe {
  const key = stripeSecretKey();
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set — connect the Stripe account before taking payments."
    );
  }
  if (!cached) {
    cached = new Stripe(key, {
      appInfo: { name: "iMechanic", version: "1.0.0" },
      maxNetworkRetries: 2,
      timeout: 20_000,
    });
  }
  return cached;
}
