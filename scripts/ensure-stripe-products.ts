/**
 * Ensure the iMechanic Pro product + three annual band prices exist in the
 * connected Stripe account (sandbox today, live later).
 *
 *   bun run stripe:ensure
 *
 * Idempotent and safe to re-run: it reports `existing` for anything already in
 * place and only creates what is missing (see `src/server/stripe-ensure.ts`).
 * Amounts come from `PRICE_BANDS` in `src/lib/market.ts` — nothing is typed
 * here. The script prints the ids to record in `src/server/stripe-catalog.ts`
 * and exits non-zero if any recorded price does not match market.ts.
 *
 * Requires STRIPE_SECRET_KEY in the environment. It never prints the key.
 */

import { PRICE_BANDS } from "../src/lib/market";
import { ensureStripeCatalog } from "../src/server/stripe-ensure";
import { stripeSecretKey } from "../src/server/stripe";

async function main(): Promise<number> {
  const key = stripeSecretKey();
  if (!key) {
    console.error(
      "STRIPE_SECRET_KEY is not set — connect the Stripe account before running this."
    );
    return 1;
  }
  const mode = key.startsWith("sk_live_") ? "LIVE" : "test/sandbox";
  console.log(`Stripe mode: ${mode}\n`);

  const report = await ensureStripeCatalog();

  console.log(`product            ${report.productId}  (${report.productCreated ? "created" : "existing"})`);
  for (const price of report.prices) {
    console.log(
      `band ${price.bandId}             ${price.priceId}  ` +
        `${price.amountLabel}  ${price.currency ?? "?"}/${price.interval ?? "?"}  (${price.status})`
    );
  }
  if (report.archivedPriceIds.length > 0) {
    console.log(
      `\narchived stale price ids (amount changed in market.ts): ${report.archivedPriceIds.join(", ")}`
    );
  }

  // Verify what Stripe now holds really matches market.ts.
  const mismatches = report.prices.filter((price) => {
    const band = PRICE_BANDS.find((b) => b.id === price.bandId);
    return (
      !band ||
      price.unitAmount !== band.annualCents ||
      (price.currency ?? "").toUpperCase() !== band.currency ||
      price.interval !== "year"
    );
  });
  if (mismatches.length > 0) {
    console.error(
      `\nMISMATCH: ${mismatches
        .map((m) => `${m.bandId}=${String(m.unitAmount)}`)
        .join(", ")} does not match PRICE_BANDS in src/lib/market.ts`
    );
    return 1;
  }

  console.log(
    "\nPaste into src/server/stripe-catalog.ts:\n\n" +
      `export const STRIPE_PRODUCT_ID = ${JSON.stringify(report.productId)};\n\n` +
      "export const STRIPE_PRICE_IDS: Record<BandId, string> = {\n" +
      report.prices
        .map((price) => `  ${price.bandId}: ${JSON.stringify(price.priceId)},`)
        .join("\n") +
      "\n};"
  );
  return 0;
}

process.exit(await main());
