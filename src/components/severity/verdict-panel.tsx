import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { APP_COPY } from "../../lib/copy";
import { severityClasses, severityCopy } from "../../lib/severity";
import type { Severity } from "../../lib/severity";
import { InfoIcon } from "../icons";
import { SeverityIcon } from "../ui/severity-badge";

/**
 * VerdictPanel — the honest answer to "can I drive this?".
 *
 * NEVER GATED. The rules-engine severity verdict is free forever: the
 * marketing page publicly promises "severity verdict on standard code
 * lookups" in the free tier and we honour what we published. Do not add a
 * `locked` prop, a blur, a fade-out, or a Pro badge to this component. What is
 * Pro is the *AI root cause, its reasoning and its confidence* — that is a
 * separate component and it sits below this panel, never on top of it.
 *
 * Three redundant signals + the unconditional 2px anchor border, at the
 * largest size in the app: this is the thing someone reads at a glance,
 * standing next to a running engine.
 */

export type VerdictSource = "rules" | "ai";

export function VerdictPanel({
  severity,
  summary,
  source = "rules",
  aiUnavailable = false,
  codeCount,
  actions,
  className,
}: {
  severity: Severity;
  /** One plain-English sentence. Defaults to the standard severity guidance. */
  summary?: string;
  source?: VerdictSource;
  /** True when the AI layer could not be reached — say so, never fabricate. */
  aiUnavailable?: boolean;
  codeCount?: number;
  /** Free next-step actions. Never a paywall CTA. */
  actions?: ReactNode;
  className?: string;
}) {
  const c = severityClasses(severity);
  const copy = severityCopy(severity);
  const sourceLine =
    source === "ai" && !aiUnavailable
      ? APP_COPY.verdict.sourceAi
      : APP_COPY.verdict.sourceRules;

  return (
    <section
      aria-label={APP_COPY.verdict.heading}
      className={cn("rounded-card border-2 shadow-sm", c.border, c.fill, className)}
    >
      <div className="p-5">
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wider opacity-80",
            c.text,
          )}
        >
          {APP_COPY.verdict.heading}
        </p>

        <div className="mt-3 flex items-start gap-4">
          {/* Signal 2: silhouette, on a solid chip so it reads from a metre away. */}
          <span
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
              c.solid,
              c.onSolid,
            )}
          >
            <SeverityIcon severity={severity} className="h-8 w-8" />
          </span>

          <div className="min-w-0">
            {/* Signal 3: the words. */}
            <h2 className={cn("text-2xl font-extrabold leading-tight tracking-tight", c.text)}>
              <span className="sr-only">{copy.announce}</span>
              <span aria-hidden>{copy.label}</span>
            </h2>
            <p className={cn("mt-1 text-sm leading-relaxed", c.text)}>
              {summary ?? copy.guidance}
            </p>
          </div>
        </div>

        {typeof codeCount === "number" && (
          <p className={cn("mt-4 text-sm font-semibold", c.text)}>
            {APP_COPY.verdict.codesLabel}: {codeCount}
          </p>
        )}

        {actions && <div className="mt-5 space-y-2">{actions}</div>}
      </div>

      <div
        className={cn(
          "flex flex-col gap-1.5 border-t-2 px-5 py-3 text-xs leading-snug",
          c.border,
          c.text,
        )}
      >
        <p className="flex items-start gap-1.5 font-medium">
          <InfoIcon className="mt-px h-3.5 w-3.5 shrink-0" />
          {sourceLine}
        </p>
        {aiUnavailable && (
          <p className="font-medium">{APP_COPY.verdict.aiUnavailable}</p>
        )}
        <p className="opacity-80">{APP_COPY.verdict.freeNote}</p>
      </div>
    </section>
  );
}
