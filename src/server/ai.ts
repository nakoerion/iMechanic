/**
 * AI diagnosis server function — Slice S4 backend. Thin RPC stub.
 *
 * Bundle-boundary rules (same as scans.ts): only `createServerFn` is
 * imported statically, plus types. The implementations (`ai-core.ts` for
 * the Anthropic call, `scans-core.ts` for persistence — both hold secrets
 * or the Neon handle) are loaded with DYNAMIC imports inside the handler
 * so they never reach the client bundle.
 *
 * Contract: getAiDiagnosis({ scanId }) resolves the caller, loads the
 * scan's context (codes + catalog + vehicle + rules verdict), returns the
 * existing source='ai' row when one exists (idempotency — no double
 * billing), otherwise calls the LLM. On success it inserts a second
 * diagnoses row with source='ai' and the SAME verdict as the rules row
 * (the AI never overrides the free safety verdict). On any AI failure it
 * returns { available: false, reason } and writes nothing.
 */
import { createServerFn } from "@tanstack/react-start";

function requireUserId(user: { id: string } | null): string {
  if (!user) throw new Error("Sign in to use AI diagnosis.");
  return user.id;
}

export type AiRankedCause = {
  cause: string;
  confidence: number;
};

export type AiDiagnosisResult =
  | {
      available: true;
      aiDiagnosis: {
        summary: string;
        rootCause: string;
        reasoning: string;
        confidence: number;
        causes: AiRankedCause[];
      };
    }
  | { available: false; reason: string };

/** AI root-cause diagnosis for one scan — Pro surface, no gating here (S6). */
export const getAiDiagnosis = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("Scan is not valid.");
    }
    const { scanId } = input as { scanId?: unknown };
    if (typeof scanId !== "string" || scanId.length === 0) {
      throw new Error("Scan is not valid.");
    }
    return { scanId };
  })
  .handler(async ({ data }): Promise<AiDiagnosisResult> => {
    const { getCurrentUserCore } = await import("./auth-core");
    const {
      loadAiContextCore,
      getExistingAiRowCore,
      insertAiDiagnosisCore,
      serializeAiReasoning,
      getScanCore,
    } = await import("./scans-core");
    const { runAiDiagnosis } = await import("./ai-core");
    const user = await getCurrentUserCore();
    const userId = requireUserId(user);
    // Idempotency/cost guard first: an existing AI row is returned as-is,
    // before any LLM call, so a second request never double-bills.
    const existing = await getExistingAiRowCore(userId, data.scanId);
    if (existing) {
      const scan = await getScanCore(userId, data.scanId);
      const ai = scan?.aiDiagnosis;
      if (ai) {
        return {
          available: true,
          aiDiagnosis: {
            summary: ai.summary ?? "",
            rootCause: ai.rootCause ?? "",
            reasoning: ai.reasoning ?? "",
            confidence: ai.confidence ?? 50,
            causes: ai.causes ?? [],
          },
        };
      }
      // Row vanished between the two reads — fall through to a fresh call.
    }
    // Load the scan context (user-scoped; null = not the caller's scan).
    const context = await loadAiContextCore(userId, data.scanId);
    if (!context) throw new Error("Scan not found.");
    const result = await runAiDiagnosis({
      codes: context.codes,
      vehicle: context.vehicle,
      rulesVerdict: context.rulesVerdict,
      rulesSummary: context.rulesSummary,
      rulesReasons: context.rulesReasons,
    });
    if (!result.available) {
      // Honest fallback: say so, write nothing.
      return { available: false, reason: result.reason };
    }
    const ai = result.aiDiagnosis;
    const { attachCostsCore } = await import("./repair-core");
    const aiId = await insertAiDiagnosisCore(userId, data.scanId, context.rulesVerdict, {
      rootCause: ai.rootCause,
      reasoning: serializeAiReasoning(ai),
      confidence: ai.confidence,
    });
    // S5 Decide: the AI row gets the same cost treatment as the rules row
    // (family + midpoints + currency). attachCostsCore derives everything
    // from the scan's codes + verdict, so the rows agree.
    await attachCostsCore(userId, aiId);
    return { available: true, aiDiagnosis: ai };
  });
