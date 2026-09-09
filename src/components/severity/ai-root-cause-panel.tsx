import { useState } from "react";
import { InfoIcon, SparkIcon } from "../icons";
import { Button } from "../ui/button";
import { APP_COPY } from "../../lib/copy";
import { getAiDiagnosis } from "../../server/ai";
import type { AiDiagnosisResult } from "../../server/ai";

/**
 * AiRootCausePanel — the Pro AI root-cause surface (S4 UI).
 *
 * Sits BELOW the free `VerdictPanel` in the scan result view. It never blurs,
 * dims, badges, or locks anything above it — the entitlement gate is S6's
 * job, not this component's (AGENTS.md: free tier is sacred).
 *
 * Explicit trigger only: each AI call costs money and the feature is Pro, so
 * nothing fires on mount. The backend is idempotent (repeat calls return the
 * persisted row), but the user still presses the button once per scan.
 *
 * States:
 *   idle        — plain trigger button + short "Pro" note. No lock icon,
 *                 no blur, no countdown, no fake urgency.
 *   loading     — spinner + "Thinking…" text.
 *   ready       — summary, root cause, Confidence %, reasoning, ranked
 *                 causes as an ordered list (backend already orders
 *                 cheapest-to-confirm-first — preserved as-is).
 *   unavailable — the backend's `reason` rendered VERBATIM in a neutral
 *                 info style. Never invent or show a diagnosis here.
 *   error       — transport/validator failure (not an AI verdict): honest
 *                 note + retry. The free verdict above is unaffected.
 */
type PanelState = "idle" | "loading" | "ready" | "unavailable" | "error";

export function AiRootCausePanel({
  scanId,
  initial,
}: {
  scanId: string;
  /**
   * Already-persisted AI row (`PersistedScan.aiDiagnosis`). When present the
   * panel renders it with NO network call — the user asked once, the backend
   * stored it, and repeat views must not re-fire. No `initial` means no row
   * exists yet, so the panel starts idle behind the explicit trigger.
   */
  initial?: {
    summary?: string | null;
    rootCause?: string | null;
    reasoning?: string | null;
    confidence?: number | null;
    causes?: { cause: string; confidence: number }[] | null;
  } | null;
}) {
  const t = APP_COPY.aiRootCause;
  const ready = initial && initial.rootCause ? true : false;
  const [state, setState] = useState<PanelState>(ready ? "ready" : "idle");
  const [ai, setAi] = useState<
    Extract<AiDiagnosisResult, { available: true }>["aiDiagnosis"] | null
  >(
    ready
      ? {
          summary: initial!.summary ?? "",
          rootCause: initial!.rootCause ?? "",
          reasoning: initial!.reasoning ?? "",
          confidence: initial!.confidence ?? 50,
          causes: initial!.causes ?? [],
        }
      : null,
  );
  const [reason, setReason] = useState<string>("");

  async function request() {
    setState("loading");
    try {
      const result = await getAiDiagnosis({ data: { scanId } });
      if (result.available) {
        setAi(result.aiDiagnosis);
        setState("ready");
      } else {
        // Honest fallback — the backend's reason, verbatim, nothing added.
        setReason(result.reason);
        setState("unavailable");
      }
    } catch {
      setState("error");
    }
  }

  if (state === "ready" && ai) {
    return (
      <section
        aria-label={t.heading}
        className="rounded-card border border-line bg-surface p-5 shadow-sm"
      >
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          <SparkIcon className="h-3.5 w-3.5" aria-hidden />
          {t.heading}
        </p>
        <p className="mt-2 text-base font-bold leading-snug text-fg">
          {ai.summary}
        </p>
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
            {t.rootCauseLabel}
          </p>
          <p className="mt-1 text-sm font-semibold leading-relaxed text-fg">
            {ai.rootCause}
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            {t.confidenceLabel}: {ai.confidence}%
          </p>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">
          {ai.reasoning}
        </p>
        {ai.causes.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {t.rankedCausesLabel}
            </p>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-5">
              {ai.causes.map((c, i) => (
                <li
                  key={i}
                  className="text-sm leading-relaxed text-fg-muted"
                >
                  {c.cause}{" "}
                  <span className="font-semibold text-fg">
                    {t.confidenceLabel}: {c.confidence}%
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </section>
    );
  }

  if (state === "unavailable") {
    return (
      <section
        aria-label={t.unavailableHeading}
        className="rounded-card border border-line bg-surface p-5 shadow-sm"
      >
        <p className="flex items-start gap-1.5 text-sm font-semibold text-fg">
          <InfoIcon className="mt-px h-4 w-4 shrink-0" aria-hidden />
          {t.unavailableHeading}
        </p>
        {/* Backend reason, verbatim — never replaced with a guess. */}
        <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{reason}</p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={request}
        >
          {t.triggerLabel}
        </Button>
      </section>
    );
  }

  if (state === "error") {
    return (
      <section
        aria-label={t.unavailableHeading}
        className="rounded-card border border-line bg-surface p-5 shadow-sm"
      >
        <p className="flex items-start gap-1.5 text-sm font-semibold text-fg">
          <InfoIcon className="mt-px h-4 w-4 shrink-0" aria-hidden />
          {t.errorNote}
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={request}
        >
          {t.triggerLabel}
        </Button>
      </section>
    );
  }

  return (
    <section
      aria-label={t.heading}
      className="rounded-card border border-line bg-surface p-5 shadow-sm"
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
        <SparkIcon className="h-3.5 w-3.5" aria-hidden />
        {t.heading}
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{t.proNote}</p>
      <Button
        variant="secondary"
        className="mt-3"
        onClick={request}
        loading={state === "loading"}
        loadingLabel={t.loadingLabel}
        aria-busy={state === "loading" || undefined}
      >
        {state === "loading" ? t.loadingLabel : t.triggerLabel}
      </Button>
    </section>
  );
}
