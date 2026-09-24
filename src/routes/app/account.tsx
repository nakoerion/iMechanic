import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, ScreenHeader } from "../../components/app-shell";
import { CheckIcon, InfoIcon } from "../../components/icons";
import { Button, buttonClasses } from "../../components/ui/button";
import { ThemeControl } from "../../components/ui/theme-control";
import { FreePlanCard, ProStatusCard } from "../../components/pro/pro-plan";
import { cn } from "../../lib/cn";
import { APP_COPY } from "../../lib/copy";
import { useEntitlement, type EntitlementHandle } from "../../lib/entitlement";
import { MARKET_LIST, type CountryCode } from "../../lib/market";
import { clientSignOutAndClearCache } from "../../lib/session";
import { useIsAndroidShell } from "../../native/android-shell";
import {
  getCurrentUser,
  updateCountry,
} from "../../server/auth";

type AuthUser = { id: string; email: string; country: CountryCode | null };

/** Only the two values S6a's checkout redirect builds are accepted. */
type AccountSearch = { checkout?: "success" | "canceled" };

export const Route = createFileRoute("/app/account")({
  validateSearch: (search: Record<string, unknown>): AccountSearch => {
    const value = search.checkout;
    return {
      checkout: value === "success" || value === "canceled" ? value : undefined,
    };
  },
  component: AppAccount,
});

function AppAccount() {
  const [user, setUser] = useState<AuthUser | null | "loading">("loading");
  const [country, setCountry] = useState<CountryCode | "">("");
  const [countryState, setCountryState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [signingOut, setSigningOut] = useState(false);
  const { checkout } = Route.useSearch();
  const entitlement = useEntitlement();
  /* S9a — these two notes belong to a Stripe redirect, and the Android app has
     no checkout. `false` until the platform is known, so the browser keeps the
     notes exactly as before and the Android shell never renders them. */
  const isAndroidShell = useIsAndroidShell();

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((u) => {
        if (cancelled) return;
        setUser(u);
        setCountry(u?.country ?? "");
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Returning from Stripe Checkout. The note below is just a note — the plan
   * shown on this page comes from `getEntitlement()`, never from the URL, so a
   * hand-typed `?checkout=success` cannot make the app claim Pro.
   *
   * On success the webhook may land a moment after the browser redirect, so we
   * ask again immediately and once more shortly after, rather than declaring
   * the outcome either way.
   */
  const { reload } = entitlement;
  useEffect(() => {
    if (checkout !== "success") return;
    reload();
    const timer = setTimeout(reload, 3000);
    return () => clearTimeout(timer);
  }, [checkout, reload]);

  async function onCountryChange(next: string) {
    if (next !== "DE" && next !== "GB" && next !== "AL") return;
    setCountry(next);
    setCountryState("saving");
    try {
      await updateCountry({ data: { country: next } });
      setCountryState("saved");
      // `user` can also be the "loading" sentinel — only a real user object
      // may be spread. Returning the sentinel unchanged is the same intent
      // (there is nothing to update before the user resolves).
      setUser((u) =>
        u && typeof u === "object" ? { ...u, country: next } : u,
      );
    } catch {
      setCountryState("error");
      setCountry((prev) => prev); // keep last selection; error surfaced below
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await clientSignOutAndClearCache();
      window.location.href = "/app/signin";
    } catch {
      setSigningOut(false);
    }
  }

  if (user === "loading") {
    return (
      <div className="space-y-6">
        <ScreenHeader title={APP_COPY.account.title} description={APP_COPY.account.description} />
        <p className="text-sm text-fg-muted">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <ScreenHeader title={APP_COPY.account.title} description={APP_COPY.account.description} />
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-fg">
            {APP_COPY.account.signedOutEyebrow}
          </p>
          <h2 className="mt-2 text-xl font-bold text-fg">
            {APP_COPY.account.signedOutTitle}
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
            {APP_COPY.account.signedOutDescription}
          </p>
          <a
            href="/app/signin"
            className={cn("mt-6", buttonClasses("primary", "md"))}
          >
            {APP_COPY.account.signInButton}
          </a>
        </Card>
        <FreeForeverNote />
        <Card>
          <h2 className="text-sm font-bold text-fg">{APP_COPY.theme.heading}</h2>
          <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
            {APP_COPY.theme.description}
          </p>
          <ThemeControl className="mt-3" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ScreenHeader title={APP_COPY.account.title} description={APP_COPY.account.description} />

      {/* Returning from Stripe Checkout. These notes never assert an
          entitlement — the plan block right below reads the real status.
          S9a: not rendered in the Android shell, where a checkout cannot
          happen (and a hand-typed URL must not conjure a checkout note). */}
      {checkout === "success" && !isAndroidShell && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-card border border-line bg-surface p-4 text-sm leading-relaxed text-fg-muted shadow-card"
        >
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-strong" aria-hidden />
          {APP_COPY.account.checkoutSuccess}
        </p>
      )}
      {checkout === "canceled" && !isAndroidShell && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-card border border-line bg-surface p-4 text-sm leading-relaxed text-fg-muted shadow-card"
        >
          <InfoIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {APP_COPY.account.checkoutCanceled}
        </p>
      )}

      <Card>
        <h2 className="text-sm font-bold text-fg">{APP_COPY.account.currentEmailLabel}</h2>
        <p className="mt-1 text-base font-semibold text-fg">{user.email}</p>
      </Card>
      <PlanSection entitlement={entitlement} />
      <Card>
        <h2 className="text-sm font-bold text-fg">{APP_COPY.account.countryHeading}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          {APP_COPY.account.countryHint}
        </p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={APP_COPY.account.countryHeading}>
          {MARKET_LIST.map((market) => (
            <button
              key={market.country}
              type="button"
              role="radio"
              aria-checked={country === market.country}
              disabled={countryState === "saving"}
              onClick={() => void onCountryChange(market.country)}
              className={
                country === market.country
                  ? "rounded-full bg-brand px-3 py-1.5 text-xs font-semibold text-on-brand transition-colors"
                  : "rounded-full bg-neutral-fill px-3 py-1.5 text-xs font-semibold text-neutral-fg transition-colors hover:bg-surface-sunken"
              }
            >
              {market.name} · {market.symbol}
            </button>
          ))}
        </div>
        {countryState === "saved" && (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-ok-fg">
            <CheckIcon className="h-3.5 w-3.5" /> {APP_COPY.account.countrySaved}
          </p>
        )}
        {countryState === "error" && (
          <p className="mt-2 text-xs font-medium text-danger-fg">{APP_COPY.account.countryError}</p>
        )}
      </Card>
      <Button
        variant="secondary"
        size="md"
        fullWidth
        loading={signingOut}
        loadingLabel="Signing out…"
        onClick={() => void onSignOut()}
      >
        {APP_COPY.account.signOutButton}
      </Button>
      <FreeForeverNote />
      <Card>
        <h2 className="text-sm font-bold text-fg">{APP_COPY.theme.heading}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          {APP_COPY.theme.description}
        </p>
        <ThemeControl className="mt-3" />
      </Card>
    </div>
  );
}

/**
 * The plan block (S6b). Three states, all driven by `getEntitlement()`:
 * Pro → the live subscription status; free → the free-plan card with the way to
 * upgrade; loading/unknown → an honest note rather than a guess.
 */
function PlanSection({ entitlement }: { entitlement: EntitlementHandle }) {
  const a = APP_COPY.account;
  const { state, reload } = entitlement;

  if (state.kind === "loading") {
    return (
      <Card>
        <h2 className="text-sm font-bold text-fg">{a.planHeading}</h2>
        <p className="mt-1 text-sm text-fg-muted">{a.planLoading}</p>
      </Card>
    );
  }

  if (state.kind === "error") {
    return (
      <Card>
        <h2 className="text-sm font-bold text-fg">{a.planHeading}</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">
          {a.planUnavailable}
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={reload}>
          {a.planRetry}
        </Button>
      </Card>
    );
  }

  if (state.entitlement.pro) {
    return <ProStatusCard entitlement={entitlement} />;
  }

  const status = state.entitlement.status;
  return <FreePlanCard statusNote={status ? a.planStatus[status] : null} />;
}

function FreeForeverNote() {
  return (
    <section className="flex items-start gap-3 rounded-card border-2 border-ok-border bg-ok-fill p-5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok-solid text-on-ok">
        <CheckIcon className="h-3.5 w-3.5" />
      </span>
      <p className="text-sm leading-relaxed text-ok-fg">
        <span className="font-semibold">Free forever:</span> reading fault
        codes and clearing them stays free — always. No pay-to-read, no
        pay-to-clear.
      </p>
    </section>
  );
}