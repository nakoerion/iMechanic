import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, ScreenHeader } from "../../components/app-shell";
import { CheckIcon } from "../../components/icons";
import { Button } from "../../components/ui/button";
import { ThemeControl } from "../../components/ui/theme-control";
import { APP_COPY } from "../../lib/copy";
import { MARKET_LIST, type CountryCode } from "../../lib/market";
import { clientSignOutAndClearCache } from "../../lib/session";
import {
  getCurrentUser,
  updateCountry,
} from "../../server/auth";

type AuthUser = { id: string; email: string; country: CountryCode | null };

export const Route = createFileRoute("/app/account")({
  component: AppAccount,
});

function AppAccount() {
  const [user, setUser] = useState<AuthUser | null | "loading">("loading");
  const [country, setCountry] = useState<CountryCode | "">("");
  const [countryState, setCountryState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [signingOut, setSigningOut] = useState(false);

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

  async function onCountryChange(next: string) {
    if (next !== "DE" && next !== "GB" && next !== "AL") return;
    setCountry(next);
    setCountryState("saving");
    try {
      await updateCountry({ data: { country: next } });
      setCountryState("saved");
      setUser((u) => (u ? { ...u, country: next } : u));
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
        <section className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-sm">
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
            className="mt-6 inline-flex min-h-12 items-center justify-center rounded-control bg-brand px-5 text-base font-semibold text-on-brand transition-colors hover:bg-brand-strong"
          >
            {APP_COPY.account.signInButton}
          </a>
        </section>
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
      <Card>
        <h2 className="text-sm font-bold text-fg">{APP_COPY.account.currentEmailLabel}</h2>
        <p className="mt-1 text-base font-semibold text-fg">{user.email}</p>
      </Card>
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