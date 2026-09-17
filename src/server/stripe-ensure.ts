/**
 * Idempotent Stripe catalogue ensure routine — Slice S6a.
 *
 * Run it with `bun run stripe:ensure` (see `scripts/ensure-stripe-products.ts`).
 * It creates, once, the "iMechanic Pro" product and the three annual recurring
 * prices for the sandbox or live Stripe account the key belongs to, and it can
 * be re-run any number of times without creating duplicates:
 *
 *  1. the product is found by our metadata marker (`imechanic_product=pro`),
 *     falling back to its exact name;
 *  2. each band price is found by its band metadata (`imechanic_band=a|b|c`),
 *     or adopted if an identical annual price for the same amount and currency
 *     already exists;
 *  3. only a genuinely missing price is created.
 *
 * Amounts are never typed here — they come from `PRICE_BANDS` in
 * `src/lib/market.ts`, and if a band's amount ever changes, the routine creates
 * the new price and archives the stale one (Stripe prices are immutable) rather
 * than silently charging the old amount.
 *
 * Server-only: it carries the Stripe SDK. The ids it returns are recorded in
 * `src/server/stripe-catalog.ts`.
 */

import type Stripe from "stripe";
import { PRICE_BANDS, formatBandAnnual, type PriceBand } from "../lib/market";
import { stripeClient } from "./stripe";
import {
  BAND_METADATA_KEY,
  PRODUCT_METADATA_KEY,
  PRODUCT_METADATA_VALUE,
  STRIPE_PRODUCT_NAME,
  type BandId,
} from "./stripe-catalog";

export type BandPriceReport = {
  bandId: BandId;
  priceId: string;
  unitAmount: number | null;
  currency: string | null;
  interval: string | null;
  status: "existing" | "adopted" | "created" | "replaced";
  /** Human-readable amount, from market.ts — for the report only. */
  amountLabel: string;
};

export type EnsureReport = {
  productId: string;
  productCreated: boolean;
  prices: BandPriceReport[];
  /** Stale price ids deactivated because their amount no longer matched. */
  archivedPriceIds: string[];
};

function bandMetadataOf(price: Stripe.Price): BandId | null {
  const value = price.metadata?.[BAND_METADATA_KEY];
  return value === "a" || value === "b" || value === "c" ? value : null;
}

/** An existing price that already means exactly this band. */
function matchesBand(price: Stripe.Price, band: PriceBand): boolean {
  return (
    price.unit_amount === band.annualCents &&
    (price.currency ?? "").toUpperCase() === band.currency &&
    price.recurring?.interval === "year" &&
    (price.recurring?.interval_count ?? 1) === 1
  );
}

async function createBandPrice(
  stripe: Stripe,
  productId: string,
  band: PriceBand
): Promise<Stripe.Price> {
  return stripe.prices.create({
    product: productId,
    currency: band.currency.toLowerCase(),
    unit_amount: band.annualCents,
    recurring: { interval: "year" },
    nickname: `iMechanic Pro annual — band ${band.id}`,
    metadata: {
      [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE,
      [BAND_METADATA_KEY]: band.id,
    },
  });
}

function report(
  band: PriceBand,
  price: Stripe.Price,
  status: BandPriceReport["status"]
): BandPriceReport {
  return {
    bandId: band.id,
    priceId: price.id,
    unitAmount: price.unit_amount,
    currency: price.currency ?? null,
    interval: price.recurring?.interval ?? null,
    status,
    amountLabel: formatBandAnnual(band),
  };
}

export async function ensureStripeCatalog(): Promise<EnsureReport> {
  const stripe = stripeClient();

  // 1. The product.
  const products = await stripe.products.list({ active: true, limit: 100 });
  let product =
    products.data.find(
      (p) => p.metadata?.[PRODUCT_METADATA_KEY] === PRODUCT_METADATA_VALUE
    ) ?? products.data.find((p) => p.name === STRIPE_PRODUCT_NAME);

  let productCreated = false;
  if (!product) {
    product = await stripe.products.create({
      name: STRIPE_PRODUCT_NAME,
      description:
        "iMechanic Pro — annual subscription. Reading and clearing fault codes stays free, always.",
      metadata: { [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE },
    });
    productCreated = true;
  }

  // 2. The three annual band prices.
  const existing = await stripe.prices.list({
    product: product.id,
    active: true,
    limit: 100,
  });
  const byBand = new Map<BandId, Stripe.Price>();
  for (const price of existing.data) {
    const bandId = bandMetadataOf(price);
    if (bandId && !byBand.has(bandId)) byBand.set(bandId, price);
  }

  const prices: BandPriceReport[] = [];
  const archivedPriceIds: string[] = [];
  const claimed = new Set<string>();

  for (const band of PRICE_BANDS) {
    const tagged = byBand.get(band.id);

    if (tagged && matchesBand(tagged, band)) {
      claimed.add(tagged.id);
      prices.push(report(band, tagged, "existing"));
      continue;
    }

    if (tagged) {
      // The amount in market.ts changed: prices are immutable, so create the
      // correct one and archive the stale id (existing subscribers keep their
      // own price; only new checkouts move).
      const replacement = await createBandPrice(stripe, product.id, band);
      await stripe.prices.update(tagged.id, { active: false });
      archivedPriceIds.push(tagged.id);
      claimed.add(replacement.id);
      prices.push(report(band, replacement, "replaced"));
      continue;
    }

    // Adopt an untagged price that already means exactly this band, so a price
    // created by hand in the dashboard is not duplicated.
    const adoptable = existing.data.find(
      (price) =>
        !claimed.has(price.id) && !bandMetadataOf(price) && matchesBand(price, band)
    );
    if (adoptable) {
      const adopted = await stripe.prices.update(adoptable.id, {
        metadata: {
          ...adoptable.metadata,
          [PRODUCT_METADATA_KEY]: PRODUCT_METADATA_VALUE,
          [BAND_METADATA_KEY]: band.id,
        },
      });
      claimed.add(adopted.id);
      prices.push(report(band, adopted, "adopted"));
      continue;
    }

    const created = await createBandPrice(stripe, product.id, band);
    claimed.add(created.id);
    prices.push(report(band, created, "created"));
  }

  return {
    productId: product.id,
    productCreated,
    prices,
    archivedPriceIds,
  };
}
