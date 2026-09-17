import { describe, expect, it } from "vitest";
import {
  FREE_SCAN_HISTORY,
  FREE_VEHICLES,
  canAddFreeVehicle,
  visibleForPlan,
  visibleScans,
  visibleVehicles,
} from "../src/lib/pro-limits";

/**
 * The free/Pro boundary (S6b). These are the pure rules the History and
 * Vehicles screens enforce; the screens themselves only render what these
 * return, so the counts must be exactly right — `hiddenCount` is what the UI
 * tells the user, and an under-count would be a silent truncation.
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
