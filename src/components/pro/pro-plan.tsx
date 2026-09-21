import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckIcon, SparkIcon } from "../icons";
import { Button } from "../ui/button";
import { APP_COPY } from "../../lib/copy";
import {
  PRICE_BANDS,
  PRICING_PREVIEW_NOTE,
  formatBandAnnual,
  formatBandMonthly,
  type PriceBand,
} from "../../lib/market";
import type { EntitlementHandle } from "../../lib/entitlement";
import { createCheckoutSession } from "../../server/pro";

const t = APP_COPY.pro;
const a = APP_COPY.account;

/**
 * ProUpgradePanel — the upgrade surface (S6b).
 *
 * Three honest states, driven by the server's `getEntitlement()`:
 *
 *  already Pro      → the current status (band, renewal date), never an
 *                     "upgrade" button the user does not need.
 *  free, configured → the three PREVIEW bands with one Upgrade action each.
 *                     The action asks the server for a Stripe Checkout URL and
 *                     redirects to it. Any refusal from the server is printed
 *                     VERBATIM — never a friendlier invented reason.
 *  free, no Stripe  → "payments aren't set up yet", the bands shown as
 *                     information with no button at all. A dead button that
 *                     looks live would be a lie, so there is no button.
 *
 * No price is written here: every figure comes from `PRICE_BANDS` via
 * `formatBandAnnual` / `formatBandMonthly` (AGENTS.md — pricing rule).
 */
export function ProUpgradePanel({
  entitlement,
}: {
  entitlement: EntitlementHandle;
}) {
  const { state, reload } = entitlement;

  if (state.kind === "loading") {
    return (
      <section
        aria-live="polite"
        className="rounded-card border border-line bg-surface p-5 shadow-sm"
      >
        <p className="text-sm text-fg-muted">{a.planLoading}</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
        <p className="text-sm leading-relaxed text-fg-muted">
          {a.planUnavailable}
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          {a.planRetry}
        </Button>
      </section>
    );
  }

  const { pro, status, stripeConfigured, stripeTestMode } = state.entitlement;
  if (pro) return <ProStatusCard entitlement={entitlement} />;

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-bold text-fg">
        <SparkIcon className="h-4 w-4 text-brand-strong" aria-hidden />
        {t.bandsHeading}
      </h2>
      {status && (
        /* A subscription that exists but does not grant Pro (past_due,
           canceled, incomplete…) — said plainly, before any price. */
        <p className="mt-2 rounded-card border border-warn-border bg-warn-fill p-3 text-xs leading-relaxed text-warn-fg">
          {a.planStatus[status]}
        </p>
      )}
      {stripeConfigured ? (
        <>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">
            {t.bandsIntro}
          </p>
          <BandList />
        </>
      ) : (
        <>
          {/* Honest not-configured state: nothing is for sale, so there is no
              button — not a disabled one that pretends it almost works. */}
          <p className="mt-1.5 text-base font-semibold text-fg">
            {t.notConfiguredHeading}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-fg-muted">
            {t.notConfiguredBody}
          </p>
          <ul className="mt-3 space-y-2">
            {PRICE_BANDS.map((band) => (
              <li
                key={band.id}
                className="rounded-card border border-line bg-surface-sunken p-3"
              >
                <BandPrice band={band} />
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-4 text-xs leading-relaxed text-fg-subtle">
        {PRICING_PREVIEW_NOTE}
      </p>
      {stripeConfigured && (
        <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
          {stripeTestMode ? t.testModeNote : t.stripeNote}
        </p>
      )}
      <p className="mt-2 text-xs leading-relaxed text-fg-subtle">
        {t.freeNote}
      </p>
    </section>
  );
}

/**
 * The three bands. Each has its own Upgrade action so the choice is explicit —
 * no pre-selected "recommended" band, because nothing about the bands is
 * decided yet (see `bandsIntro` and PRICING_PREVIEW_NOTE).
 */
function BandList() {
  const [busy, setBusy] = useState<PriceBand["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upgrade(bandId: PriceBand["id"]) {
    setBusy(bandId);
    setError(null);
    try {
      const { url } = await createCheckoutSession({ data: { bandId } });
      // Stripe's hosted checkout. Full navigation: we are leaving the app.
      window.location.href = url;
    } catch (err) {
      // The server's own words ("Pro checkout is not configured yet.",
      // "Sign in to upgrade.") — never softened into something friendlier.
      const detail =
        err instanceof Error && err.message.trim() ? err.message.trim() : null;
      setError(detail ?? t.checkoutError);
      setBusy(null);
    }
  }

  return (
    <>
      <ul className="mt-3 space-y-3">
        {PRICE_BANDS.map((band) => (
          <li
            key={band.id}
            className="rounded-card border border-line bg-surface-sunken p-4"
          >
            <BandPrice band={band} />
            <Button
              fullWidth
              className="mt-3"
              loading={busy === band.id}
              loadingLabel={t.upgrading}
              disabled={busy !== null && busy !== band.id}
              onClick={() => void upgrade(band.id)}
            >
              {t.upgradeButton}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p
          role="alert"
          className="mt-3 rounded-card border border-danger-border bg-danger-fill p-3 text-xs leading-relaxed text-danger-fg"
        >
          {error}
        </p>
      )}
    </>
  );
}

/** Price lines for one band — annual first, monthly as the equivalent. */
function BandPrice({ band }: { band: PriceBand }) {
  return (
    <>
      <p className="text-lg font-bold text-fg">
        {formatBandAnnual(band)}{" "}
        <span className="text-sm font-medium text-fg-muted">
          {t.annualSuffix}
        </span>
      </p>
      <p className="mt-0.5 text-xs text-fg-subtle">
        {formatBandMonthly(band)} {t.monthlySuffix}
      </p>
    </>
  );
}

/**
 * Current subscription status — rendered only when the user IS Pro (the server
 * said so). Every field comes from the server; a missing renewal date says so
 * instead of inventing one.
 */
export function ProStatusCard({
  entitlement,
  showManageNote = true,
}: {
  entitlement: EntitlementHandle;
  showManageNote?: boolean;
}) {
  if (entitlement.state.kind !== "ready") return null;
  const { pro, status, bandId, currentPeriodEnd } =
    entitlement.state.entitlement;
  if (!pro) return null;

  return (
    <section className="rounded-card border-2 border-ok-border bg-ok-fill p-5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ok-fg">
        <SparkIcon className="h-3.5 w-3.5" aria-hidden />
        {t.name}
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-base font-bold text-ok-fg">
        <CheckIcon className="h-4 w-4" aria-hidden />
        {status ? a.planStatus[status] : a.planStatus.active}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-ok-fg">
        {bandId
          ? `${a.planBand(bandId)} — ${formatBandAnnual(
              PRICE_BANDS.find((b) => b.id === bandId) ?? PRICE_BANDS[0]!,
            )} ${t.annualSuffix}`
          : a.planBandUnknown}
      </p>
      <p className="mt-0.5 text-xs leading-relaxed text-ok-fg">
        {status === "trialing" ? a.planTrialEnds : a.planRenews}:{" "}
        {formatPlanDate(currentPeriodEnd) ?? a.planPeriodEnd}
      </p>
      {showManageNote && (
        <p className="mt-2 text-xs leading-relaxed text-ok-fg">
          {a.planManageNote}
        </p>
      )}
    </section>
  );
}

/**
 * Renewal dates come from Postgres through the server function, so the string
 * shape is the driver's, not a fixed ISO format. Anything unparseable returns
 * null and the caller says "not reported yet" rather than showing "Invalid
 * Date".
 */
export function formatPlanDate(value: string | null): string | null {
  if (!value) return null;
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return null;
  /* Locale and time zone are pinned, never left to the runtime: the server's
     default locale/zone and the browser's differ, and a differing date string
     is a hydration mismatch (React error #418) on the server-rendered page. */
  return at.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Free-plan block for the Account screen: what is free, plus the way to the
 * upgrade surface. `statusNote` carries an honest one-liner when a subscription
 * exists but does not grant Pro (e.g. a failed payment) — the user is told why
 * rather than just being offered an upgrade.
 */
export function FreePlanCard({ statusNote }: { statusNote?: string | null }) {
  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-bold text-fg">{a.planHeading}</h2>
      <p className="mt-1 text-base font-semibold text-fg">{a.planFreeName}</p>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">
        {a.planFreeBody}
      </p>
      {statusNote && (
        <p className="mt-2 rounded-card border border-warn-border bg-warn-fill p-3 text-xs leading-relaxed text-warn-fg">
          {statusNote}
        </p>
      )}
      <Link
        to="/app/pro"
        className="mt-3 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control border-2 border-line-strong bg-surface px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-sunken"
      >
        <SparkIcon className="h-4 w-4 text-brand-strong" aria-hidden />
        {a.planUpgradeCta}
      </Link>
    </section>
  );
}
