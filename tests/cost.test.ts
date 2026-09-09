/**
 * S5 Decide — cost estimator unit tests.
 *
 * Pure unit tests, NO database, NO network: the estimator is deterministic
 * catalog data + pure family resolution. Covers the brief's list: family
 * resolution for known codes + the "general" fallback; per-market currency
 * + ordered bands (low ≤ high); workshopRecommended for stop_driving and
 * for misfire+catalyst; pending codes never triggering it.
 */
import { describe, expect, it } from "vitest";
import {
  bandMidpoint,
  COST_CATALOG,
  COST_ESTIMATE_NOTE,
  estimateCosts,
  isWorkshopRecommended,
  REPAIR_FAMILIES,
  repairFamilyFor,
  type RepairFamily,
} from "../src/lib/cost";

const stored = (code: string) => ({ code, status: "stored" });

describe("repairFamilyFor", () => {
  it("maps known codes to the right family", () => {
    expect(repairFamilyFor({ codes: [stored("P0301")], verdict: "repair_soon" })).toBe("ignition");
    expect(repairFamilyFor({ codes: [stored("P0300")], verdict: "repair_soon" })).toBe("ignition");
    expect(repairFamilyFor({ codes: [stored("P0133")], verdict: "repair_soon" })).toBe("oxygen_sensor");
    expect(repairFamilyFor({ codes: [stored("P0420")], verdict: "drive_on" })).toBe("catalyst");
    expect(repairFamilyFor({ codes: [stored("P0430")], verdict: "drive_on" })).toBe("catalyst");
    expect(repairFamilyFor({ codes: [stored("P0442")], verdict: "drive_on" })).toBe("evap");
    expect(repairFamilyFor({ codes: [stored("P0128")], verdict: "drive_on" })).toBe("cooling");
    expect(repairFamilyFor({ codes: [stored("P0171")], verdict: "repair_soon" })).toBe("airflow");
    expect(repairFamilyFor({ codes: [stored("P0101")], verdict: "repair_soon" })).toBe("airflow");
    expect(repairFamilyFor({ codes: [stored("P0401")], verdict: "repair_soon" })).toBe("egr");
    expect(repairFamilyFor({ codes: [stored("P0562")], verdict: "repair_soon" })).toBe("charging");
    expect(repairFamilyFor({ codes: [stored("P0507")], verdict: "repair_soon" })).toBe("throttle_idle");
    expect(repairFamilyFor({ codes: [stored("P0335")], verdict: "repair_soon" })).toBe("engine_timing");
  });

  it("is case-insensitive and prefers stored codes over pending ones", () => {
    expect(repairFamilyFor({ codes: [stored("p0301")], verdict: "repair_soon" })).toBe("ignition");
    expect(
      repairFamilyFor({
        codes: [
          { code: "P0301", status: "pending" },
          stored("P0420"),
        ],
        verdict: "repair_soon",
      }),
    ).toBe("catalyst");
  });

  it("resolves catalyst over a co-occurring misfire (converter prices the job)", () => {
    expect(
      repairFamilyFor({
        codes: [stored("P0301"), stored("P0420")],
        verdict: "stop_driving",
      }),
    ).toBe("catalyst");
  });

  it("falls back to general for unknown codes and empty scans", () => {
    expect(repairFamilyFor({ codes: [stored("P0999")], verdict: "repair_soon" })).toBe("general");
    expect(repairFamilyFor({ codes: [], verdict: "drive_on" })).toBe("general");
    expect(repairFamilyFor({ codes: [{ code: "", status: "stored" }], verdict: null })).toBe("general");
  });
});

describe("estimateCosts", () => {
  const FAMILIES = REPAIR_FAMILIES.filter((f) => f !== "general") as RepairFamily[];
  const allFamilies: RepairFamily[] = [...REPAIR_FAMILIES];

  it("covers every family × every market with ordered bands", () => {
    for (const family of allFamilies) {
      for (const country of ["DE", "GB", "AL"] as const) {
        const est = estimateCosts(family, country);
        expect(est.family).toBe(family);
        expect(est.diyLowCents).toBeLessThanOrEqual(est.diyHighCents);
        expect(est.shopLowCents).toBeLessThanOrEqual(est.shopHighCents);
        expect(est.diyLowCents).toBeGreaterThan(0);
        expect(est.shopLowCents).toBeGreaterThan(0);
      }
    }
    expect(FAMILIES.length).toBeGreaterThanOrEqual(6);
  });

  it("returns the per-market currency (DE→EUR, GB→GBP, AL→ALL)", () => {
    expect(estimateCosts("ignition", "DE").currency).toBe("EUR");
    expect(estimateCosts("ignition", "GB").currency).toBe("GBP");
    expect(estimateCosts("ignition", "AL").currency).toBe("ALL");
  });

  it("falls back safely for unknown markets and unknown families", () => {
    expect(estimateCosts("ignition", "XX").currency).toBe("EUR");
    expect(estimateCosts("ignition", null).currency).toBe("EUR");
    const est = estimateCosts("not-a-family", "DE");
    expect(est.family).toBe("general");
  });

  it("keeps the general family the widest (a diagnostic visit, not a repair)", () => {
    const general = COST_CATALOG.general.DE;
    const ignition = COST_CATALOG.ignition.DE;
    expect(general.shop[1] - general.shop[0]).toBeGreaterThan(
      ignition.shop[1] - ignition.shop[0],
    );
  });

  it("bandMidpoint rounds to the middle of the band", () => {
    expect(bandMidpoint(10000, 20000)).toBe(15000);
    expect(bandMidpoint(10001, 20000)).toBe(15001);
  });

  it("the estimate note is honest (bands, not quotes)", () => {
    expect(COST_ESTIMATE_NOTE).toMatch(/not quotes/i);
    expect(COST_ESTIMATE_NOTE).toMatch(/vary/i);
  });
});

describe("isWorkshopRecommended (safety routing, not an upsell)", () => {
  it("is true for any stop_driving verdict, regardless of codes", () => {
    expect(
      isWorkshopRecommended({ codes: [stored("P0442")], verdict: "stop_driving" }),
    ).toBe(true);
    expect(isWorkshopRecommended({ codes: [], verdict: "stop_driving" })).toBe(true);
  });

  it("is true for stored misfire + stored catalyst even without the verdict", () => {
    expect(
      isWorkshopRecommended({
        codes: [stored("P0301"), stored("P0420")],
        verdict: "repair_soon",
      }),
    ).toBe(true);
  });

  it("is false for ordinary repair_soon and drive_on scans", () => {
    expect(
      isWorkshopRecommended({ codes: [stored("P0301")], verdict: "repair_soon" }),
    ).toBe(false);
    expect(
      isWorkshopRecommended({ codes: [stored("P0420")], verdict: "drive_on" }),
    ).toBe(false);
    expect(isWorkshopRecommended({ codes: [], verdict: "drive_on" })).toBe(false);
  });

  it("pending codes never trigger it (unconfirmed faults must not forbid DIY)", () => {
    expect(
      isWorkshopRecommended({
        codes: [
          { code: "P0301", status: "pending" },
          { code: "P0420", status: "pending" },
        ],
        verdict: "repair_soon",
      }),
    ).toBe(false);
  });

  it("flows through estimateCosts opts", () => {
    const est = estimateCosts("catalyst", "DE", {
      codes: [stored("P0301"), stored("P0420")],
      verdict: "stop_driving",
    });
    expect(est.workshopRecommended).toBe(true);
    expect(
      estimateCosts("ignition", "DE", {
        codes: [stored("P0301")],
        verdict: "repair_soon",
      }).workshopRecommended,
    ).toBe(false);
  });
});
