import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../../components/empty-state";
import {
  AlertIcon,
  HistoryIcon,
  InfoIcon,
  ScanIcon,
  SpinnerIcon,
} from "../../components/icons";
import { ProUpgradePrompt } from "../../components/pro/pro-prompt";
import { Button, buttonClasses } from "../../components/ui/button";
import { SeverityBadge } from "../../components/ui/severity-badge";
import { APP_COPY } from "../../lib/copy";
import { useEntitlement } from "../../lib/entitlement";
import { visibleScans } from "../../lib/pro-limits";
import type { Severity } from "../../lib/severity";
import {
  listScans,
  type ScanSource,
  type ScanSummary,
} from "../../server/scans";

export const Route = createFileRoute("/app/history")({
  component: AppHistory,
});

const h = APP_COPY.history;

/** Demo data is never presented as real (AGENTS.md — honesty in data). */
const SOURCE_BADGE: Record<ScanSource, string> = {
  live: h.sourceLive,
  demo: h.sourceDemo,
  manual: h.sourceManual,
};

type State =
  | { kind: "loading" }
  | { kind: "ready"; scans: ScanSummary[] }
  | { kind: "error" };

/**
 * Relative for anything recent ("4 hours ago"), an absolute date once it is
 * older than a week — the same shape a person uses when talking about a car.
 */
function formatWhen(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return h.dateUnknown;
  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return h.justNow;
  if (minutes < 60) return h.minutesAgo(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return h.hoursAgo(hours);
  const days = Math.floor(hours / 24);
  if (days <= 7) return h.daysAgo(days);
  return new Date(at).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function AppHistory() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  /* S6b: free keeps the 3 most recent scans. The limit is applied to the list
     this screen already loads — no server change — and the hidden count is
     always disclosed below the list. */
  const entitlement = useEntitlement();
  const pro =
    entitlement.state.kind === "ready" && entitlement.state.entitlement.pro;
  const listed = state.kind === "ready" ? visibleScans(state.scans, pro) : null;

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    listScans()
      .then((scans) => {
        if (!cancelled) {
          setState({ kind: "ready", scans: Array.isArray(scans) ? scans : [] });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">
          {h.title}
        </h1>
        <p className="mt-1 text-sm text-fg-subtle">{h.description}</p>
      </header>

      {state.kind === "loading" && (
        <p
          className="flex items-center justify-center gap-2 rounded-card border border-line bg-surface px-6 py-10 text-sm font-medium text-fg-muted"
          role="status"
        >
          <SpinnerIcon className="h-5 w-5 animate-spin" aria-hidden />
          {h.loading}
        </p>
      )}

      {state.kind === "error" && (
        <section className="flex flex-col items-center rounded-card border border-line bg-surface px-6 py-10 text-center shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-fill text-danger-fg">
            <AlertIcon className="h-6 w-6" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-fg">{h.errorTitle}</h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
            {h.errorDescription}
          </p>
          <Button
            variant="secondary"
            className="mt-5"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {h.retry}
          </Button>
        </section>
      )}

      {state.kind === "ready" && state.scans.length === 0 && (
        <EmptyState
          icon={HistoryIcon}
          eyebrow={h.emptyEyebrow}
          title={h.emptyTitle}
          description={h.emptyDescription}
          action={
            <Link
              to="/app/scan"
              className={buttonClasses("primary", "md", true)}
            >
              <ScanIcon className="h-5 w-5" aria-hidden />
              {h.emptyAction}
            </Link>
          }
        />
      )}

      {state.kind === "ready" && state.scans.length > 0 && listed && (
        <>
          <ul className="space-y-3">
            {listed.visible.map((scan) => (
              <ScanRow key={scan.id} scan={scan} />
            ))}
          </ul>
          {/* The plan limit, said out loud: the free tier shows the 3 most
              recent scans and this card says so — a shortening list is never
              left for the user to notice. */}
          {listed.limited && (
            <ProUpgradePrompt
              title={APP_COPY.pro.historyTitle}
              description={APP_COPY.pro.historyBody(listed.hiddenCount)}
            />
          )}
        </>
      )}
    </div>
  );
}

function ScanRow({ scan }: { scan: ScanSummary }) {
  // A missing rules row means "not assessed" — never a made-up verdict.
  const severity: Severity = scan.verdict ?? "unknown";
  const hidden = scan.codeCount - scan.codes.length;

  return (
    <li className="rounded-card border border-line bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">
            <time dateTime={scan.createdAt}>{formatWhen(scan.createdAt)}</time>
          </p>
          {/* Source badge: a demo scan says so, in words, right next to the
              date it claims. Never dressed up as a reading from a real car. */}
          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-neutral-fill px-2.5 py-1 text-[11px] font-semibold text-neutral-fg">
            {scan.source === "demo" && (
              <InfoIcon className="h-3.5 w-3.5" aria-hidden />
            )}
            {SOURCE_BADGE[scan.source]}
          </p>
        </div>
        <SeverityBadge severity={severity} size="sm" />
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
          {h.countLabel(scan.codeCount)}
        </p>
        {scan.codeCount === 0 ? (
          <p className="mt-2 text-sm leading-relaxed text-fg-muted">
            {h.noCodes}
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {scan.codes.map((code) => (
              <li
                key={code.code}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
              >
                <span className="font-mono text-sm font-bold text-fg">
                  {code.code}
                </span>
                <span className="text-sm leading-relaxed text-fg-muted">
                  {code.title ?? h.unknownCode}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hidden > 0 && (
          <p className="mt-2 text-xs font-medium text-fg-subtle">
            {h.moreCodes(hidden)}
          </p>
        )}
      </div>
    </li>
  );
}
