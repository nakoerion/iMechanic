/**
 * S5 Decide — deterministic DIY-vs-workshop cost estimator.
 *
 * Pure and client-safe: no Node builtins, no server imports. Shared by the
 * scan server functions (which persist band midpoints onto the `diagnoses`
 * row) and by the UI pass (which derives the full band at render time).
 *
 * Two concepts:
 *   1. `repairFamilyFor` maps a scan's codes (+ verdict) to ONE concrete
 *      repair area. It reuses the exported code-family matchers from
 *      `diagnosis.ts` (`isMisfireCode`, `isCatalystPairCode`) and mirrors
 *      the remaining family regexes from that module's REPAIR_SOON_FAMILIES
 *      table (same patterns, not re-invented — see the notes on each
 *      matcher). Verdict logic itself is untouched: this module only reads
 *      the verdict, never changes it.
 *   2. `estimateCosts` looks up an indicative DIY band and workshop band
 *      for that family in the owner's market (DE/GB/AL, from `market.ts`).
 *
 * COSTS ARE ESTIMATES — see COST_ESTIMATE_NOTE. The catalog holds honest,
 * mid-market indicative bands (typical parts + labour for each repair
 * area); the UI must always present them as bands with the note attached,
 * never as quotes and never as a single false-precision number.
 */

import { isCatalystPairCode, isMisfireCode, type Verdict } from "./diagnosis";
import { resolveMarket, type CountryCode, type Market } from "./market";

/* ------------------------------------------------------------------ */
/* Repair families                                                       */
/* ------------------------------------------------------------------ */

/**
 * Ten concrete repair areas plus a "general" fallback for codes that match
 * nothing (unknown / manufacturer-specific codes). The fallback stays
 * deliberately wide — it prices "needs a proper look", not a repair.
 */
export const REPAIR_FAMILIES = [
  "ignition",
  "oxygen_sensor",
  "catalyst",
  "evap",
  "cooling",
  "airflow",
  "egr",
  "charging",
  "throttle_idle",
  "engine_timing",
  "general",
] as const;

export type RepairFamily = (typeof REPAIR_FAMILIES)[number];

export function isRepairFamily(value: unknown): value is RepairFamily {
  return (
    typeof value === "string" &&
    (REPAIR_FAMILIES as readonly string[]).includes(value)
  );
}

function upper(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Priority-ordered family matchers. Priority is by repair consequence, not
 * by code order: the catalyst pair wins over a co-occurring misfire because
 * a stored P0420/P0430 prices a converter replacement (the expensive,
 * consequential repair), while the misfire is sequenced FIRST inside the
 * catalyst guide ("never fit a new converter under an active misfire").
 * Stored codes are preferred over pending/permanent ones — an unconfirmed
 * pending code must not choose the repair area when a stored code exists.
 */
const FAMILY_MATCHERS: { family: RepairFamily; test: (code: string) => boolean }[] = [
  {
    // Catalyst efficiency pair (+ extended catalyst codes) — mirrors the
    // drive-on catalyst list in diagnosis.ts (P0420/P0421/P0430/P0431).
    family: "catalyst",
    test: (c) =>
      isCatalystPairCode(c) || c === "P0421" || c === "P0431",
  },
  {
    // Stored misfire P0300–P0308 — reuses the diagnosis.ts matcher.
    family: "ignition",
    test: (c) => isMisfireCode(c),
  },
  {
    // O2 sensors P013x–P015x — same pattern as diagnosis.ts. Biased-sensor
    // codes P2195–P2198 (lean/rich family in diagnosis.ts) also land here:
    // they describe a lazy/biased oxygen sensor, not a fuelling fault.
    family: "oxygen_sensor",
    test: (c) => /^P01(3[0-9]|4[0-9]|5[0-9])$/.test(c) || /^P219[5-8]$/.test(c),
  },
  {
    // Air metering + fuel trim: MAF/MAP/IAT P0101–P0114 (same pattern as
    // diagnosis.ts) plus system lean/rich P0171–P0175 and P2187–P2190
    // (lean/rich family in diagnosis.ts). Lean/rich trim faults most often
    // trace to unmetered air, a dirty MAF or fuel delivery — the intake
    // side is where diagnosis starts, hence this family, not "general".
    family: "airflow",
    test: (c) =>
      /^P01(0[1-9]|1[0-4])$/.test(c) ||
      /^(P017[1-5]|P2187|P2188|P2189|P2190)$/.test(c),
  },
  {
    // EGR P0401–P0419 — same pattern as diagnosis.ts.
    family: "egr",
    test: (c) => /^P04(0[1-9]|1[0-9])$/.test(c),
  },
  {
    // EVAP P0440–P0449, P0455–P0459, P0496 — same list as the drive-on
    // EVAP family in diagnosis.ts. (P0450–P0454 pressure-sensor codes are
    // not in the diagnosis.ts list; they fall through to "general".)
    family: "evap",
    test: (c) =>
      /^P044[0-9]$/.test(c) || /^P045[5-9]$/.test(c) || c === "P0496",
  },
  {
    // Cooling: P0128 thermostat (drive-on family in diagnosis.ts) plus the
    // standard coolant-temperature-circuit codes P0115–P0119 and P0125.
    // Those circuit codes have no family in diagnosis.ts (S5 extension —
    // verdict logic unchanged); they describe the same repair area.
    family: "cooling",
    test: (c) => c === "P0128" || c === "P0125" || /^P011[5-9]$/.test(c),
  },
  {
    // Charging / voltage P0560–P0563 — same pattern as diagnosis.ts.
    family: "charging",
    test: (c) => /^P056[0-3]$/.test(c),
  },
  {
    // Throttle / idle — same pattern as diagnosis.ts.
    family: "throttle_idle",
    test: (c) => /^(P012[1-3]|P022[1-3]|P050[5-7]|P2101)$/.test(c),
  },
  {
    // Knock / crank / cam position P0325–P0349 — same pattern as
    // diagnosis.ts ("knock / crank / cam position"). Timing-side faults:
    // sensors first, mechanical timing second — mostly workshop work,
    // reflected in the catalog (narrow DIY band, wide shop band).
    family: "engine_timing",
    test: (c) => /^P03(2[5-9]|3[0-9]|4[0-9])$/.test(c),
  },
];

export type FamilyInput = {
  codes: { code: string; status: string }[];
  verdict: Verdict | string | null;
};

/**
 * Resolve the scan's repair family. Stored codes choose; pending/permanent
 * codes only count when nothing is stored. Unknown codes and empty scans
 * resolve to "general". Never throws — worst case is the fallback.
 */
export function repairFamilyFor(input: FamilyInput): RepairFamily {
  const codes = (input.codes ?? []).map((c) => ({
    code: upper(String(c.code ?? "")),
    status: String(c.status ?? ""),
  }));
  const stored = codes.filter((c) => c.status === "stored");
  const pool = stored.length > 0 ? stored : codes;
  for (const { family, test } of FAMILY_MATCHERS) {
    if (pool.some((c) => c.code.length > 0 && test(c.code))) return family;
  }
  return "general";
}

/* ------------------------------------------------------------------ */
/* Cost catalog — indicative bands in MINOR UNITS (cents), per brief    */
/* ------------------------------------------------------------------ */

/**
 * COSTS ARE ESTIMATES. Every band below is an indicative mid-market range
 * (typical parts + labour for the repair area in that market), NOT a quote.
 * Actual costs vary by vehicle, engine, region and workshop — the UI must
 * always render COST_ESTIMATE_NOTE alongside any figure from this catalog.
 * The "general" family is deliberately the widest: it prices "needs a
 * proper diagnostic look", not a known repair.
 *
 * ALL (Albanian lek) has no subunit; amounts are stored ×100 like every
 * other currency so `formatMoney` keeps working (lek 3,500 → 350000).
 */
export const COST_ESTIMATE_NOTE =
  "Indicative cost bands, not quotes — actual parts and labour vary by vehicle, region and workshop. Always confirm with a written quote before authorising work.";

type BandPair = {
  /** Parts-first range for doing it yourself. */
  diy: [lowCents: number, highCents: number];
  /** Independent-workshop range (parts + labour, no dealer rates). */
  shop: [lowCents: number, highCents: number];
};

export const COST_CATALOG: Record<RepairFamily, Record<CountryCode, BandPair>> = {
  // Plugs + coils: cheap parts, little labour.
  ignition: {
    DE: { diy: [3000, 12000], shop: [12000, 40000] },
    GB: { diy: [2500, 10000], shop: [10000, 35000] },
    AL: { diy: [350000, 1200000], shop: [1000000, 3500000] },
  },
  // One sensor + access labour (seized threads push it up).
  oxygen_sensor: {
    DE: { diy: [4000, 16000], shop: [15000, 45000] },
    GB: { diy: [3500, 14000], shop: [13000, 40000] },
    AL: { diy: [500000, 1800000], shop: [1200000, 4500000] },
  },
  // Converter itself dominates; DIY rare (welding/lift) but possible.
  catalyst: {
    DE: { diy: [25000, 90000], shop: [50000, 180000] },
    GB: { diy: [20000, 80000], shop: [40000, 150000] },
    AL: { diy: [2500000, 9000000], shop: [4000000, 15000000] },
  },
  // Often trivial (fuel cap, purge valve); diagnosis is the dear part.
  evap: {
    DE: { diy: [1500, 12000], shop: [10000, 45000] },
    GB: { diy: [1200, 10000], shop: [9000, 40000] },
    AL: { diy: [200000, 1200000], shop: [800000, 4000000] },
  },
  // Thermostat/sensor + coolant; straightforward but messy.
  cooling: {
    DE: { diy: [2500, 12000], shop: [15000, 50000] },
    GB: { diy: [2000, 10000], shop: [13000, 45000] },
    AL: { diy: [300000, 1200000], shop: [1200000, 4500000] },
  },
  // Cleaning is nearly free; a new MAF is not.
  airflow: {
    DE: { diy: [3000, 20000], shop: [15000, 55000] },
    GB: { diy: [2500, 17000], shop: [13000, 48000] },
    AL: { diy: [350000, 2200000], shop: [1200000, 5000000] },
  },
  // Valve price + carbon-heavy labour; diesels run higher.
  egr: {
    DE: { diy: [4000, 25000], shop: [25000, 80000] },
    GB: { diy: [3500, 22000], shop: [22000, 70000] },
    AL: { diy: [450000, 2500000], shop: [2000000, 7000000] },
  },
  // Battery (DIY-friendly) to alternator (usually workshop).
  charging: {
    DE: { diy: [6000, 22000], shop: [12000, 45000] },
    GB: { diy: [5000, 19000], shop: [10000, 40000] },
    AL: { diy: [700000, 2500000], shop: [1000000, 4000000] },
  },
  // Clean/relearn is cheap; a new throttle body is not.
  throttle_idle: {
    DE: { diy: [1500, 25000], shop: [12000, 60000] },
    GB: { diy: [1200, 22000], shop: [10000, 55000] },
    AL: { diy: [200000, 2500000], shop: [1000000, 5500000] },
  },
  // Sensors are cheap; mechanical timing work is workshop-only.
  engine_timing: {
    DE: { diy: [4000, 30000], shop: [20000, 90000] },
    GB: { diy: [3500, 26000], shop: [18000, 80000] },
    AL: { diy: [450000, 3000000], shop: [1800000, 8000000] },
  },
  // Unknown area: prices a diagnostic visit, deliberately wide.
  general: {
    DE: { diy: [5000, 40000], shop: [15000, 100000] },
    GB: { diy: [4000, 35000], shop: [13000, 90000] },
    AL: { diy: [500000, 4000000], shop: [1500000, 9000000] },
  },
};

export type CostEstimate = {
  family: RepairFamily;
  currency: "EUR" | "GBP" | "ALL";
  diyLowCents: number;
  diyHighCents: number;
  shopLowCents: number;
  shopHighCents: number;
  /**
   * Safety routing, NOT an upsell: true means "do not DIY this" — either
   * the verdict is stop_driving, or a stored misfire is actively damaging
   * the catalyst. The UI must render this as a safety card, never with a
   * lock, badge or Pro styling (free-tier trust rules apply).
   */
  workshopRecommended: boolean;
};

export type WorkshopInput = {
  codes: { code: string; status: string }[];
  verdict: Verdict | string | null;
};

/**
 * The DIY-suppression rule. Fires when the verdict is stop_driving, or —
 * as defence-in-depth, independent of the verdict — when a STORED misfire
 * co-occurs with a STORED catalyst code (unburnt fuel destroying the
 * converter; the same pair the rules engine escalates on). Pending codes
 * never trigger it: unconfirmed faults must not forbid DIY.
 */
export function isWorkshopRecommended(input: WorkshopInput): boolean {
  if (input.verdict === "stop_driving") return true;
  const stored = (input.codes ?? [])
    .filter((c) => String(c.status ?? "") === "stored")
    .map((c) => upper(String(c.code ?? "")));
  return (
    stored.some((c) => isMisfireCode(c)) &&
    stored.some((c) => isCatalystPairCode(c))
  );
}

/** Midpoint of a band, rounded — what gets persisted to the DB row. */
export function bandMidpoint(lowCents: number, highCents: number): number {
  return Math.round((lowCents + highCents) / 2);
}

/**
 * Look up the bands for a family in a market. `market` accepts a Market,
 * a country code, or anything else (falls back to DE via resolveMarket).
 * Unknown families fall back to "general" — never throws.
 */
export function estimateCosts(
  family: RepairFamily | string,
  market: Market | CountryCode | string | null | undefined,
  opts?: { codes?: { code: string; status: string }[]; verdict?: Verdict | string | null },
): CostEstimate {
  const key: RepairFamily = isRepairFamily(family) ? family : "general";
  const resolved: Market =
    typeof market === "string" || market == null
      ? resolveMarket(typeof market === "string" ? market : null)
      : market;
  const band = COST_CATALOG[key][resolved.country];
  return {
    family: key,
    currency: resolved.currency,
    diyLowCents: band.diy[0],
    diyHighCents: band.diy[1],
    shopLowCents: band.shop[0],
    shopHighCents: band.shop[1],
    workshopRecommended: isWorkshopRecommended({
      codes: opts?.codes ?? [],
      verdict: opts?.verdict ?? null,
    }),
  };
}
