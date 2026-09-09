/**
 * S5 Decide + Act + Verify — server implementation.
 *
 * IMPORTANT — module-boundary contract (same as scans-core.ts): this module
 * imports the Neon `sql()` handle and must ONLY be imported dynamically
 * from inside a `createServerFn` handler body (see `repair.ts`). If it ever
 * ends up in the client bundle the build breaks.
 *
 * Every query is user-scoped: the caller's user id rides every WHERE and
 * every INSERT, and the composite FKs (002 migration) physically refuse a
 * cross-user attach on top of that.
 *
 * Three responsibilities:
 *   1. `attachCostsCore` — after a diagnoses row is written, compute its
 *      repair family + cost bands and UPDATE the row with the band
 *      MIDPOINTS + currency. The full band is derived at read time from
 *      the catalog (see scans-core toPersistedScan), so costs stay
 *      re-priceable without a backfill.
 *   2. Repair jobs — `startRepairJobCore` / `advanceRepairJobCore` over
 *      `repair_jobs` (+ `repair_steps` rows for the family). State machine:
 *      planned → in_progress → done → verified, forward-only, with
 *      `verified` reachable ONLY through `verifyRepairJobCore`.
 *   3. `verifyRepairJobCore` — the "confirm the code is gone" gate: a NEW
 *      caller-owned re-scan whose codes no longer contain any code from
 *      the job's original scan flips the job to verified and links it via
 *      `verified_by_scan_id`. Otherwise an honest `{ verified: false,
 *      stillPresent }` and the state is untouched.
 */

import { sql } from "../db";
import {
  bandMidpoint,
  estimateCosts,
  isWorkshopRecommended,
  repairFamilyFor,
  type RepairFamily,
} from "../lib/cost";
import { repairStepsFor } from "../lib/repair";

const db = sql();

export type JobState = "planned" | "in_progress" | "done" | "verified";

const JOB_ORDER: JobState[] = ["planned", "in_progress", "done", "verified"];

function isJobState(value: unknown): value is JobState {
  return (
    value === "planned" ||
    value === "in_progress" ||
    value === "done" ||
    value === "verified"
  );
}

export type PersistedRepairStep = {
  id: string;
  stepNo: number;
  title: string | null;
  body: string | null;
  tools: string[];
  estMinutes: number | null;
};

export type PersistedRepairJob = {
  id: string;
  diagnosisId: string;
  state: JobState;
  createdAt: string;
  updatedAt: string | null;
  verifiedByScanId: string | null;
  steps: PersistedRepairStep[];
};

function parseTools(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((t): t is string => typeof t === "string");
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((t): t is string => typeof t === "string");
      }
    } catch {
      // Legacy/plain-text tools cell — keep it as a single entry.
      return value.length > 0 ? [value] : [];
    }
  }
  return [];
}

async function userCountry(userId: string): Promise<string | null> {
  const rows = await db<{ country: string | null }[]>`
    SELECT country FROM users WHERE id = ${userId}`;
  return rows[0]?.country ?? null;
}

async function scanCodesFor(
  userId: string,
  scanId: string,
): Promise<{ code: string; status: string }[]> {
  const rows = await db<{ code: string; status: string }[]>`
    SELECT code, status FROM scan_codes
    WHERE scan_id = ${scanId} AND user_id = ${userId}
    ORDER BY created_at ASC`;
  return rows.map((r) => ({ code: r.code, status: r.status }));
}

/**
 * Compute family + bands for a diagnoses row and persist the midpoints.
 * Called from the rules-diagnosis save path in scans-core (and from the AI
 * insert path in ai.ts) — see APP_NOTES S5 for why midpoints, not bands.
 * Returns the family so callers can use it without recomputing.
 */
export async function attachCostsCore(
  userId: string,
  diagnosisId: string,
): Promise<{ family: RepairFamily }> {
  const rows = await db<{ scan_id: string; verdict: string }[]>`
    SELECT scan_id, verdict FROM diagnoses
    WHERE id = ${diagnosisId} AND user_id = ${userId}`;
  const row = rows[0];
  if (!row) throw new Error("Diagnosis not found.");
  const codes = await scanCodesFor(userId, row.scan_id);
  const family = repairFamilyFor({ codes, verdict: row.verdict });
  const est = estimateCosts(family, await userCountry(userId), {
    codes,
    verdict: row.verdict,
  });
  await db`
    UPDATE diagnoses
    SET cost_diy_cents = ${bandMidpoint(est.diyLowCents, est.diyHighCents)},
        cost_shop_cents = ${bandMidpoint(est.shopLowCents, est.shopHighCents)},
        currency = ${est.currency}
    WHERE id = ${diagnosisId} AND user_id = ${userId}`;
  return { family };
}

/**
 * Derive the read-time Decide fields for a diagnoses row: family (pure,
 * deterministic — identical inputs to write time, so always in agreement
 * with the persisted midpoints) + full bands from the catalog in the
 * caller's market. Exported for scans-core toPersistedScan.
 */
export async function decideFieldsFor(
  userId: string,
  codes: { code: string; status: string }[],
  verdict: string,
  persisted: {
    cost_diy_cents: number | null;
    cost_shop_cents: number | null;
    currency: string | null;
  },
): Promise<{
  family: RepairFamily;
  costDiyCents: number | null;
  costShopCents: number | null;
  currency: "EUR" | "GBP" | "ALL" | null;
  diyLowCents: number;
  diyHighCents: number;
  shopLowCents: number;
  shopHighCents: number;
  workshopRecommended: boolean;
}> {
  const family = repairFamilyFor({ codes, verdict });
  const est = estimateCosts(family, await userCountry(userId), {
    codes,
    verdict,
  });
  const currency =
    persisted.currency === "EUR" ||
    persisted.currency === "GBP" ||
    persisted.currency === "ALL"
      ? persisted.currency
      : est.currency;
  return {
    family,
    costDiyCents: persisted.cost_diy_cents,
    costShopCents: persisted.cost_shop_cents,
    currency,
    diyLowCents: est.diyLowCents,
    diyHighCents: est.diyHighCents,
    shopLowCents: est.shopLowCents,
    shopHighCents: est.shopHighCents,
    workshopRecommended: isWorkshopRecommended({ codes, verdict }),
  };
}

/* ------------------------------------------------------------------ */
/* Repair jobs                                                           */
/* ------------------------------------------------------------------ */

async function loadJobForUser(
  userId: string,
  jobId: string,
): Promise<PersistedRepairJob | null> {
  const jobs = await db<{
    id: string;
    diagnosis_id: string;
    state: string;
    created_at: unknown;
    updated_at: unknown;
    verified_by_scan_id: string | null;
  }[]>`
    SELECT id, diagnosis_id, state, created_at, updated_at, verified_by_scan_id
    FROM repair_jobs
    WHERE id = ${jobId} AND user_id = ${userId}`;
  const job = jobs[0];
  if (!job || !isJobState(job.state)) return null;
  const steps = await db<{
    id: string;
    step_no: number;
    title: string | null;
    body: string | null;
    tools: unknown;
    est_minutes: number | null;
  }[]>`
    SELECT id, step_no, title, body, tools, est_minutes FROM repair_steps
    WHERE diagnosis_id = ${job.diagnosis_id} AND user_id = ${userId}
    ORDER BY step_no ASC`;
  return {
    id: job.id,
    diagnosisId: job.diagnosis_id,
    state: job.state,
    createdAt: String(job.created_at),
    updatedAt: job.updated_at ? String(job.updated_at) : null,
    verifiedByScanId: job.verified_by_scan_id,
    steps: steps.map((s) => ({
      id: s.id,
      stepNo: s.step_no,
      title: s.title,
      body: s.body,
      tools: parseTools(s.tools),
      estMinutes: s.est_minutes,
    })),
  };
}

/**
 * Start (or resume) a repair job for one of the caller's diagnoses rows.
 * Idempotent: a still-open job for the same diagnosis is returned as-is
 * instead of duplicating rows. The guide's steps are inserted once per
 * diagnosis (as `repair_steps` rows); `tools` is stored as a JSON array
 * string in the legacy `text` column (parseTools decodes it on read).
 */
export async function startRepairJobCore(
  userId: string,
  diagnosisId: string,
): Promise<PersistedRepairJob> {
  if (typeof diagnosisId !== "string" || diagnosisId.length === 0) {
    throw new Error("Diagnosis is not valid.");
  }
  const diagnoses = await db<{ id: string; scan_id: string; verdict: string }[]>`
    SELECT id, scan_id, verdict FROM diagnoses
    WHERE id = ${diagnosisId} AND user_id = ${userId}`;
  const diagnosis = diagnoses[0];
  if (!diagnosis) throw new Error("Diagnosis not found.");
  const open = await db<{ id: string }[]>`
    SELECT id FROM repair_jobs
    WHERE diagnosis_id = ${diagnosisId} AND user_id = ${userId}
      AND state IN ('planned', 'in_progress', 'done')
    ORDER BY created_at DESC
    LIMIT 1`;
  if (open[0]) {
    const existing = await loadJobForUser(userId, open[0].id);
    if (existing) return existing;
  }
  const codes = await scanCodesFor(userId, diagnosis.scan_id);
  const family = repairFamilyFor({ codes, verdict: diagnosis.verdict });
  const created = await db<{ id: string }[]>`
    INSERT INTO repair_jobs (user_id, diagnosis_id, state)
    VALUES (${userId}, ${diagnosisId}, 'planned')
    RETURNING id`;
  const jobId = created[0]!.id;
  const already = await db<{ id: string }[]>`
    SELECT id FROM repair_steps
    WHERE diagnosis_id = ${diagnosisId} AND user_id = ${userId}
    LIMIT 1`;
  if (already.length === 0) {
    const steps = repairStepsFor(family);
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i]!;
      await db`
        INSERT INTO repair_steps (diagnosis_id, user_id, step_no, title, body, tools, est_minutes)
        VALUES (${diagnosisId}, ${userId}, ${i + 1}, ${s.title}, ${s.body}, ${JSON.stringify(s.tools)}, ${s.estMinutes})`;
    }
  }
  const job = await loadJobForUser(userId, jobId);
  if (!job) throw new Error("The repair job was created but could not be re-read.");
  return job;
}

/**
 * Move the caller's job forward. Forward-only: the next state must rank
 * above the current one, and `verified` is rejected here — verification
 * goes exclusively through verifyRepairJobCore (the re-scan gate).
 */
export async function advanceRepairJobCore(
  userId: string,
  jobId: string,
  state: unknown,
): Promise<PersistedRepairJob> {
  if (!isJobState(state)) throw new Error("Repair state is not valid.");
  if (state === "verified") {
    throw new Error("A job is verified by re-scanning, not by marking it done.");
  }
  const job = await loadJobForUser(userId, jobId);
  if (!job) throw new Error("Repair job not found.");
  if (JOB_ORDER.indexOf(state) <= JOB_ORDER.indexOf(job.state)) {
    throw new Error(`Cannot move a repair from ${job.state} to ${state}.`);
  }
  await db`
    UPDATE repair_jobs SET state = ${state}, updated_at = now()
    WHERE id = ${jobId} AND user_id = ${userId}`;
  const updated = await loadJobForUser(userId, jobId);
  if (!updated) throw new Error("Repair job not found.");
  return updated;
}

/**
 * The Verify gate. Requires a NEW scan (the re-scan) belonging to the
 * caller whose codes no longer contain ANY code from the job's original
 * scan (compared case-insensitively, any status — a fault that demoted
 * from stored to pending is still present). On success the job is marked
 * verified and linked via verified_by_scan_id; otherwise an honest
 * `{ verified: false, stillPresent }` and the state is untouched.
 */
export async function verifyRepairJobCore(
  userId: string,
  jobId: string,
  scanId: unknown,
): Promise<
  | { verified: true; job: PersistedRepairJob }
  | { verified: false; stillPresent: string[] }
> {
  if (typeof scanId !== "string" || scanId.length === 0) {
    throw new Error("Scan is not valid.");
  }
  const job = await loadJobForUser(userId, jobId);
  if (!job) throw new Error("Repair job not found.");
  if (job.state === "verified") {
    return { verified: true, job };
  }
  const diagnoses = await db<{ scan_id: string }[]>`
    SELECT scan_id FROM diagnoses
    WHERE id = ${job.diagnosisId} AND user_id = ${userId}`;
  const originalScanId = diagnoses[0]?.scan_id;
  if (!originalScanId) throw new Error("Diagnosis not found.");
  if (scanId === originalScanId) {
    throw new Error("Verification needs a new re-scan, not the original scan.");
  }
  const rescans = await db<{ id: string }[]>`
    SELECT id FROM scans WHERE id = ${scanId} AND user_id = ${userId}`;
  if (rescans.length === 0) throw new Error("Scan not found.");
  const original = await scanCodesFor(userId, originalScanId);
  const rescan = await scanCodesFor(userId, scanId);
  const rescanSet = new Set(rescan.map((c) => c.code.trim().toUpperCase()));
  const stillPresent = [
    ...new Set(
      original
        .map((c) => c.code.trim().toUpperCase())
        .filter((c) => c.length > 0 && rescanSet.has(c)),
    ),
  ];
  if (stillPresent.length > 0) {
    return { verified: false, stillPresent };
  }
  await db`
    UPDATE repair_jobs
    SET state = 'verified', verified_by_scan_id = ${scanId}, updated_at = now()
    WHERE id = ${jobId} AND user_id = ${userId}`;
  const updated = await loadJobForUser(userId, jobId);
  if (!updated) throw new Error("Repair job not found.");
  return { verified: true, job: updated };
}
