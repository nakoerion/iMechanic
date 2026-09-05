import { createFileRoute } from "@tanstack/react-router";
import { Card, ScreenHeader } from "../../components/app-shell";
import { EmptyState } from "../../components/empty-state";
import { AccountIcon, CheckIcon } from "../../components/icons";
import { ThemeControl } from "../../components/ui/theme-control";
import { APP_COPY } from "../../lib/copy";
import { MARKET_LIST } from "../../lib/market";

export const Route = createFileRoute("/app/account")({
  component: AppAccount,
});

function AppAccount() {
  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Account"
        description="Your email, your country, your subscription."
      />

      <EmptyState
        icon={AccountIcon}
        eyebrow="Not signed in"
        title="Accounts are on the way"
        description="Signing in lets iMechanic save your vehicles, your scan history and your repair record across devices. You'll be able to sign in with just your email — no password needed."
        note="Sign-in arrives with an upcoming update"
      />

      <Card>
        <h2 className="text-sm font-bold text-fg">{APP_COPY.theme.heading}</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          {APP_COPY.theme.description}
        </p>
        <ThemeControl className="mt-3" />
      </Card>

      <Card>
        {/* Plain statement of fact (QA defect D14) — this card previously
            said "Choose your country" above pills that looked selectable
            but did nothing. Never render a control that looks interactive
            and isn't; the real selector ships with sign-in (S2). */}
        <h2 className="text-sm font-bold text-fg">Launch markets</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          Available at launch: Germany, United Kingdom and Albania. You'll pick
          your country when accounts arrive — pricing and labour rates then
          match where you live.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {MARKET_LIST.map((market) => (
            <li
              key={market.country}
              className="rounded-full bg-neutral-fill px-3 py-1.5 text-xs font-semibold text-neutral-fg"
            >
              {market.name} · {market.symbol} · {market.distanceUnit}
            </li>
          ))}
        </ul>
      </Card>

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
    </div>
  );
}
