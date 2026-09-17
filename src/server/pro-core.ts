/**
 * Pro entitlement + Stripe subscription persistence — Slice S6a.
 *
 * Module-boundary contract: pure logic over the database. It imports `sql()`,
 * `market.ts` and `stripe-catalog.ts` — never the Stripe SDK, never request
 * helpers — so the whole module is unit-testable with plain objects and no
 * network. Anything that touches the Stripe SDK or the request cookie lives in
 * `stripe.ts` / `stripe-webhook.ts` / `pro.ts`.
 *
 * Nothing here hard-codes a price: the local row stores WHICH band
 * (`price_band` text, one of a/b/c) and the band comes from matching the
 * Stripe price id against the catalogue, which was itself created from
 * `PRICE_BANDS` in `src/lib/market.ts`.
 *
 * `sql()` is resolved per call, not at module load, so importing this module
 * (e.g. from a unit test) never requires `DATABASE_URL` — exactly the same
 * lazy contract as `src/db.ts`.
 */

import { sql } from "../db";
import { PRICE_BANDS } from "../lib/market";
import {
  bandIdForPriceId,
  BAND_IDS,
  type BandId,
} from "./stripe-catalog";

/* ------------------------------------------------------------------ */
/* Status vocabulary                                                   */
/* ------------------------------------------------------------------ */

/** Exactly the values allowed by `subscriptions.status`'s CHECK constraint. */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

/**
 * Statuses that grant Pro. Mirrored literally by the `IN ('trialing','active')`
 * in `hasActivePro`/`getEntitlementCore` below — if this list changes, those
 * two queries must change with it.
 */
export const ACTIVE_STATUSES: SubscriptionStatus[] = ["trialing", "active"];

/**
 * Stripe's status vocabulary into ours.
 *
 * Six statuses map one-to-one. Two of Stripe's have no counterpart in our
 * CHECK list, and both mean the subscription is *not* in good standing, so
 * each maps to the closest allowed value that also does not grant Pro — the
 * raw Stripe status is logged by the caller so the truth is never lost:
 *   - 'unpaid'  → 'past_due'  (Stripe stopped collecting; money is owed)
 *   - 'paused'  → 'canceled'  (Stripe paused it; it is not in force)
 * An absent/unknown status returns null and the write is skipped rather than
 * invented — never guess an entitlement.
 */
export function mapStripeStatus(raw: unknown): SubscriptionStatus | null {
  switch (typeof raw === "string" ? raw : "") {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "incomplete_expired":
      return "incomplete_expired";
    case "unpaid":
      return "past_due";
    case "paused":
      return "canceled";
    default:
      return null;
  }
}

/** True when a stored status grants Pro access. */
export function statusGrantsPro(status: string | null | undefined): boolean {
  return status === "trialing" || status === "active";
}

/** Band id for a Stripe price id, or null when it is not one of ours. */
export function bandForPriceId(priceId: string | null | undefined): BandId | null {
  return bandIdForPriceId(priceId);
}

/** Guard for the three known band ids, derived from `PRICE_BANDS`. */
export function isPriceBandId(value: unknown): value is BandId {
  return (
    typeof value === "string" &&
    PRICE_BANDS.some((band) => band.id === value) &&
    (BAND_IDS as string[]).includes(value)
  );
}

/* ------------------------------------------------------------------ */
/* Event → local record normalisation (pure)                            */
/* ------------------------------------------------------------------ */

/**
 * The structural slice of a Stripe Subscription / SubscriptionItem we read.
 * Declared here (not imported from the SDK) so this module stays SDK-free and
 * the normalisation is unit-testable with plain objects.
 */
export type StripeSubscriptionLike = {
  id?: string | null;
  customer?: string | { id?: string | null } | null;
  status?: string | null;
  /**
   * Stripe moved the billing period onto the subscription *item* in the 2025
   * "basil" API version; older versions carry it on the subscription itself.
   * We read both and take the latest, so the code is correct on either.
   */
  current_period_end?: number | null;
  items?: {
    data?: Array<{
      price?: { id?: string | null } | null;
      current_period_end?: number | null;
    }> | null;
  } | null;
  metadata?: Record<string, string> | null;
};

export type StripeCustomerLike = {
  customer?: string | { id?: string | null } | null;
  /** Checkout Sessions carry the owning user in `client_reference_id`. */
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
};

/** A Stripe object id, whether it arrived as a string or an expanded object. */
export function stripeIdOf(
  value: string | { id?: string | null } | null | undefined
): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (value && typeof value === "object" && typeof value.id === "string") {
    return value.id.length > 0 ? value.id : null;
  }
  return null;
}

/** The latest period end across the subscription and its items, in unix seconds. */
export function periodEndOf(sub: StripeSubscriptionLike): number | null {
  const candidates: number[] = [];
  if (typeof sub.current_period_end === "number") {
    candidates.push(sub.current_period_end);
  }
  for (const item of sub.items?.data ?? []) {
    if (typeof item?.current_period_end === "number") {
      candidates.push(item.current_period_end);
    }
  }
  return candidates.length > 0 ? Math.max(...candidates) : null;
}

/**
 * The price id of the line item that belongs to *our* catalogue. Falls back to
 * the first line item so an unknown price is still visible (and stored with
 * `price_band` null) instead of being silently dropped.
 */
export function priceIdOf(sub: StripeSubscriptionLike): string | null {
  const items = sub.items?.data ?? [];
  for (const item of items) {
    const id = stripeIdOf(item?.price ?? null);
    if (id && bandIdForPriceId(id)) return id;
  }
  return stripeIdOf(items[0]?.price ?? null);
}

/** Everything the local `subscriptions` row needs. */
export type StripeSubscriptionRecord = {
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  /** Raw Stripe status, mapped to our CHECK vocabulary at write time. */
  status: string;
  priceId: string | null;
  /** Unix seconds, or null when Stripe did not report a period. */
  currentPeriodEnd: number | null;
  /** `metadata.userId` when we set it (checkout + subscription_data). */
  userIdHint: string | null;
};

/**
 * Normalise a Stripe subscription payload. Returns null when the payload
 * cannot identify a subscription or a customer — the caller acks and logs
 * instead of writing half a row.
 */
export function stripeSubscriptionRecord(
  sub: StripeSubscriptionLike
): StripeSubscriptionRecord | null {
  const stripeSubscriptionId = stripeIdOf(sub.id ?? null);
  const stripeCustomerId = stripeIdOf(sub.customer ?? null);
  if (!stripeSubscriptionId || !stripeCustomerId) return null;
  return {
    stripeSubscriptionId,
    stripeCustomerId,
    status: typeof sub.status === "string" ? sub.status : "",
    priceId: priceIdOf(sub),
    currentPeriodEnd: periodEndOf(sub),
    userIdHint:
      typeof sub.metadata?.userId === "string" && sub.metadata.userId.length > 0
        ? sub.metadata.userId
        : null,
  };
}

/* ------------------------------------------------------------------ */
/* Database                                                            */
/* ------------------------------------------------------------------ */

export type UpsertOutcome =
  | { written: true; userId: string; status: SubscriptionStatus; bandId: BandId | null }
  | { written: false; reason: "no-user" | "unsupported-status" };

/**
 * Webhook idempotency ledger (R1). Stripe retries by design; the INSERT is the
 * gate. Returns true only for the FIRST delivery of an event id.
 */
export async function recordStripeEventOnce(eventId: string): Promise<boolean> {
  const db = sql();
  const rows = await db<{ id: string }[]>`
    INSERT INTO stripe_events (id) VALUES (${eventId})
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  return rows.length > 0;
}

/**
 * Drop a ledger row after a handling failure, so Stripe's next retry can apply
 * the event for real. Recording first is the right order (a replay must never
 * double-apply), but without this a transient DB error would turn into a
 * permanently lost entitlement update.
 */
export async function forgetStripeEvent(eventId: string): Promise<void> {
  const db = sql();
  await db`DELETE FROM stripe_events WHERE id = ${eventId}`;
}

/** Local user behind a Stripe customer id, or null. Never guesses. */
export async function userIdForStripeCustomer(
  stripeCustomerId: string
): Promise<string | null> {
  const db = sql();
  const rows = await db<{ id: string }[]>`
    SELECT id FROM users WHERE stripe_customer_id = ${stripeCustomerId} LIMIT 1`;
  return rows[0]?.id ?? null;
}

function subscriptionValues(record: StripeSubscriptionRecord) {
  const status = mapStripeStatus(record.status);
  const bandId = bandForPriceId(record.priceId);
  const periodEnd =
    typeof record.currentPeriodEnd === "number"
      ? new Date(record.currentPeriodEnd * 1000).toISOString()
      : null;
  return { status, bandId, periodEnd };
}

/**
 * Upsert the local `subscriptions` row for a Stripe subscription event.
 *
 * User matching is never fabricated: the Stripe customer id must belong to a
 * local `users` row (written when checkout created the customer). The
 * `metadata.userId` hint from our own checkout is accepted as a second
 * verified route — and is only trusted if that user row actually exists.
 */
export async function upsertSubscription(
  record: StripeSubscriptionRecord
): Promise<UpsertOutcome> {
  const { status, bandId, periodEnd } = subscriptionValues(record);
  if (!status) return { written: false, reason: "unsupported-status" };

  let userId = await userIdForStripeCustomer(record.stripeCustomerId);
  const db = sql();

  if (!userId && record.userIdHint) {
    const rows = await db<{ id: string }[]>`
      SELECT id FROM users WHERE id = ${record.userIdHint} LIMIT 1`;
    if (rows.length > 0) {
      userId = rows[0].id;
      // Backfill the link so later events (and checkout) resolve by customer.
      await db`
        UPDATE users SET stripe_customer_id = ${record.stripeCustomerId}
        WHERE id = ${userId} AND stripe_customer_id IS NULL`;
    }
  }

  if (!userId) return { written: false, reason: "no-user" };

  // The schema enforces ONE active/trialing subscription per user. A second
  // subscription arriving as active therefore supersedes the previous one —
  // we retire the old row first so the partial unique index cannot reject the
  // new (correct) state. Only done for incoming active statuses, so a
  // cancellation of some unrelated subscription never revokes a live one.
  if (statusGrantsPro(status)) {
    await db`
      UPDATE subscriptions SET status = 'canceled', updated_at = now()
      WHERE user_id = ${userId}
        AND status IN ('trialing','active')
        AND stripe_subscription_id IS DISTINCT FROM ${record.stripeSubscriptionId}`;
  }

  await db`
    INSERT INTO subscriptions
      (user_id, stripe_subscription_id, status, price_band, current_period_end)
    VALUES
      (${userId}, ${record.stripeSubscriptionId}, ${status}, ${bandId}, ${periodEnd})
    ON CONFLICT (stripe_subscription_id) DO UPDATE SET
      status             = EXCLUDED.status,
      price_band         = EXCLUDED.price_band,
      current_period_end = EXCLUDED.current_period_end,
      user_id            = EXCLUDED.user_id,
      updated_at         = now()`;

  return { written: true, userId, status, bandId };
}

/* ------------------------------------------------------------------ */
/* Entitlement                                                         */
/* ------------------------------------------------------------------ */

/** True iff the user has a subscription in ('trialing','active'). */
export async function hasActivePro(userId: string): Promise<boolean> {
  const db = sql();
  const rows = await db<{ id: string }[]>`
    SELECT id FROM subscriptions
    WHERE user_id = ${userId} AND status IN ('trialing','active')
    LIMIT 1`;
  return rows.length > 0;
}

export type EntitlementStatus = {
  status: SubscriptionStatus;
  bandId: BandId | null;
  currentPeriodEnd: string | null;
};

/** The user's current subscription row, active or not, or null. */
export async function currentSubscription(
  userId: string
): Promise<EntitlementStatus | null> {
  const db = sql();
  const rows = await db<
    { status: string; price_band: string | null; current_period_end: unknown }[]
  >`
    SELECT status, price_band, current_period_end
    FROM subscriptions
    WHERE user_id = ${userId}
    ORDER BY updated_at DESC
    LIMIT 1`;
  const row = rows[0];
  if (!row) return null;
  const status = mapStripeStatus(row.status);
  if (!status) return null;
  return {
    status,
    bandId: isPriceBandId(row.price_band) ? row.price_band : null,
    // Timestamps come back as JS Dates; the client needs a string.
    currentPeriodEnd: row.current_period_end
      ? String(row.current_period_end)
      : null,
  };
}

/** What the (S6b) UI needs: whether this signed-in user has Pro right now. */
export type EntitlementView = {
  signedIn: boolean;
  pro: boolean;
  status: SubscriptionStatus | null;
  bandId: BandId | null;
  currentPeriodEnd: string | null;
};

/**
 * Entitlement for the current session. Signed out is never an error — it is
 * simply not Pro. The signed-in user id is resolved through auth-core, which
 * is imported dynamically so this module keeps its no-request-helpers contract
 * and stays importable from a plain unit test.
 */
export async function getEntitlementCore(): Promise<EntitlementView> {
  const { getCurrentUserCore } = await import("./auth-core");
  const user = await getCurrentUserCore();
  const signedOut: EntitlementView = {
    signedIn: false,
    pro: false,
    status: null,
    bandId: null,
    currentPeriodEnd: null,
  };
  if (!user) return signedOut;

  const sub = await currentSubscription(user.id);
  if (!sub) return { ...signedOut, signedIn: true };
  return {
    signedIn: true,
    pro: statusGrantsPro(sub.status),
    status: sub.status,
    bandId: sub.bandId,
    currentPeriodEnd: sub.currentPeriodEnd,
  };
}
