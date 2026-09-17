/**
 * S6a — Stripe backend unit tests.
 *
 * Pure logic only: NO database, NO network, NO Stripe key. These cover the
 * decisions that must never be guessed — Stripe status → our CHECK vocabulary,
 * price id → band, and the normalisation of a Stripe subscription payload into
 * a local row (customer as string or expanded object, period end on the
 * subscription or on its items, unmatched prices).
 *
 * The DB-backed side (webhook idempotency ledger, subscription upsert,
 * `hasActivePro`) is exercised separately against a real database; it cannot
 * run here because `TEST_DATABASE_URL` is not connected yet, and these tests
 * must keep passing with no database at all.
 */
import { describe, expect, it } from "vitest";
import { PRICE_BANDS } from "../src/lib/market";
import {
  ACTIVE_STATUSES,
  bandForPriceId,
  isPriceBandId,
  mapStripeStatus,
  periodEndOf,
  priceIdOf,
  statusGrantsPro,
  stripeIdOf,
  stripeSubscriptionRecord,
} from "../src/server/pro-core";
import {
  BAND_IDS,
  bandIdForPriceId,
  isBandId,
  priceIdForBand,
} from "../src/server/stripe-catalog";

describe("mapStripeStatus", () => {
  it("maps Stripe's six storable statuses one-to-one", () => {
    for (const status of [
      "trialing",
      "active",
      "past_due",
      "canceled",
      "incomplete",
      "incomplete_expired",
    ] as const) {
      expect(mapStripeStatus(status), status).toBe(status);
    }
  });

  it("maps the two statuses our CHECK list cannot hold to non-granting values", () => {
    // 'unpaid' and 'paused' both mean "not in good standing"; neither may grant
    // Pro, and neither may be stored as a value the CHECK would reject.
    expect(mapStripeStatus("unpaid")).toBe("past_due");
    expect(mapStripeStatus("paused")).toBe("canceled");
    expect(statusGrantsPro(mapStripeStatus("unpaid"))).toBe(false);
    expect(statusGrantsPro(mapStripeStatus("paused"))).toBe(false);
  });

  it("refuses to invent a status", () => {
    expect(mapStripeStatus("")).toBeNull();
    expect(mapStripeStatus(null)).toBeNull();
    expect(mapStripeStatus(undefined)).toBeNull();
    expect(mapStripeStatus("something_new_from_stripe")).toBeNull();
    expect(mapStripeStatus(42)).toBeNull();
  });
});

describe("statusGrantsPro", () => {
  it("grants Pro only for trialing and active", () => {
    expect(ACTIVE_STATUSES).toEqual(["trialing", "active"]);
    expect(statusGrantsPro("trialing")).toBe(true);
    expect(statusGrantsPro("active")).toBe(true);
    for (const status of ["past_due", "canceled", "incomplete", "incomplete_expired"]) {
      expect(statusGrantsPro(status), status).toBe(false);
    }
    expect(statusGrantsPro(null)).toBe(false);
  });
});

describe("band guards", () => {
  it("accepts exactly the three bands market.ts defines", () => {
    expect(BAND_IDS).toEqual(PRICE_BANDS.map((band) => band.id));
    for (const band of PRICE_BANDS) {
      expect(isPriceBandId(band.id), band.id).toBe(true);
      expect(isBandId(band.id), band.id).toBe(true);
    }
    for (const bad of ["d", "", "A", null, undefined, 1, {}]) {
      expect(isPriceBandId(bad), String(bad)).toBe(false);
      expect(isBandId(bad), String(bad)).toBe(false);
    }
  });
});

describe("band ↔ price id", () => {
  it("returns null for anything that is not one of our prices", () => {
    expect(bandForPriceId(null)).toBeNull();
    expect(bandForPriceId(undefined)).toBeNull();
    expect(bandForPriceId("")).toBeNull();
    expect(bandForPriceId("price_not_ours")).toBeNull();
    expect(bandIdForPriceId("price_not_ours")).toBeNull();
  });

  it("round-trips every band the catalogue has recorded", () => {
    for (const band of PRICE_BANDS) {
      const priceId = priceIdForBand(band.id);
      if (!priceId) continue; // catalogue not filled in yet — nothing to assert
      expect(bandIdForPriceId(priceId), band.id).toBe(band.id);
    }
  });

  it("never hands out a placeholder id", () => {
    for (const band of PRICE_BANDS) {
      const priceId = priceIdForBand(band.id);
      if (priceId !== null) expect(priceId.startsWith("price_")).toBe(true);
    }
  });
});

describe("stripeIdOf", () => {
  it("reads an id from a string, an expanded object, or a deleted object", () => {
    expect(stripeIdOf("cus_123")).toBe("cus_123");
    expect(stripeIdOf({ id: "cus_123" })).toBe("cus_123");
    expect(stripeIdOf({ id: "cus_123", deleted: true } as { id: string })).toBe(
      "cus_123"
    );
    expect(stripeIdOf("")).toBeNull();
    expect(stripeIdOf(null)).toBeNull();
    expect(stripeIdOf(undefined)).toBeNull();
    expect(stripeIdOf({})).toBeNull();
  });
});

describe("period end", () => {
  it("prefers the latest period across the subscription and its items", () => {
    expect(periodEndOf({ current_period_end: 100 })).toBe(100);
    // Stripe's 2025 "basil" API version moved the period onto the item.
    expect(
      periodEndOf({ items: { data: [{ current_period_end: 500 }] } })
    ).toBe(500);
    expect(
      periodEndOf({
        current_period_end: 100,
        items: { data: [{ current_period_end: 300 }] },
      })
    ).toBe(300);
  });

  it("returns null rather than a fabricated timestamp", () => {
    expect(periodEndOf({})).toBeNull();
    expect(periodEndOf({ items: { data: [] } })).toBeNull();
    expect(periodEndOf({ current_period_end: null })).toBeNull();
  });
});

describe("priceIdOf", () => {
  const known = priceIdForBand("a");

  it("falls back to the first line item when no price is ours", () => {
    expect(
      priceIdOf({ items: { data: [{ price: { id: "price_other" } }] } })
    ).toBe("price_other");
    expect(priceIdOf({ items: { data: [] } })).toBeNull();
    expect(priceIdOf({})).toBeNull();
  });

  it("finds our band price even when it is not the first line item", () => {
    if (!known) return; // catalogue not filled in yet
    expect(
      priceIdOf({
        items: {
          data: [{ price: { id: "price_addon" } }, { price: { id: known } }],
        },
      })
    ).toBe(known);
  });
});

describe("stripeSubscriptionRecord", () => {
  const base = {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    current_period_end: 1_800_000_000,
    items: { data: [{ price: { id: priceIdForBand("a") ?? "price_other" } }] },
  };

  it("normalises a usable payload", () => {
    const record = stripeSubscriptionRecord(base);
    expect(record).not.toBeNull();
    expect(record?.stripeSubscriptionId).toBe("sub_123");
    expect(record?.stripeCustomerId).toBe("cus_123");
    expect(record?.status).toBe("active");
    expect(record?.currentPeriodEnd).toBe(1_800_000_000);
  });

  it("accepts an expanded customer object and a metadata userId hint", () => {
    const record = stripeSubscriptionRecord({
      id: "sub_123",
      customer: { id: "cus_456", deleted: true } as { id: string },
      status: "trialing",
      metadata: { userId: "user-1" },
    });
    expect(record?.stripeCustomerId).toBe("cus_456");
    expect(record?.userIdHint).toBe("user-1");
    expect(record?.currentPeriodEnd).toBeNull();
  });

  it("never produces half a row", () => {
    expect(stripeSubscriptionRecord({ id: "sub_123" })).toBeNull();
    expect(stripeSubscriptionRecord({ customer: "cus_123" })).toBeNull();
    expect(stripeSubscriptionRecord({})).toBeNull();
    expect(stripeSubscriptionRecord({ id: "", customer: "" })).toBeNull();
  });

  it("keeps an unknown status verbatim for the mapper to reject", () => {
    const record = stripeSubscriptionRecord({ ...base, status: "brand_new" });
    expect(record?.status).toBe("brand_new");
    expect(mapStripeStatus(record?.status)).toBeNull();
    const missing = stripeSubscriptionRecord({ ...base, status: null });
    expect(mapStripeStatus(missing?.status)).toBeNull();
  });

  it("stores the band only when the price is one of ours", () => {
    const known = stripeSubscriptionRecord(base);
    expect(bandForPriceId(known?.priceId)).toBe(priceIdForBand("a") ? "a" : null);
    const unknown = stripeSubscriptionRecord({
      ...base,
      items: { data: [{ price: { id: "price_other" } }] },
    });
    expect(bandForPriceId(unknown?.priceId)).toBeNull();
  });
});
