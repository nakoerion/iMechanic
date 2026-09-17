/**
 * Scan history summary — pure unit tests, NO database, NO network.
 *
 * Covers what the History screen depends on (phase 2a):
 *  - the caller's scan order is preserved (newest first comes from SQL)
 *  - demo stays demo (never relabelled as a real adapter scan)
 *  - a verdict is only one of the three engine values; anything else is null
 *  - codes are grouped per scan, deduped, given their catalog title, and
 *    capped so a huge scan cannot blow up the list payload
 *  - timestamps come back as strings (a JS Date would not render in React)
 *  - an empty database yields an empty list, not an error
 */
import { describe, expect, it } from "vitest";
import {
  MAX_CODES_PER_SCAN,
  normaliseScanSource,
  summariseScans,
} from "../src/lib/scan-summary";

const scan = (
  id: string,
  source = "live",
  created_at: unknown = "2026-01-01T00:00:00.000Z",
) => ({
  id,
  source,
  created_at,
});

describe("summariseScans", () => {
  it("returns an empty list for a caller with no scans", () => {
    expect(summariseScans([], [], [])).toEqual([]);
  });

  it("keeps the input (newest-first) order and coerces dates to strings", () => {
    const rows = summariseScans(
      [
        scan("newest", "live", new Date("2026-03-02T10:00:00.000Z")),
        scan("older", "live", new Date("2026-03-01T10:00:00.000Z")),
      ],
      [],
      [],
    );
    expect(rows.map((r) => r.id)).toEqual(["newest", "older"]);
    expect(rows[0]!.createdAt).toBe("2026-03-02T10:00:00.000Z");
    expect(typeof rows[0]!.createdAt).toBe("string");
  });

  it("carries the source through, so a demo scan stays labelled demo", () => {
    const rows = summariseScans(
      [scan("a", "demo"), scan("b", "manual"), scan("c", "live")],
      [],
      [],
    );
    expect(rows.map((r) => r.source)).toEqual(["demo", "manual", "live"]);
  });

  it("never invents a verdict: unknown or missing values become null", () => {
    const rows = summariseScans(
      [scan("a"), scan("b"), scan("c")],
      [],
      [
        { scan_id: "a", verdict: "stop_driving" },
        { scan_id: "b", verdict: "unknown" },
      ],
    );
    expect(rows[0]!.verdict).toBe("stop_driving");
    expect(rows[1]!.verdict).toBeNull();
    expect(rows[2]!.verdict).toBeNull();
  });

  it("keeps the first (newest) rules verdict per scan", () => {
    const rows = summariseScans(
      [scan("a")],
      [],
      [
        { scan_id: "a", verdict: "repair_soon" },
        { scan_id: "a", verdict: "drive_on" },
      ],
    );
    expect(rows[0]!.verdict).toBe("repair_soon");
  });

  it("groups, dedupes and titles the codes of each scan", () => {
    const rows = summariseScans(
      [scan("a"), scan("b")],
      [
        { scan_id: "a", code: "P0301" },
        { scan_id: "a", code: "P0420" },
        { scan_id: "a", code: "P0301" },
        { scan_id: "b", code: "P0999" },
      ],
      [],
      {
        P0301: "Cylinder 1 misfire detected",
        P0420: "Catalyst efficiency low",
      },
    );
    expect(rows[0]!.codeCount).toBe(2);
    expect(rows[0]!.codes).toEqual([
      { code: "P0301", title: "Cylinder 1 misfire detected" },
      { code: "P0420", title: "Catalyst efficiency low" },
    ]);
    // A code we have no catalog entry for keeps a null title — the UI says
    // "not in our catalog" rather than inventing a meaning.
    expect(rows[1]!.codeCount).toBe(1);
    expect(rows[1]!.codes[0]).toEqual({ code: "P0999", title: null });
  });

  it("caps the listed codes but keeps the true count", () => {
    const many = Array.from({ length: MAX_CODES_PER_SCAN + 3 }, (_, i) => ({
      scan_id: "a",
      code: `P0${String(100 + i)}`,
    }));
    const rows = summariseScans([scan("a")], many, []);
    expect(rows[0]!.codeCount).toBe(MAX_CODES_PER_SCAN + 3);
    expect(rows[0]!.codes).toHaveLength(MAX_CODES_PER_SCAN);
  });

  it("normalises an unrecognised source away from 'live'", () => {
    expect(normaliseScanSource("demo")).toBe("demo");
    expect(normaliseScanSource("nonsense")).not.toBe("live");
  });
});
