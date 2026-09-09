/**
 * S5 repair server functions — Decide + Act + Verify. Thin RPC stubs.
 *
 * Bundle-boundary rules (same as scans.ts/ai.ts): only `createServerFn` is
 * imported statically, plus types. The implementation (`repair-core.ts`,
 * which holds the Neon `sql()` handle) is loaded with DYNAMIC imports
 * inside each handler so it never reaches the client bundle.
 *
 * No paywall, no gating here (S6): costs are the free Decide surface, the
 * guides are general safety-conscious guidance, and verification is a
 * plain re-scan comparison. The workshop recommendation is a safety
 * routing, never an upsell — no lock, no badge near it.
 */
import { createServerFn } from "@tanstack/react-start";

function requireUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Sign in to track repairs.");
  return user.id;
}

export type JobState = "planned" | "in_progress" | "done" | "verified";

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

export type VerifyResult =
  | { verified: true; job: PersistedRepairJob }
  | { verified: false; stillPresent: string[] };

/** Start (or resume) a repair job for one of the caller's diagnoses rows. */
export const startRepairJob = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("Diagnosis is not valid.");
    }
    const { diagnosisId } = input as { diagnosisId?: unknown };
    if (typeof diagnosisId !== "string" || diagnosisId.length === 0) {
      throw new Error("Diagnosis is not valid.");
    }
    return { diagnosisId };
  })
  .handler(async ({ data }): Promise<PersistedRepairJob> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { startRepairJobCore } = await import("./repair-core");
    const user = await getCurrentUserCore();
    return startRepairJobCore(requireUserId(user), data.diagnosisId);
  });

/**
 * Move a repair job forward (planned → in_progress → done). Forward-only;
 * `verified` is rejected — verification goes through verifyRepairJob.
 */
export const advanceRepairJob = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("Repair job is not valid.");
    }
    const { jobId, state } = input as { jobId?: unknown; state?: unknown };
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new Error("Repair job is not valid.");
    }
    if (typeof state !== "string" || state.length === 0) {
      throw new Error("Repair state is not valid.");
    }
    return { jobId, state };
  })
  .handler(async ({ data }): Promise<PersistedRepairJob> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { advanceRepairJobCore } = await import("./repair-core");
    const user = await getCurrentUserCore();
    return advanceRepairJobCore(requireUserId(user), data.jobId, data.state);
  });

/**
 * Verify a repair job against a NEW re-scan: the job flips to verified
 * only when none of the original scan's codes are still present.
 */
export const verifyRepairJob = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("Repair job is not valid.");
    }
    const { jobId, scanId } = input as { jobId?: unknown; scanId?: unknown };
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new Error("Repair job is not valid.");
    }
    if (typeof scanId !== "string" || scanId.length === 0) {
      throw new Error("Scan is not valid.");
    }
    return { jobId, scanId };
  })
  .handler(async ({ data }): Promise<VerifyResult> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const { verifyRepairJobCore } = await import("./repair-core");
    const user = await getCurrentUserCore();
    return verifyRepairJobCore(requireUserId(user), data.jobId, data.scanId);
  });
