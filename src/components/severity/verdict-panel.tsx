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
 *
 * A2 material (motifs 1 "telltale lamp", 2 "backlit bezel", 7 "hazard rule"):
 *   - the severity chip is a ROUND LAMP — `rounded-full` with a 2px inset rim
 *     in the `on-*` role. The rim is not `*-border` because in this palette
 *     border and solid are the same hex, so a border-coloured rim on a solid
 *     lamp would be invisible (see the `ring` field in `lib/severity.ts`);
 *   - a 1px `--color-bezel` hairline runs along the card's top edge. Since A6
 *     this comes from the `shadow-card` elevation itself (an INSET shadow, so
 *     it hugs the anchor border exactly as the old explicit 1px div did) —
 *     one model for every card, no per-component rim markup;
 *   - `stop_driving` — and only `stop_driving` — carries a 4px
 *     `--color-danger-solid` hazard rule across the card top. It is the one
 *     place in the app that rule may appear.
 * All three are static: no motion, no glow, no dimming. Nothing above is
 * gated, and the glyphs, hexes and 2px anchor border are untouched.
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
  /* Hazard rule: stop_driving only. Decorative — the verdict is already
     announced by the words, so this adds no information to a screen reader. */
  const hazard = severity === "stop_driving";

  return (
    <section
      aria-label={APP_COPY.verdict.heading}
      className={cn(
        /* overflow-hidden keeps a flush top rule inside the card radius. */
        "overflow-hidden rounded-card border-2 shadow-card",
        c.border,
        c.fill,
        className,
      )}
    >
      {/* Hazard rule: 4px danger-solid across the top of a stop-driving card. */}
      {hazard && <div aria-hidden className="h-1 w-full bg-danger-solid" />}

      <div className="p-5">
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            c.text,
          )}
        >
          {APP_COPY.verdict.heading}
        </p>

        <div className="mt-3 flex items-start gap-4">
          {/* Signal 2: silhouette, on a solid lamp so it reads from a metre
              away. The inset ring is the lamp's rim, not an outline: it never
              grows the 56px footprint. */}
          <span
            className={cn(
              "flex h-14 w-14 shrink-0 items-center justify-center rounded-full ring-2 ring-inset",
              c.solid,
              c.ring,
              c.onSolid,
            )}
          >
            <SeverityIcon severity={severity} className="h-8 w-8" />
          </span>

          <div className="min-w-0">
            {/* Signal 3: the words, at the largest size in the app. */}
            <h2 className={cn("text-[28px] font-extrabold leading-tight tracking-tight", c.text)}>
              <span className="sr-only">{copy.announce}</span>
              <span aria-hidden>{copy.label}</span>
            </h2>
            <p className={cn("mt-1 text-sm leading-relaxed", c.text)}>
              {summary ?? copy.guidance}
            </p>
          </div>
        </div>

        {typeof codeCount === "number" && (
          /* Machine-read count: mono + tabular figures so it lines up. */
          <p className={cn("num mt-4 font-mono text-sm font-semibold", c.text)}>
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
        <p>{APP_COPY.verdict.freeNote}</p>
      </div>
    </section>
  );
}
