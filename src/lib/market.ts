/**
 * Market config — the single source of truth for currency, units and price
 * bands.
 *
 * Rules this module exists to enforce:
 *   1. Nothing else in the app formats money or distance. Import from here.
 *   2. No price is hard-coded in a component. The bands below are the only
 *      place they live, so they can change without a code review of the UI.
 *   3. The bands are an explicitly-labelled PREVIEW used to test
 *      willingness-to-pay. They are not committed prices and the UI must
 *      always say so (see PRICING_PREVIEW_NOTE).
 *
 * Market is derived from `users.country`; until auth lands, callers pass a
 * country or get DEFAULT_COUNTRY.
 */

export type CountryCode = "DE" | "GB" | "AL";
export type DistanceUnit = "km" | "mi";

export type Market = {
  country: CountryCode;
  /** English name, beta is English-only. */
  name: string;
  /** ISO 4217 */
  currency: "EUR" | "GBP" | "ALL";
  symbol: string;
  locale: string;
  distanceUnit: DistanceUnit;
};

export const DEFAULT_COUNTRY: CountryCode = "DE";

export const MARKETS: Record<CountryCode, Market> = {
  DE: {
    country: "DE",
    name: "Germany",
    currency: "EUR",
    symbol: "€",
    locale: "de-DE",
    distanceUnit: "km",
  },
  GB: {
    country: "GB",
    name: "United Kingdom",
    currency: "GBP",
    symbol: "£",
    locale: "en-GB",
    distanceUnit: "mi",
  },
  AL: {
    country: "AL",
    name: "Albania",
    currency: "ALL",
    symbol: "L",
    locale: "sq-AL",
    distanceUnit: "km",
  },
};

export const MARKET_LIST: Market[] = [MARKETS.DE, MARKETS.GB, MARKETS.AL];

export function isCountryCode(value: unknown): value is CountryCode {
  return value === "DE" || value === "GB" || value === "AL";
}

/** Accepts a `users.country` value (possibly null/unknown) and never throws. */
export function resolveMarket(country?: string | null): Market {
  const code = typeof country === "string" ? country.toUpperCase() : "";
  return isCountryCode(code) ? MARKETS[code] : MARKETS[DEFAULT_COUNTRY];
}

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(market: Market, fractionDigits: number) {
  const key = `${market.locale}:${market.currency}:${fractionDigits}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(market.locale, {
      style: "currency",
      currency: market.currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    moneyFormatters.set(key, fmt);
  }
  return fmt;
}

/**
 * Money is stored in minor units (cents) everywhere — `diagnoses.cost_*_cents`.
 * Whole amounts drop the decimals: a cost band reads "€180", not "€180.00".
 */
export function formatMoney(
  cents: number,
  market: Market,
  options: { decimals?: boolean } = {},
): string {
  const whole = Math.round(cents) % 100 === 0;
  const decimals = options.decimals ?? !whole;
  return moneyFormatter(market, decimals ? 2 : 0).format(Math.round(cents) / 100);
}

/** Cost estimates are always bands, never a single false-precision number. */
export function formatMoneyRange(
  lowCents: number,
  highCents: number,
  market: Market,
): string {
  if (lowCents === highCents) return formatMoney(lowCents, market);
  return `${formatMoney(lowCents, market)}–${formatMoney(highCents, market)}`;
}

/* ------------------------------------------------------------------ */
/* Distance                                                            */
/* ------------------------------------------------------------------ */

const KM_PER_MILE = 1.609344;

export function kmTo(km: number, unit: DistanceUnit): number {
  return unit === "mi" ? km / KM_PER_MILE : km;
}

/** Odometer values are stored as `vehicles.mileage_km` and converted here. */
export function formatDistance(km: number, market: Market): string {
  const value = Math.round(kmTo(km, market.distanceUnit));
  return `${new Intl.NumberFormat(market.locale).format(value)} ${market.distanceUnit}`;
}

/* ------------------------------------------------------------------ */
/* iMechanic Pro — preview price bands                                 */
/* ------------------------------------------------------------------ */

export type PriceBand = {
  id: "a" | "b" | "c";
  annualCents: number;
  monthlyCents: number;
  currency: "EUR";
};

/**
 * PREVIEW ONLY. Three annual-first bands shown on the marketing page to test
 * willingness-to-pay during the beta. What differentiates them is not decided,
 * none are committed, and no money has moved. Quoted in EUR for every market
 * until per-market pricing is set.
 */
export const PRICE_BANDS: PriceBand[] = [
  { id: "a", annualCents: 3199, monthlyCents: 399, currency: "EUR" },
  { id: "b", annualCents: 3999, monthlyCents: 499, currency: "EUR" },
  { id: "c", annualCents: 4799, monthlyCents: 599, currency: "EUR" },
];

/** Bands are quoted in EUR with a "€31.99" shape regardless of user locale. */
const BAND_MARKET: Market = { ...MARKETS.DE, locale: "en-IE" };

export function formatBandAnnual(band: PriceBand): string {
  return formatMoney(band.annualCents, BAND_MARKET, { decimals: true });
}

export function formatBandMonthly(band: PriceBand): string {
  return formatMoney(band.monthlyCents, BAND_MARKET, { decimals: true });
}

export const PRICING_PREVIEW_NOTE =
  "Preview pricing — bands are indicative and will be finalized at launch. Reading and clearing codes stays free, always.";
