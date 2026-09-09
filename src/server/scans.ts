/**
 * Scan server functions — Slice S3. Thin RPC stubs.
 *
 * Bundle-boundary rules (same as auth.ts): only `createServerFn` is
 * imported statically, plus types. The implementation (`scans-core.ts`,
 * which holds the Neon `sql()` handle) is loaded with DYNAMIC imports
 * inside each handler so it never reaches the client bundle. The OBD
 * drivers under `src/obd/` are pure client-side — never import them here.
 */
import { createServerFn } from "@tanstack/react-start";

function requireUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Sign in to save scans.");
  return user.id;
}

export type ScanSource = "live" | "demo" | "manual";

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

/** Vehicles belonging to the signed-in user, for the scan attach picker. */
export const listVehicles = createServerFn({ method: "GET" }).handler(
  async (): Promise<VehicleOption[]> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { listVehiclesCore } = await import("./scans-core");
    const user = await getCurrentUserCore();
    return listVehiclesCore(requireUserId(user));
  },
);

/** Minimal vehicle create inside the scan flow. */
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
    const { createVehicleCore } = await import("./scans-core");
    const user = await getCurrentUserCore();
    return createVehicleCore(requireUserId(user), data);
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
