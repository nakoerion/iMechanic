/**
 * Scan server functions — Slice S3. Thin RPC stubs.
 *
 * Bundle-boundary rules (same as auth.ts): only `createServerFn` is
 * imported statically, plus types. The implementation (`scans-core.ts`,
 * which holds the Neon `sql()` handle) is loaded with DYNAMIC imports
 * inside each handler so it never reaches the client bundle. The OBD
 * drivers under `src/obd/` are pure client-side — never import them here.
 *
 * S6d — the plan boundary is enforced HERE, not in the screens:
 * `listScans` / `listVehicles` return a `PlanPage` (the rows the caller's plan
 * may see + honest counts) and `createVehicle` asks the same gate the UI asks,
 * so a signed-in free user cannot get past the paywall by calling a server
 * function directly. Entitlement itself is never reinvented here: both sides
 * ask S6a's `hasActivePro`. The free surfaces this file serves — saving,
 * reading and clearing codes — are untouched and ungated.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  limitScansForPlan,
  limitVehiclesForPlan,
  vehicleCreateGate,
  type PlanPage,
} from "../lib/pro-limits";
import type { ScanSource, ScanSummary } from "../lib/scan-summary";

function requireUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Sign in to save scans.");
  return user.id;
}

/**
 * The empty page a signed-out caller gets from a list read. Not an error: a
 * signed-out list is simply empty, and the Pro note must not appear for it
 * (nothing is hidden from someone with nothing).
 */
function emptyPage<T>(): PlanPage<T> {
  return { visible: [], hiddenCount: 0, limited: false, total: 0 };
}

/** Re-exported so screens import every scan type from one place. */
export type {
  ScanSource,
  ScanSummary,
  ScanSummaryCode,
} from "../lib/scan-summary";

export type PersistedCode = {
  id: string;
  code: string;
  status: "stored" | "pending" | "permanent";
  createdAt: string;
};

export type PersistedCodeDetail = PersistedCode & {
  title: string | null;
  genericCause: string | null;
  system: string | null;
  severity: "drive_on" | "repair_soon" | "stop_driving";
  known: boolean;
};

export type PersistedDiagnosis = {
  id: string;
  verdict: "drive_on" | "repair_soon" | "stop_driving";
  summary: string;
  reasons: string[];
  source: "rules";
  confidence: number;
  /**
   * S5 Decide fields — family + persisted band midpoints + full bands in
   * the caller's market. The UI renders bands via formatMoneyRange with
   * COST_ESTIMATE_NOTE; workshopRecommended is a safety routing (never a
   * lock/badge/upsell).
   */
  repairFamily: import("../lib/cost").RepairFamily;
  costDiyCents: number | null;
  costShopCents: number | null;
  currency: "EUR" | "GBP" | "ALL" | null;
  diyLowCents: number;
  diyHighCents: number;
  shopLowCents: number;
  shopHighCents: number;
  workshopRecommended: boolean;
};

/** The AI root-cause row (diagnoses source='ai') — the Pro layer. */
export type PersistedAiDiagnosis = {
  id: string;
  rootCause: string | null;
  reasoning: string | null;
  confidence: number | null;
  summary: string | null;
  causes: { cause: string; confidence: number }[] | null;
};

export type PersistedScan = {
  id: string;
  source: ScanSource;
  vehicleId: string | null;
  vin: string | null;
  createdAt: string;
  codes: PersistedCode[];
  catalogTitles: Record<string, string>;
  codeDetails: PersistedCodeDetail[];
  diagnosis: PersistedDiagnosis | null;
  /** The Pro AI root cause (source='ai' row) — null until requested. */
  aiDiagnosis: PersistedAiDiagnosis | null;
};

export type VehicleOption = {
  id: string;
  make: string | null;
  model: string | null;
  year: number | null;
};

/**
 * Vehicles belonging to the signed-in user, for the scan attach picker and the
 * garage screen. FREE tier gets at most FREE_VEHICLES rows (newest-first order
 * preserved), Pro gets all of them; `hiddenCount`/`total` carry the honest
 * counts so the UI can say "N saved but not shown" rather than silently
 * shortening the list.
 */
export const listVehicles = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlanPage<VehicleOption>> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { listVehiclesCore } = await import("./scans-core");
    const { hasActivePro } = await import("./pro-core");
    const user = await getCurrentUserCore();
    const userId = requireUserId(user);
    const [vehicles, pro] = await Promise.all([
      listVehiclesCore(userId),
      hasActivePro(userId),
    ]);
    return limitVehiclesForPlan(vehicles, pro);
  },
);

/**
 * Minimal vehicle create inside the scan flow.
 *
 * S6d — the free garage limit is enforced server-side, at the write, with the
 * same rule the UI uses before showing the form (`vehicleCreateGate`). A free
 * user who already holds their one vehicle is refused honestly; a Pro user is
 * unaffected. The refusal is a plain Error with the user-facing sentence from
 * `APP_COPY.pro`, so a bypass attempt is told why rather than silently failing.
 */
export const createVehicle = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("Make and model are required.");
    }
    const { make, model, year } = input as {
      make?: unknown;
      model?: unknown;
      year?: unknown;
    };
    if (typeof make !== "string" || typeof model !== "string") {
      throw new Error("Make and model are required.");
    }
    const parsedYear =
      year === null || year === undefined || year === ""
        ? null
        : typeof year === "number"
          ? year
          : Number(year);
    return { make, model, year: parsedYear };
  })
  .handler(async ({ data }): Promise<{ id: string }> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { countVehiclesCore, createVehicleCore } = await import("./scans-core");
    const { hasActivePro } = await import("./pro-core");
    const { APP_COPY } = await import("../lib/copy");
    const user = await getCurrentUserCore();
    const userId = requireUserId(user);
    const gate = vehicleCreateGate(
      await hasActivePro(userId),
      await countVehiclesCore(userId),
    );
    if (!gate.allowed) {
      throw new Error(APP_COPY.pro.vehicleLimitRefusal);
    }
    return createVehicleCore(userId, data);
  });

/** Persist a scan + its codes (+ the live transcript for live scans). */
export const saveScan = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("A scan needs a source and a list of codes.");
    }
    const { source, vehicleId, vin, codes, transcript } = input as {
      source?: unknown;
      vehicleId?: unknown;
      vin?: unknown;
      codes?: unknown;
      transcript?: unknown;
    };
    return {
      source,
      vehicleId:
        vehicleId === null || vehicleId === undefined
          ? null
          : String(vehicleId),
      vin: typeof vin === "string" ? vin : null,
      codes,
      // Passed through as-is; saveScanCore validates + bounds it, and only
      // honours it for source='live'. Demo/manual never send one.
      transcript: transcript ?? null,
    };
  })
  .handler(async ({ data }): Promise<PersistedScan> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { saveScanCore } = await import("./scans-core");
    const user = await getCurrentUserCore();
    return saveScanCore(requireUserId(user), data);
  });

/** Latest scan with its codes — the scan screen's "last result" view. */
export const latestScan = createServerFn({ method: "GET" }).handler(
  async (): Promise<PersistedScan | null> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { latestScanCore } = await import("./scans-core");
    const user = await getCurrentUserCore();
    if (!user) return null;
    return latestScanCore(user.id);
  },
);

/**
 * The caller's scans, newest first — the History screen's list. Empty (never
 * an error) when the user has no scans yet. Unlike `latestScan` this returns
 * LEAN rows: id, source, createdAt, verdict, codeCount and the codes'
 * plain-English titles.
 *
 * S6d — the plan limit is applied HERE: a free user gets the FREE_SCAN_HISTORY
 * newest scans and honest counts (nothing is returned that the screen would
 * then refuse to render), a Pro user gets everything. Truncation is never
 * silent: `hiddenCount` is what the screen turns into its "older scans are
 * saved but not shown" note, and `total` counts every scan the user holds even
 * if the read itself stopped at SCAN_HISTORY_LIMIT.
 */
export const listScans = createServerFn({ method: "GET" }).handler(
  async (): Promise<PlanPage<ScanSummary>> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { countScansCore, listScansCore } = await import("./scans-core");
    const { hasActivePro } = await import("./pro-core");
    const user = await getCurrentUserCore();
    // Signed-out callers get an empty list, not an error: the History screen
    // is behind the /app auth guard anyway, and an exception here would only
    // render a spurious error state.
    if (!user) return emptyPage<ScanSummary>();
    const [scans, pro, total] = await Promise.all([
      listScansCore(user.id),
      hasActivePro(user.id),
      countScansCore(user.id),
    ]);
    return limitScansForPlan(scans, pro, total);
  },
);

/** One scan by id — only when it belongs to the caller. */
export const getScan = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("Scan is not valid.");
    }
    const { id } = input as { id?: unknown };
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Scan is not valid.");
    }
    return { id };
  })
  .handler(async ({ data }): Promise<PersistedScan | null> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { getScanCore } = await import("./scans-core");
    const user = await getCurrentUserCore();
    if (!user) return null;
    return getScanCore(user.id, data.id);
  });

/**
 * Record that the caller cleared the codes for a scan. FREE FOREVER — no
 * payment, no entitlement check, no lock anywhere near the UI.
 */
export const recordClear = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("Scan is not valid.");
    }
    const { id } = input as { id?: unknown };
    if (typeof id !== "string" || id.length === 0) {
      throw new Error("Scan is not valid.");
    }
    return { id };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { recordClearCore } = await import("./scans-core");
    const user = await getCurrentUserCore();
    return recordClearCore(requireUserId(user), data.id);
  });
