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
  /** How the currency is written, e.g. `€` or `Lekë`. */
  symbol: string;
  /** "before" → `€120`; "after" → `120 Lekë` (one space is inserted). */
  symbolPosition: "before" | "after";
  /**
   * Number marks are declared here, never read from the runtime.
   *
   * The server and the browser ship different ICU data. For `sq-AL` the server
   * writes "120 Lekë" / "184 000 km" while a browser without Albanian data
   * silently falls back to "ALL 120" / "184,000 km". Both render the same
   * screen, but the server-rendered text is what React expects on first paint —
   * so a disagreement is a hydration mismatch (React error #418) that throws
   * the whole SSR tree away. Formatting therefore has to be ours.
   */
  groupSeparator: string;
  decimalSeparator: string;
  distanceUnit: DistanceUnit;
};

export const DEFAULT_COUNTRY: CountryCode = "DE";

export const MARKETS: Record<CountryCode, Market> = {
  DE: {
    country: "DE",
    name: "Germany",
    currency: "EUR",
    symbol: "€",
    symbolPosition: "before",
    groupSeparator: ".",
    decimalSeparator: ",",
    distanceUnit: "km",
  },
  GB: {
    country: "GB",
    name: "United Kingdom",
    currency: "GBP",
    symbol: "£",
    symbolPosition: "before",
    groupSeparator: ",",
    decimalSeparator: ".",
    distanceUnit: "mi",
  },
  AL: {
    country: "AL",
    name: "Albania",
    currency: "ALL",
    symbol: "Lekë",
    symbolPosition: "after",
    groupSeparator: " ",
    decimalSeparator: ",",
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

/* ------------------------------------------------------------------ */
/* Deterministic number/money/distance formatting                      */
/* ------------------------------------------------------------------ */

/**
 * Every number the app shows is formatted here, by hand, from the market's own
 * marks — never by `Intl`. See the `groupSeparator` note on `Market`: the
 * server's ICU data and the browser's can disagree, and any disagreement is a
 * hydration mismatch on first paint. `toFixed` is exact in both runtimes.
 */
function groupDigits(digits: string, separator: string): string {
  if (!separator) return digits;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function formatAmount(value: number, market: Market, decimals: number): string {
  const [whole, fraction] = Math.abs(value).toFixed(decimals).split(".");
  const grouped = groupDigits(whole, market.groupSeparator);
  const sign = value < 0 ? "-" : "";
  return sign + grouped + (decimals > 0 ? market.decimalSeparator + fraction : "");
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
  const amount = formatAmount(Math.round(cents) / 100, market, decimals ? 2 : 0);
  return market.symbolPosition === "after"
    ? `${amount} ${market.symbol}`
    : `${market.symbol}${amount}`;
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
  return `${formatAmount(value, market, 0)} ${market.distanceUnit}`;
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

/**
 * Bands are quoted in EUR with a "€31.99" shape regardless of user locale —
 * so they keep the euro symbol but take British marks, not the German ones.
 * (This used to be an `en-IE` Intl locale; the marks are now explicit so the
 * string is identical on the server and in the browser.)
 */
const BAND_MARKET: Market = {
  ...MARKETS.DE,
  symbolPosition: "before",
  groupSeparator: ",",
  decimalSeparator: ".",
};

export function formatBandAnnual(band: PriceBand): string {
  return formatMoney(band.annualCents, BAND_MARKET, { decimals: true });
}

export function formatBandMonthly(band: PriceBand): string {
  return formatMoney(band.monthlyCents, BAND_MARKET, { decimals: true });
}

export const PRICING_PREVIEW_NOTE =
  "Preview pricing — bands are indicative and will be finalized at launch. Reading and clearing codes stays free, always.";
