import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { APP_COPY } from "../../lib/copy";
import { severityClasses, severityCopy } from "../../lib/severity";
import type { Severity } from "../../lib/severity";
import { SeverityIcon } from "../ui/severity-badge";

/**
 * FaultCodeCard — one DTC as the owner sees it.
 *
 * FREE CONTENT. Everything on this card (the code, the plain-English meaning
 * from `dtc_catalog.title`, the common cause from `dtc_catalog.generic_cause`,
 * and the severity) is free forever. It is never blurred, dimmed, truncated
 * behind a fade, or badged with a lock. If you are tempted to tease it, don't.
 *
 * Three redundant severity signals, always on:
 *   fill (tinted header) + silhouette (distinct glyph) + words ("Repair soon"),
 * plus the unconditional 2px anchor border around the whole card.
 */

export type DtcStatus = "stored" | "pending" | "permanent";

export function FaultCodeCard({
  code,
  title,
  severity,
  genericCause,
  system,
  status,
  footer,
  className,
}: {
  /** e.g. "P0301" */
  code: string;
  /** `dtc_catalog.title` — the plain-English meaning. */
  title: string;
  severity: Severity;
  /** `dtc_catalog.generic_cause` */
  genericCause?: string;
  /** `dtc_catalog.system`, e.g. "Ignition" */
  system?: string;
  status?: DtcStatus;
  footer?: ReactNode;
  className?: string;
}) {
  const c = severityClasses(severity);
  const copy = severityCopy(severity);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-card border-2 bg-surface shadow-sm",
        c.border,
        className,
      )}
    >
      {/* Signal 1: fill. Signal 2: silhouette. Signal 3: the word. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b-2 px-4 py-2.5",
          c.fill,
          c.border,
          c.text,
        )}
      >
        <span className="font-mono text-xl font-extrabold tracking-tight">
          {code}
        </span>
        <span className="inline-flex items-center gap-1.5 text-sm font-bold">
          <SeverityIcon severity={severity} className="h-4.5 w-4.5" />
          <span className="sr-only">{copy.announce}</span>
          <span aria-hidden>{copy.label}</span>
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h3 className="text-base font-bold leading-snug text-fg">{title}</h3>
          {system && (
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {system}
            </p>
          )}
        </div>

        {genericCause && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              {APP_COPY.faultCode.likelyCauseLabel}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-fg-muted">
              {genericCause}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {status && (
            <span className="rounded-full bg-neutral-fill px-2.5 py-1 text-xs font-semibold text-neutral-fg">
              {APP_COPY.faultCode.statusLabel[status]}
            </span>
          )}
          <span className="text-xs font-medium text-fg-subtle">
            {APP_COPY.faultCode.freeNote}
          </span>
        </div>

        {footer}
      </div>
    </article>
  );
}
