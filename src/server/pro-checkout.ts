/**
 * Checkout session core — Slice S6a.
 *
 * Server-only: it touches the Stripe SDK (`stripe.ts`), the session cookie
 * (through auth-core) and the database. It is deliberately a separate module
 * from `pro-core.ts` so the entitlement/normalisation logic there stays
 * SDK-free and unit-testable.
 *
 * Price flow (the "no price hard-coded" rule): the caller passes a band id,
 * the band id maps to a Stripe price id in `stripe-catalog.ts`, and that price
 * was created from `PRICE_BANDS` in `src/lib/market.ts`. No amount appears in
 * this file at all.
 */

import { sql } from "../db";
import { priceIdForBand, type BandId } from "./stripe-catalog";
import { stripeClient } from "./stripe";

async function readCustomerId(userId: string): Promise<string | null> {
  const db = sql();
  const rows = await db<{ stripe_customer_id: string | null }[]>`
    SELECT stripe_customer_id FROM users WHERE id = ${userId} LIMIT 1`;
  return rows[0]?.stripe_customer_id ?? null;
}

/**
 * The Stripe customer for this user, created once and persisted on the user
 * row. The UPDATE is guarded with `IS NULL` so two concurrent checkouts cannot
 * overwrite each other — the id we re-read is the one of record.
 */
async function ensureCustomerId(userId: string, email: string): Promise<string> {
  const existing = await readCustomerId(userId);
  if (existing) return existing;

  const stripe = stripeClient();
  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  const db = sql();
  await db`
    UPDATE users SET stripe_customer_id = ${customer.id}
    WHERE id = ${userId} AND stripe_customer_id IS NULL`;
  return (await readCustomerId(userId)) ?? customer.id;
}

/** A stored customer id that Stripe no longer knows about (e.g. a reset sandbox). */
function isMissingCustomerError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "resource_missing"
  );
}

/**
 * Create the hosted Checkout Session for a band and return its URL.
 *
 * Success/cancel come back into the app's own origin, resolved with the same
 * helper the magic-link emails use (`siteOrigin` in auth-core), so preview
 * hosts and localhost never leak into a customer-facing redirect. The session
 * carries `client_reference_id` and subscription metadata with our user id, so
 * the webhook can still match the subscription if the customer link is ever
 * lost.
 */
export async function createCheckoutSessionCore(
  bandId: BandId
): Promise<{ url: string }> {
  const { getCurrentUserCore } = await import("./auth-core");
  const user = await getCurrentUserCore();
  if (!user) throw new Error("Sign in to upgrade to iMechanic Pro.");
  return createCheckoutSessionForUser(user, bandId);
}

/**
 * The same, for an already-resolved user — split out so the payment wiring can
 * be exercised directly (script/QA) without a session cookie, while the
 * session requirement stays in `createCheckoutSessionCore`.
 */
export async function createCheckoutSessionForUser(
  user: { id: string; email: string },
  bandId: BandId
): Promise<{ url: string }> {
  const priceId = priceIdForBand(bandId);
  if (!priceId) {
    throw new Error(
      `Pro checkout is not configured yet — no Stripe price is recorded for band "${bandId}".`
    );
  }

  const stripe = stripeClient();
  // Same origin helper the magic-link emails use, imported dynamically so this
  // module keeps only the SDK + `sql()` in its static graph.
  const { siteOrigin } = await import("./auth-core");
  const origin = siteOrigin();
  let customerId = await ensureCustomerId(user.id, user.email);

  const buildSession = (customer: string) =>
    stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/app/account?checkout=success`,
      cancel_url: `${origin}/app/account?checkout=canceled`,
      client_reference_id: user.id,
      metadata: { userId: user.id, bandId },
      subscription_data: { metadata: { userId: user.id, bandId } },
    });

  let session;
  try {
    session = await buildSession(customerId);
  } catch (error) {
    if (!isMissingCustomerError(error)) throw error;
    // The stored customer does not exist in this Stripe account (key swapped,
    // sandbox reset). Replace it with a fresh one instead of failing the
    // customer permanently. Guarded so a concurrent checkout's newer id wins.
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    const db = sql();
    await db`
      UPDATE users SET stripe_customer_id = ${customer.id}
      WHERE id = ${user.id} AND stripe_customer_id = ${customerId}`;
    customerId = (await readCustomerId(user.id)) ?? customer.id;
    session = await buildSession(customerId);
  }

  if (!session.url) {
    throw new Error("Stripe returned a checkout session without a URL.");
  }
  return { url: session.url };
}
