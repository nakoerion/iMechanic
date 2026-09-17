/**
 * Stripe webhook core — Slice S6a.
 *
 * Server-only: carries the Stripe SDK (`stripe.ts`) and the DB logic from
 * `pro-core.ts`. The HTTP route at `src/routes/api/stripe-webhook.ts` is a
 * small shell that dynamically imports `handleStripeWebhookRequest`, so neither
 * the SDK nor the DB handle can reach the client bundle.
 *
 * Posture:
 *  - Signature verification is mandatory. No `STRIPE_WEBHOOK_SECRET` → an
 *    honest 503, never a silently-accepted unverified event.
 *  - Replays are harmless: the event id is inserted into `stripe_events`
 *    before any work, and a duplicate delivery is acked with 200 (Stripe
 *    retries by design; a non-2xx would make it retry forever).
 *  - Nothing is fabricated: an event for a Stripe customer with no local
 *    `users` row is logged and acked without writing.
 *  - A failure to APPLY an event removes the ledger row and returns 500, so
 *    Stripe's retry can still do the real work.
 */

import type Stripe from "stripe";
import {
  forgetStripeEvent,
  recordStripeEventOnce,
  stripeIdOf,
  stripeSubscriptionRecord,
  upsertSubscription,
  type StripeSubscriptionLike,
} from "./pro-core";
import { stripeClient } from "./stripe";

export type WebhookDeps = {
  /** Test seam. Defaults to `process.env.STRIPE_WEBHOOK_SECRET`. */
  secret?: string | null;
  /** Test seam. Defaults to the lazily-built SDK client. */
  client?: Stripe | null;
};

export type WebhookOutcome = {
  handled: string;
  written: boolean;
  reason?: string;
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/**
 * Normalise one Stripe subscription payload into a local record and upsert it.
 * Returns a short, PII-free summary for the response and the logs.
 *
 * `userIdHint` is the user id we ourselves put on the Checkout Session
 * (`client_reference_id` / `metadata`); it narrows matching when the customer
 * link is missing, and `upsertSubscription` still verifies it against the
 * users table before trusting it.
 */
async function applySubscriptionPayload(
  payload: StripeSubscriptionLike,
  source: string,
  userIdHint?: string | null
): Promise<WebhookOutcome> {
  const record = stripeSubscriptionRecord(payload);
  if (!record) {
    console.warn(
      `[stripe] ${source}: payload without a subscription/customer id — ignored`
    );
    return {
      handled: `${source}: unidentifiable payload`,
      written: false,
      reason: "unidentifiable",
    };
  }
  if (!record.userIdHint && userIdHint) record.userIdHint = userIdHint;

  const outcome = await upsertSubscription(record);
  if (!outcome.written) {
    // Honest no-op: either a status we cannot store, or no local user for that
    // customer. Both are logged; neither invents a user.
    console.warn(
      `[stripe] ${source}: not applied (${outcome.reason}) subscription=${record.stripeSubscriptionId} status=${record.status}`
    );
    return {
      handled: `${source}: not applied`,
      written: false,
      reason: outcome.reason,
    };
  }
  return {
    handled: `${source}: ${outcome.status} band=${outcome.bandId ?? "unknown"}`,
    written: true,
  };
}

/**
 * Apply one already-verified Stripe event. Exported for tests; the route calls
 * `handleStripeWebhookRequest`.
 */
export async function applyStripeEvent(
  event: Stripe.Event,
  client: Stripe
): Promise<WebhookOutcome> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") {
        return {
          handled: "ignored: not a subscription checkout",
          written: false,
        };
      }
      const subscriptionId = stripeIdOf(session.subscription);
      if (!subscriptionId) {
        // A session with no subscription attached yet: nothing to store — the
        // `customer.subscription.*` event carries the real state.
        return {
          handled: "ignored: no subscription on the session",
          written: false,
        };
      }
      // The session carries an expanded subscription object in most
      // configurations; fall back to a fetch so the row is always written from
      // Stripe's own current state.
      const payload = (
        typeof session.subscription === "object" && session.subscription !== null
          ? session.subscription
          : await client.subscriptions.retrieve(subscriptionId)
      ) as unknown as StripeSubscriptionLike;

      const hint =
        session.metadata?.userId ?? session.client_reference_id ?? null;
      return applySubscriptionPayload(
        payload,
        "checkout.session.completed",
        hint
      );
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return applySubscriptionPayload(subscription, event.type);
    }

    default:
      return { handled: `ignored: ${event.type}`, written: false };
  }
}

/**
 * The webhook entry point. Always answers: 200 for anything we have dealt with
 * (including duplicates and events we deliberately ignore), 400 for a bad
 * signature, 503 when the webhook secret is not configured, 500 when we could
 * not apply a verified event.
 */
export async function handleStripeWebhookRequest(
  request: Request,
  deps: WebhookDeps = {}
): Promise<Response> {
  const secret = deps.secret ?? process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? null;
  if (!secret) {
    return jsonResponse(503, {
      ok: false,
      error:
        "Stripe webhooks are not configured yet (STRIPE_WEBHOOK_SECRET is not set).",
    });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return jsonResponse(400, {
      ok: false,
      error: "Missing Stripe-Signature header.",
    });
  }

  // The raw body is required for signature verification — never re-serialise it.
  const payload = await request.text();

  let client: Stripe;
  try {
    client = deps.client ?? stripeClient();
  } catch {
    return jsonResponse(503, {
      ok: false,
      error: "Stripe is not configured yet (STRIPE_SECRET_KEY is not set).",
    });
  }

  let event: Stripe.Event;
  try {
    // `constructEvent` (synchronous) cannot work here: it verifies with
    // SubtleCrypto, which is async-only in the runtime this site is served by
    // (Bun), so it throws "SubtleCryptoProvider cannot be used in a synchronous
    // context" for every delivery — including valid ones. The async variant is
    // the correct call and works on Node too.
    event = await client.webhooks.constructEventAsync(payload, signature, secret);
  } catch (error) {
    console.warn(
      `[stripe] webhook signature verification failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    return jsonResponse(400, {
      ok: false,
      error: "Signature verification failed.",
    });
  }

  // Idempotency gate (R1): first delivery only.
  const firstDelivery = await recordStripeEventOnce(event.id);
  if (!firstDelivery) {
    return jsonResponse(200, {
      ok: true,
      duplicate: true,
      eventId: event.id,
      type: event.type,
    });
  }

  try {
    const result = await applyStripeEvent(event, client);
    console.log(`[stripe] ${event.id} ${event.type} → ${result.handled}`);
    return jsonResponse(200, {
      ok: true,
      eventId: event.id,
      type: event.type,
      handled: result.handled,
      written: result.written,
      ...(result.reason ? { reason: result.reason } : {}),
    });
  } catch (error) {
    // Release the ledger row so Stripe's retry can apply the event for real.
    await forgetStripeEvent(event.id).catch(() => undefined);
    console.error(
      `[stripe] failed to apply ${event.id} (${event.type}): ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
    return jsonResponse(500, {
      ok: false,
      error: "Could not apply the event; ask Stripe to retry.",
    });
  }
}
