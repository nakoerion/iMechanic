import { Link } from "@tanstack/react-router";
import { SparkIcon, SpinnerIcon } from "../icons";
import { Button } from "../ui/button";
import { APP_COPY } from "../../lib/copy";
import { useCanShowPurchaseUi } from "../../native/android-shell";

/**
 * ProUpgradePrompt — the ONE paywall surface in the app (S6b).
 *
 * Design rules it exists to enforce (AGENTS.md, "free tier is sacred"):
 *  - It is an explicit card that says plainly what Pro adds and links to the
 *    upgrade surface. It is NOT a blur, a dim, a disabled control or a tease.
 *  - It renders INSTEAD OF a Pro feature, never over the free content: the free
 *    verdict, the fault-code cards and clear-codes are rendered elsewhere on the
 *    same screen, untouched and unbadged.
 *  - No countdown, no scarcity, no lock icon. `SparkIcon` is the Pro mark used
 *    consistently everywhere Pro is mentioned.
 *  - It always repeats what stays free, so the boundary is never a surprise.
 *
 * `compact` drops the free-tier reassurance for places where the full card would
 * be too heavy (e.g. inside the vehicle picker) — it is a layout choice only,
 * never a way to hide what Pro costs or what stays free.
 *
 * S9a (Google Play) — in the Android shell `useCanShowPurchaseUi()` is false, so
 * the card renders WITHOUT the link: the feature, its title and its description
 * are unchanged ("AI root cause is part of iMechanic Pro"), but there is no
 * price, no Upgrade action and no way through to a purchase. Every gate in the
 * app goes through this component, so the boundary holds in one place. The
 * entitlement itself is untouched: a web buyer keeps full Pro access.
 */
export function ProUpgradePrompt({
  title,
  description,
  compact = false,
  className,
}: {
  /** Specific, in words: which feature this is, e.g. "AI root cause is part of iMechanic Pro". */
  title: string;
  /** What Pro adds for this feature, in one or two plain sentences. */
  description: string;
  compact?: boolean;
  className?: string;
}) {
  const t = APP_COPY.pro;
  /* S9a — false on the server, on the first client render, and forever in the
     Android app; true only once we know we are in a browser or the iOS shell. */
  const canShowPurchaseUi = useCanShowPurchaseUi();
  return (
    <section
      aria-label={t.eyebrow}
      className={[
        "rounded-card border border-line bg-surface shadow-card",
        compact ? "p-4" : "p-5",
        className ?? "",
      ]
        .join(" ")
        .trim()}
    >
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand-fg">
        <SparkIcon className="h-3.5 w-3.5" aria-hidden />
        {t.eyebrow}
      </p>
      <h2
        className={[
          "font-bold leading-snug text-fg",
          compact ? "mt-1.5 text-sm" : "mt-2 text-base",
        ].join(" ")}
      >
        {title}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
        {description}
      </p>
      {!compact && (
        <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
          {t.freeNote}
        </p>
      )}
      {canShowPurchaseUi && (
        <Link
          to="/app/pro"
          className="mt-3 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border-2 border-line-strong bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-sunken"
        >
          <SparkIcon className="h-4 w-4 text-brand-strong" aria-hidden />
          {t.cta}
        </Link>
      )}
    </section>
  );
}

/**
 * The honest "we do not know yet" surface a gate shows while the entitlement is
 * loading or after the lookup failed. It NEVER says the user is not Pro, and it
 * never shows Pro content on a failed check.
 */
export function PlanUnknownNote({
  kind,
  onRetry,
}: {
  kind: "loading" | "error";
  onRetry: () => void;
}) {
  const t = APP_COPY.pro;
  return (
    <section
      aria-live="polite"
      className="rounded-plate border border-line bg-surface-sunken p-4"
    >
      <p className="flex items-start gap-2 text-sm leading-relaxed text-fg-muted">
        {kind === "loading" ? (
          <SpinnerIcon
            className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-fg-subtle"
            aria-hidden
          />
        ) : (
          <SparkIcon
            className="mt-0.5 h-4 w-4 shrink-0 text-fg-subtle"
            aria-hidden
          />
        )}
        {kind === "loading" ? t.checking : t.checkError}
      </p>
      {kind === "error" && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={onRetry}>
          {t.retry}
        </Button>
      )}
    </section>
  );
}
