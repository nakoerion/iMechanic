/**
 * Scan-history summary — the pure mapper behind the History screen (S6 phase
 * 2a). It holds NO `sql()` handle and renders nothing, so it is unit-testable
 * without a database (tests/scan-summary.test.ts) and safe to import from
 * `src/server/scans.ts` for the type alone.
 *
 * Two honesty rules it exists to enforce:
 *  1. `source` is carried through verbatim, so a demo scan can never be
 *     presented as a real adapter scan.
 *  2. A verdict is only ever one of the three rules-engine values. Anything
 *     else becomes `null`, which the UI renders as "not assessed" — the
 *     mapper never invents a verdict to fill the space.
 */

import type { Verdict } from "./diagnosis";

export type ScanSource = "live" | "demo" | "manual";

export type ScanSummaryCode = {
  code: string;
  /** Plain-English meaning from `dtc_catalog`, or null when unknown. */
  title: string | null;
};

export type ScanSummary = {
  id: string;
  source: ScanSource;
  /** ISO-ish timestamp. Always a string — a JS Date will not render in React. */
  createdAt: string;
  /** The free rules-engine verdict, or null when the scan has no rules row. */
  verdict: Verdict | null;
  /** How many codes the scan actually read (may exceed `codes.length`). */
  codeCount: number;
  /** Per-code meaning, capped for list rendering (see MAX_CODES_PER_SCAN). */
  codes: ScanSummaryCode[];
};

/**
 * A list row shows a handful of codes; a scan read from a real car can carry
 * more. The cap keeps the payload bounded, and `codeCount` still tells the
 * whole truth so the UI can say "+N more".
 */
export const MAX_CODES_PER_SCAN = 12;

/** Number of scans the History screen fetches (newest first). */
export const SCAN_HISTORY_LIMIT = 50;

export function isVerdict(value: unknown): value is Verdict {
  return (
    value === "drive_on" || value === "repair_soon" || value === "stop_driving"
  );
}

/**
 * Timestamps arrive from Neon as JS `Date`s (see src/db.ts) — React refuses
 * to render one, and `<time dateTime>` needs a machine-readable value, so
 * every one is normalised to an ISO string. A value that cannot be parsed is
 * passed through as-is rather than invented into a fake date.
 */
export function toIsoString(value: unknown): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  }
  if (typeof value === "number") {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime())
      ? String(value)
      : fromNumber.toISOString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toISOString();
  }
  return String(value);
}

/**
 * `scans.source` is CHECK-constrained in Postgres, so the fallback is
 * unreachable in practice. It deliberately does NOT default to "live": an
 * unrecognised value must never be shown as a read from a real adapter.
 */
export function normaliseScanSource(value: unknown): ScanSource {
  return value === "live" || value === "demo" || value === "manual"
    ? value
    : "manual";
}

export type ScanSummaryRow = {
  id: string;
  source: string;
  created_at: unknown;
};

export type ScanSummaryCodeRow = {
  scan_id: string;
  code: string;
};

export type ScanSummaryVerdictRow = {
  scan_id: string;
  verdict: string;
};

/**
 * Assemble one summary per scan row, preserving the input order (the SQL
 * already returns them newest-first).
 *
 * `verdictRows` must be ordered newest-first per scan; the first row seen for
 * a scan wins, which mirrors "the latest rules diagnosis for this scan".
 */
export function summariseScans(
  scanRows: ScanSummaryRow[],
  codeRows: ScanSummaryCodeRow[],
  verdictRows: ScanSummaryVerdictRow[],
  catalogTitles: Record<string, string> = {},
): ScanSummary[] {
  const codesByScan = new Map<string, ScanSummaryCode[]>();
  for (const row of codeRows) {
    const list = codesByScan.get(row.scan_id) ?? [];
    // A repeated code is one fact, not two rows on the screen.
    if (!list.some((c) => c.code === row.code)) {
      list.push({ code: row.code, title: catalogTitles[row.code] ?? null });
    }
    codesByScan.set(row.scan_id, list);
  }

  const verdictByScan = new Map<string, Verdict>();
  for (const row of verdictRows) {
    if (!verdictByScan.has(row.scan_id) && isVerdict(row.verdict)) {
      verdictByScan.set(row.scan_id, row.verdict);
    }
  }

  return scanRows.map((scan) => {
    const codes = codesByScan.get(scan.id) ?? [];
    return {
      id: scan.id,
      source: normaliseScanSource(scan.source),
      createdAt: toIsoString(scan.created_at),
      verdict: verdictByScan.get(scan.id) ?? null,
      codeCount: codes.length,
      codes: codes.slice(0, MAX_CODES_PER_SCAN),
    };
  });
}
