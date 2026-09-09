/**
 * S5 Act — guided-repair step library unit tests.
 *
 * Pure unit tests, NO database, NO network: the library is static ordered
 * content per family. Covers the brief's list: ordered non-empty steps
 * with tools for every family; safety notes where expected; the general
 * fallback for unknown families; bounded length (4–7 steps).
 */
import { describe, expect, it } from "vitest";
import {
  REPAIR_GUIDANCE_NOTE,
  repairFamilyKeys,
  repairGuideFor,
  repairStepsFor,
} from "../src/lib/repair";
import { REPAIR_FAMILIES } from "../src/lib/cost";

describe("repairStepsFor", () => {
  it("returns ordered, non-empty steps with tools for every family", () => {
    expect(repairFamilyKeys()).toEqual([...REPAIR_FAMILIES]);
    for (const family of REPAIR_FAMILIES) {
      const steps = repairStepsFor(family);
      expect(steps.length, family).toBeGreaterThanOrEqual(4);
      expect(steps.length, family).toBeLessThanOrEqual(7);
      for (const step of steps) {
        expect(step.title.trim().length, `${family} title`).toBeGreaterThan(0);
        expect(step.body.trim().length, `${family} body`).toBeGreaterThan(0);
        expect(Array.isArray(step.tools), `${family} tools`).toBe(true);
        expect(step.tools.length, `${family} tools non-empty`).toBeGreaterThan(0);
        expect(step.estMinutes, `${family} estMinutes`).toBeGreaterThan(0);
      }
    }
  });

  it("unknown families resolve to the general guide, never empty", () => {
    const steps = repairStepsFor("not-a-family");
    expect(steps.length).toBeGreaterThan(0);
    expect(repairGuideFor("not-a-family").family).toBe("general");
    expect(repairGuideFor("").family).toBe("general");
  });

  it("every guide ends with a clear-and-rescan confirmation step", () => {
    for (const family of REPAIR_FAMILIES) {
      const steps = repairStepsFor(family);
      const last = steps[steps.length - 1]!;
      expect(`${last.title} ${last.body}`.toLowerCase(), family).toMatch(
        /re-scan|rescan/,
      );
    }
  });

  it("safety notes exist where expected (heat, fuel, electrics, timing)", () => {
    for (const family of [
      "ignition",
      "oxygen_sensor",
      "catalyst",
      "evap",
      "cooling",
      "charging",
      "engine_timing",
      "general",
    ] as const) {
      const note = repairGuideFor(family).safetyNote;
      expect(note, family).toBeTruthy();
      expect(note!.length, family).toBeGreaterThan(20);
    }
  });

  it("steps are honest: no torque specs, no part numbers, no fix promises", () => {
    const bodies = REPAIR_FAMILIES.flatMap((f) =>
      repairStepsFor(f).map((s) => `${s.title}\n${s.body}`),
    ).join("\n");
    expect(bodies).not.toMatch(/\b\d+\s?Nm\b/i);
    // No invented catalogue identifiers: "part number" / "part no" must
    // never appear (the guides say "correct part for your car" instead).
    expect(bodies).not.toMatch(/part\s+(number|no\.?)\b/i);
    expect(bodies).not.toMatch(/will (definitely|certainly) fix/i);
    expect(bodies).not.toMatch(/guaranteed/i);
  });

  it("the guidance note frames the library as general, not vehicle-specific", () => {
    expect(REPAIR_GUIDANCE_NOTE).toMatch(/general guidance/i);
    expect(REPAIR_GUIDANCE_NOTE).toMatch(/workshop/i);
  });
});
