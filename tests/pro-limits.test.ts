import { describe, expect, it } from "vitest";
import {
  FREE_SCAN_HISTORY,
  FREE_VEHICLES,
  canAddFreeVehicle,
  limitPageForPlan,
  limitScansForPlan,
  limitVehiclesForPlan,
  readPlanPage,
  vehicleCreateGate,
  visibleForPlan,
  visibleScans,
  visibleVehicles,
} from "../src/lib/pro-limits";

/**
 * The free/Pro boundary (S6b client-side, S6d server-side). These are the pure
 * rules the History and Vehicles screens and the server functions all enforce;
 * they only render/return what these produce, so the counts must be exactly
 * right — `hiddenCount` is what the user is told, and an under-count would be
 * a silent truncation.
 */

const list = (n: number) => Array.from({ length: n }, (_, i) => `s${i}`);

describe("visibleForPlan", () => {
  it("Pro sees the whole list and hides nothing", () => {
    const result = visibleForPlan(list(9), true, 3);
    expect(result.visible).toEqual(list(9));
    expect(result.hiddenCount).toBe(0);
    expect(result.limited).toBe(false);
  });

  it("free keeps the first N in the given order", () => {
    const result = visibleForPlan(list(9), false, 3);
    expect(result.visible).toEqual(["s0", "s1", "s2"]);
    expect(result.hiddenCount).toBe(6);
    expect(result.limited).toBe(true);
  });

  it("exactly at the limit hides nothing and is not 'limited'", () => {
    const result = visibleForPlan(list(3), false, 3);
    expect(result.visible).toEqual(list(3));
    expect(result.hiddenCount).toBe(0);
    expect(result.limited).toBe(false);
  });

  it("an empty list stays empty for both plans", () => {
    expect(visibleForPlan([], false, 3)).toEqual({
      visible: [],
      hiddenCount: 0,
      limited: false,
    });
    expect(visibleForPlan([], true, 3).hiddenCount).toBe(0);
  });

  it("never mutates the caller's array", () => {
    const input = list(5);
    visibleForPlan(input, false, 2);
    expect(input).toEqual(list(5));
  });
});

describe("the plan limits themselves", () => {
  it("free keeps 3 scans and 1 vehicle", () => {
    expect(FREE_SCAN_HISTORY).toBe(3);
    expect(FREE_VEHICLES).toBe(1);
  });

  it("scans are newest-first, so a free history keeps the newest", () => {
    const newestFirst = ["newest", "middle", "older", "oldest"];
    const result = visibleScans(newestFirst, false);
    expect(result.visible).toEqual(["newest", "middle", "older"]);
    expect(result.hiddenCount).toBe(1);
  });

  it("a free garage keeps the first stored vehicle and counts the rest", () => {
    const vehicles = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const result = visibleVehicles(vehicles, false);
    expect(result.visible).toEqual([{ id: "a" }]);
    expect(result.hiddenCount).toBe(2);
    expect(result.limited).toBe(true);
  });

  it("Pro garages are never limited", () => {
    const vehicles = [{ id: "a" }, { id: "b" }];
    expect(visibleVehicles(vehicles, true).visible).toEqual(vehicles);
  });
});

describe("canAddFreeVehicle", () => {
  it("allows the first vehicle only", () => {
    expect(canAddFreeVehicle(0)).toBe(true);
    expect(canAddFreeVehicle(1)).toBe(false);
    expect(canAddFreeVehicle(3)).toBe(false);
  });
});

/**
 * S6d — the server-side boundary. `listScans` / `listVehicles` return a
 * PlanPage (never more rows than the plan allows, plus honest counts) and
 * `createVehicle` asks `vehicleCreateGate` before it writes. Everything below
 * is the logic those handlers run, so a direct server-function call cannot
 * show or store more than the screen would.
 */
describe("limitPageForPlan (the server's list boundary)", () => {
  it("a free user gets only the rows their plan allows", () => {
    const page = limitScansForPlan(list(7), false);
    expect(page.visible).toEqual(["s0", "s1", "s2"]);
    expect(page.hiddenCount).toBe(4);
    expect(page.total).toBe(7);
    expect(page.limited).toBe(true);
  });

  it("a Pro user gets every row and no note", () => {
    const page = limitScansForPlan(list(7), true);
    expect(page.visible).toEqual(list(7));
    expect(page.hiddenCount).toBe(0);
    expect(page.total).toBe(7);
    expect(page.limited).toBe(false);
  });

  it("exactly at the limit is not 'limited' — nothing to disclose", () => {
    const page = limitVehiclesForPlan([{ id: "a" }], false);
    expect(page.visible).toEqual([{ id: "a" }]);
    expect(page.hiddenCount).toBe(0);
    expect(page.total).toBe(1);
    expect(page.limited).toBe(false);
  });

  it("counts every row the user HOLDS when the read itself was capped", () => {
    /* listScansCore reads at most SCAN_HISTORY_LIMIT rows, so a user with more
       scans than that must still be told the true number — under-reporting
       here is exactly the silent truncation the honesty rule forbids. */
    const page = limitScansForPlan(list(50), false, 137);
    expect(page.visible).toHaveLength(FREE_SCAN_HISTORY);
    expect(page.hiddenCount).toBe(134);
    expect(page.total).toBe(137);
  });

  it("never turns a capped Pro read into a paywall note", () => {
    const page = limitScansForPlan(list(50), true, 137);
    expect(page.visible).toHaveLength(50);
    expect(page.hiddenCount).toBe(0);
    expect(page.limited).toBe(false);
  });

  it("an empty list is empty for both plans", () => {
    expect(limitVehiclesForPlan([], false)).toEqual({
      visible: [],
      hiddenCount: 0,
      limited: false,
      total: 0,
    });
    expect(limitVehiclesForPlan([], true).total).toBe(0);
  });

  it("never mutates the caller's array", () => {
    const input = list(5);
    limitPageForPlan(input, false, 2);
    expect(input).toEqual(list(5));
  });

  it("ignores a nonsense held-total rather than inventing a limit", () => {
    expect(limitPageForPlan(list(2), false, 3, Number.NaN).total).toBe(2);
    expect(limitPageForPlan(list(2), false, 3, -5).total).toBe(2);
  });
});

describe("readPlanPage (the screen's defensive read)", () => {
  it("reads the server's page verbatim", () => {
    const page = readPlanPage<string>({
      visible: ["a", "b"],
      hiddenCount: 3,
      limited: true,
      total: 5,
    });
    expect(page).toEqual({
      visible: ["a", "b"],
      hiddenCount: 3,
      limited: true,
      total: 5,
    });
  });

  it("treats a legacy plain array as unlimited rather than inventing a limit", () => {
    expect(readPlanPage(["a", "b"])).toEqual({
      visible: ["a", "b"],
      hiddenCount: 0,
      limited: false,
      total: 2,
    });
  });

  it("never trusts a payload whose counts disagree with the rows", () => {
    // hiddenCount smaller than total-visible must not hide the difference.
    const page = readPlanPage<string>({
      visible: ["a"],
      hiddenCount: 0,
      limited: false,
      total: 4,
    });
    expect(page.hiddenCount).toBe(3);
    expect(page.limited).toBe(true);
  });

  it("survives rubbish without crashing and without claiming rows", () => {
    for (const value of [undefined, null, 7, "nope", {}, { visible: "x" }]) {
      expect(readPlanPage(value)).toEqual({
        visible: [],
        hiddenCount: 0,
        limited: false,
        total: 0,
      });
    }
  });

  it("round-trips what the server produced", () => {
    const page = limitVehiclesForPlan([{ id: "a" }, { id: "b" }], false, 4);
    expect(readPlanPage(page)).toEqual(page);
  });
});

describe("vehicleCreateGate (the server's write boundary)", () => {
  it("lets a free user keep exactly one vehicle", () => {
    expect(vehicleCreateGate(false, 0)).toEqual({ allowed: true });
    expect(vehicleCreateGate(false, 1)).toEqual({
      allowed: false,
      reason: "vehicle-limit",
    });
    expect(vehicleCreateGate(false, 4).allowed).toBe(false);
  });

  it("never limits a Pro user", () => {
    for (const held of [0, 1, 9]) {
      expect(vehicleCreateGate(true, held)).toEqual({ allowed: true });
    }
  });

  it("agrees with canAddFreeVehicle on the free boundary", () => {
    for (const held of [0, 1, 2, 5]) {
      expect(vehicleCreateGate(false, held).allowed).toBe(
        canAddFreeVehicle(held),
      );
    }
  });
});
