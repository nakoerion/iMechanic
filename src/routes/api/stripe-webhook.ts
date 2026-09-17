/**
 * Stripe webhook endpoint — Slice S6a. POST /api/stripe-webhook
 *
 * A TanStack Start server route: `server.handlers` runs only on the server, and
 * the implementation is imported DYNAMICALLY so the Stripe SDK and the DB
 * handle stay out of the client bundle (the same boundary rule `auth.ts` uses
 * for `auth-core.ts`). The verification, idempotency and persistence logic
 * lives in `src/server/stripe-webhook.ts`.
 */

import { createFileRoute } from "@tanstack/react-router";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export const Route = createFileRoute("/api/stripe-webhook")({
  server: {
    handlers: {
      /** Stripe only ever POSTs here. Anything else gets an honest 405. */
      GET: () =>
        json(405, {
          ok: false,
          error: "Use POST — this endpoint receives Stripe webhook events.",
        }),

      POST: async ({ request }) => {
        const { handleStripeWebhookRequest } = await import(
          "../../server/stripe-webhook"
        );
        return handleStripeWebhookRequest(request);
      },
    },
  },
});
