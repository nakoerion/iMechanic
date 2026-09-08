/**
 * Severity rules engine — ten unit tests (S3 merge-gate R1).
 *
 * Pure unit tests, NO database: the engine operates on in-memory codes +
 * catalog metadata only. Case numbering follows the review's spec.
 */
import { describe, expect, it } from "vitest";
import {
  diagnose,
  rootCauseFor,
  RULES_CONFIDENCE,
  SENSOR_RULES,
  type CatalogEntry,
  type DiagnosisInput,
} from "../src/lib/diagnosis";

function catalogFor(
  rows: Record<string, Partial<CatalogEntry>>,
): Map<string, CatalogEntry> {
  return new Map(
    Object.entries(rows).map(([code, r]) => [
      code,
      {
        code,
        title: r.title ?? `${code} title`,
        system: r.system ?? "System",
        generic_cause: r.generic_cause ?? `${code} cause.`,
        severity_default: r.severity_default ?? "repair_soon",
      },
    ]),
  );
}

const FULL_CATALOG = catalogFor({
  P0301: { severity_default: "repair_soon" },
  P0420: { severity_default: "drive_on" },
  P0430: { severity_default: "drive_on" },
  P0442: { severity_default: "drive_on" },
  P0128: { severity_default: "drive_on" },
  P0171: { severity_default: "repair_soon" },
  P0133: { severity_default: "repair_soon" },
  P0101: { severity_default: "repair_soon" },
  P0401: { severity_default: "repair_soon" },
  P0562: { severity_default: "repair_soon" },
});

function run(input: Omit<DiagnosisInput, "catalog"> & { catalog?: DiagnosisInput["catalog"] }) {
  return diagnose({ catalog: FULL_CATALOG, ...input });
}

describe("diagnosis rules engine (R1)", () => {
  it("1 — first-match-wins: misfire+catalyst escalates past the misfire-alone rule", () => {
    const r = run({
      codes: [
        { code: "P0301", status: "stored" },
        { code: "P0420", status: "stored" },
      ],
    });
    expect(r.verdict).toBe("stop_driving");
    expect(r.reasons.join(" ")).toMatch(/P0301.*P0420|misfire.*catalyst/i);
    expect(r.reasons).toHaveLength(1);
  });

  it("2 — stored misfire + stored P0430 also escalates to stop_driving", () => {
    const r = run({
      codes: [
        { code: "P0300", status: "stored" },
        { code: "P0430", status: "stored" },
      ],
    });
    expect(r.verdict).toBe("stop_driving");
  });

  it("3 — misfire alone (stored) is repair_soon", () => {
    const r = run({ codes: [{ code: "P0301", status: "stored" }] });
    expect(r.verdict).toBe("repair_soon");
    expect(r.reasons.join(" ")).toMatch(/P0301/i);
  });

  it("4 — lean / O2 / MAF / EGR / voltage families are repair_soon", () => {
    for (const code of ["P0171", "P0133", "P0101", "P0401", "P0562"]) {
      expect(
        run({ codes: [{ code, status: "stored" }] }).verdict,
        code,
      ).toBe("repair_soon");
    }
  });

  it("5 — all stored codes catalyst/EVAP/thermostat is drive_on", () => {
    const r = run({
      codes: [
        { code: "P0420", status: "stored" },
        { code: "P0442", status: "stored" },
        { code: "P0128", status: "stored" },
      ],
    });
    expect(r.verdict).toBe("drive_on");
    expect(r.reasons.join(" ")).toMatch(/P0420, P0442, P0128/);
  });

  it("6 — no stored codes (empty scan) is drive_on; pending-only is conservative repair_soon", () => {
    expect(run({ codes: [] }).verdict).toBe("drive_on");
    const pending = run({ codes: [{ code: "P0442", status: "pending" }] });
    expect(pending.verdict).toBe("repair_soon");
  });

  it("7 — unknown code is repair_soon with an honest not-in-catalog reason", () => {
    const r = run({ codes: [{ code: "P0999", status: "stored" }] });
    expect(r.verdict).toBe("repair_soon");
    expect(r.reasons.join(" ")).toMatch(/not in our catalog/i);
    expect(r.perCode[0]).toMatchObject({ code: "P0999", known: false });
    expect(rootCauseFor(r)).toMatch(/no catalog entry/i);
  });

  it("8 — pending-only codes never escalate: pending misfire+catalyst is repair_soon", () => {
    const r = run({
      codes: [
        { code: "P0301", status: "pending" },
        { code: "P0420", status: "pending" },
      ],
    });
    expect(r.verdict).toBe("repair_soon");
  });

  it("9 — catalog severity_default is display-only: a drive_on hint never overrides a repair_soon verdict", () => {
    // P0420 seeds as drive_on — but a stored misfire next to it must still
    // escalate, and a lone seeded drive_on hint must not pull repair_soon up.
    const escalated = run({
      codes: [
        { code: "P0301", status: "stored" },
        { code: "P0420", status: "stored" },
      ],
    });
    expect(escalated.verdict).toBe("stop_driving");
    const misfireCard = escalated.perCode.find((c) => c.code === "P0301");
    expect(misfireCard?.severity).toBe("repair_soon");
    // severity_default travels only to per-code display:
    const lone = run({ codes: [{ code: "P0171", status: "stored" }] });
    expect(lone.verdict).toBe("repair_soon");
    expect(RULES_CONFIDENCE).toBe(70);
  });

  it("10 — sensor rules are present but inert on code-only data", () => {
    // Evaluators exist…
    expect(typeof SENSOR_RULES.coolantOverheat).toBe("function");
    expect(typeof SENSOR_RULES.chargingFailure).toBe("function");
    // …but with no sensor snapshot (the S3 code-only path) they never fire:
    expect(SENSOR_RULES.coolantOverheat(undefined)).toBe(false);
    expect(SENSOR_RULES.chargingFailure(undefined)).toBe(false);
    // …and the engine never produces a sensor reason from code-only input:
    const r = run({
      codes: [{ code: "P0420", status: "stored" }],
    });
    expect(r.verdict).toBe("drive_on");
    expect(r.reasons.join(" ").toLowerCase()).not.toMatch(
      /coolant|voltage|115/,
    );
  });
});
