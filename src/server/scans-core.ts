/**
 * Scan persistence — Slice S3 server implementation.
 *
 * IMPORTANT — module-boundary contract (same as auth-core.ts): this module
 * imports the Neon `sql()` handle and must ONLY be imported dynamically
 * from inside a `createServerFn` handler body (see `scans.ts`). If it ever
 * ends up in the client bundle the build breaks.
 *
 * Every query is user-scoped: the caller's user id rides every WHERE and
 * every INSERT, and the composite FKs (002 migration) physically refuse a
 * cross-user attach on top of that.
 */

import { sql } from "../db";
import { isDtcStatus, normaliseDtc } from "../lib/dtc";

const db = sql();

export type ScanSource = "live" | "demo" | "manual";

export type PersistedCode = {
  id: string;
  code: string;
  status: "stored" | "pending" | "permanent";
  createdAt: string;
};

export type PersistedScan = {
  id: string;
  source: ScanSource;
  vehicleId: string | null;
  vin: string | null;
  createdAt: string;
  codes: PersistedCode[];
  catalogTitles: Record<string, string>;
};

function isScanSource(value: unknown): value is ScanSource {
  return value === "live" || value === "demo" || value === "manual";
}

type ValidatedCode = { code: string; status: "stored" | "pending" | "permanent" };

/**
 * Validate one client-supplied code row. Strict on purpose: a malformed code
 * is a client bug or tampering, and the database must never hold it.
 */
function validateCodeRow(
  row: unknown,
): ValidatedCode {
  if (typeof row !== "object" || row === null) {
    throw new Error("Each code needs a code and a status.");
  }
  const { code, status } = row as { code?: unknown; status?: unknown };
  const normal = normaliseDtc(code);
  if (!normal) throw new Error(`"${String(code)}" is not a valid fault code.`);
  if (!isDtcStatus(status)) throw new Error(`Status "${String(status)}" is not valid.`);
  return { code: normal, status };
}

function toPersistedScan(
  scanRow: {
    id: string;
    source: string;
    vehicle_id: string | null;
    created_at: unknown;
    raw_json: unknown;
  },
  codeRows: {
    id: string;
    code: string;
    status: string;
    created_at: unknown;
  }[],
  catalogRows: { code: string; title: string }[],
): PersistedScan {
  const raw = (scanRow.raw_json ?? {}) as { vin?: unknown };
  return {
    id: scanRow.id,
    source: isScanSource(scanRow.source) ? scanRow.source : "live",
    vehicleId: scanRow.vehicle_id,
    vin: typeof raw.vin === "string" ? raw.vin : null,
    createdAt: String(scanRow.created_at),
    codes: codeRows.map((c) => ({
      id: c.id,
      code: c.code,
      status: isDtcStatus(c.status) ? c.status : "stored",
      createdAt: String(c.created_at),
    })),
    catalogTitles: Object.fromEntries(catalogRows.map((c) => [c.code, c.title])),
  };
}

async function loadScanForUser(
  userId: string,
  scanId: string,
): Promise<PersistedScan | null> {
  const scans = await db<{
    id: string;
    source: string;
    vehicle_id: string | null;
    created_at: unknown;
    raw_json: unknown;
  }[]>`
    SELECT id, source, vehicle_id, created_at, raw_json
    FROM scans
    WHERE id = ${scanId} AND user_id = ${userId}`;
  if (scans.length === 0) return null;
  const scan = scans[0]!;
  const codes = await db<{
    id: string;
    code: string;
    status: string;
    created_at: unknown;
  }[]>`
    SELECT id, code, status, created_at
    FROM scan_codes
    WHERE scan_id = ${scan.id} AND user_id = ${userId}
    ORDER BY created_at ASC`;
  const catalog =
    codes.length === 0
      ? []
      : await db<{ code: string; title: string }[]>`
        SELECT code, title FROM dtc_catalog
        WHERE code IN (SELECT DISTINCT UNNEST(${codes.map((c) => c.code)}::text[]))`;
  return toPersistedScan(scan, codes, catalog);
}

/** Vehicles belonging to the caller — for the scan screen's attach picker. */
export async function listVehiclesCore(userId: string): Promise<
  { id: string; make: string | null; model: string | null; year: number | null }[]
> {
  const rows = await db<{
    id: string;
    make: string | null;
    model: string | null;
    year: number | null;
  }[]>`
    SELECT id, make, model, year FROM vehicles
    WHERE user_id = ${userId}
    ORDER BY created_at ASC`;
  return rows.map((r) => ({
    id: r.id,
    make: r.make,
    model: r.model,
    year: r.year,
  }));
}

/**
 * Minimal vehicle create inside the scan flow (S3 scope decision: scans may
 * also stay vehicle-less — full garage management is a later slice).
 */
export async function createVehicleCore(
  userId: string,
  input: { make: string; model: string; year: number | null },
): Promise<{ id: string }> {
  const make = input.make.trim().slice(0, 80);
  const model = input.model.trim().slice(0, 80);
  if (!make || !model) throw new Error("Make and model are required.");
  const year =
    input.year === null ||
    !Number.isInteger(input.year) ||
    input.year < 1980 ||
    input.year > new Date().getFullYear() + 1
      ? null
      : input.year;
  const rows = await db<{ id: string }[]>`
    INSERT INTO vehicles (user_id, make, model, year)
    VALUES (${userId}, ${make}, ${model}, ${year})
    RETURNING id`;
  return { id: rows[0]!.id };
}

/**
 * Persist a scan + its codes. The catalog is empty until S4 seeds it, so
 * titles are looked up but not invented — unknown codes come back with no
 * title and the UI says the meaning arrives in a future update.
 */
export async function saveScanCore(
  userId: string,
  input: {
    source: unknown;
    vehicleId: string | null;
    vin: string | null;
    codes: unknown;
  },
): Promise<PersistedScan> {
  if (!isScanSource(input.source)) {
    throw new Error(`Source "${String(input.source)}" is not valid.`);
  }
  if (!Array.isArray(input.codes)) {
    throw new Error("A scan needs a list of codes (possibly empty).");
  }
  const codes = input.codes.map(validateCodeRow);
  // A vehicle attach must belong to the caller; null means vehicle-less.
  let vehicleId: string | null = null;
  if (input.vehicleId !== null && input.vehicleId !== undefined) {
    if (typeof input.vehicleId !== "string") {
      throw new Error("Vehicle choice is not valid.");
    }
    const owned = await db<{ id: string }[]>`
      SELECT id FROM vehicles
      WHERE id = ${input.vehicleId} AND user_id = ${userId}`;
    if (owned.length === 0) throw new Error("Vehicle choice is not valid.");
    vehicleId = owned[0]!.id;
  }
  const vin =
    typeof input.vin === "string" && input.vin.trim().length > 0
      ? input.vin.trim().slice(0, 32)
      : null;
  const scans = await db<{ id: string }[]>`
    INSERT INTO scans (user_id, vehicle_id, source, raw_json)
    VALUES (${userId}, ${vehicleId}, ${input.source}, ${vin ? JSON.stringify({ vin }) : null}::jsonb)
    RETURNING id`;
  const scanId = scans[0]!.id;
  for (const c of codes) {
    await db`
      INSERT INTO scan_codes (scan_id, user_id, code, status)
      VALUES (${scanId}, ${userId}, ${c.code}, ${c.status})`;
  }
  const saved = await loadScanForUser(userId, scanId);
  if (!saved) throw new Error("The scan was saved but could not be re-read.");
  return saved;
}

/** Latest scan with its codes — the scan screen's "last result" view. */
export async function latestScanCore(
  userId: string,
): Promise<PersistedScan | null> {
  const scans = await db<{ id: string }[]>`
    SELECT id FROM scans
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 1`;
  if (scans.length === 0) return null;
  return loadScanForUser(userId, scans[0]!.id);
}

/** One scan by id — only when it belongs to the caller. */
export async function getScanCore(
  userId: string,
  scanId: string,
): Promise<PersistedScan | null> {
  if (typeof scanId !== "string" || scanId.length === 0) return null;
  return loadScanForUser(userId, scanId);
}

/**
 * Record that the caller cleared the codes for a scan. Clearing is FREE
 * FOREVER — this endpoint takes no payment, checks no entitlement, and the
 * UI shows no lock anywhere near it. `cleared_at` is informational only;
 * codes stay on the row as the read record (S5 "Verify" re-scans later).
 */
export async function recordClearCore(
  userId: string,
  scanId: string,
): Promise<{ ok: true }> {
  if (typeof scanId !== "string" || scanId.length === 0) {
    throw new Error("Scan is not valid.");
  }
  const scans = await db<{ id: string }[]>`
    UPDATE scans SET raw_json = COALESCE(raw_json, '{}'::jsonb) || '{"cleared": true}'::jsonb
    WHERE id = ${scanId} AND user_id = ${userId}
    RETURNING id`;
  if (scans.length === 0) throw new Error("Scan not found.");
  return { ok: true };
}
