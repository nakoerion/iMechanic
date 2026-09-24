import { createFileRoute } from "@tanstack/react-router";
import { Card, ScreenHeader } from "../../components/app-shell";
import { CheckIcon, SparkIcon } from "../../components/icons";
import { ProUpgradePanel } from "../../components/pro/pro-plan";
import { APP_COPY } from "../../lib/copy";
import { useEntitlement } from "../../lib/entitlement";

const t = APP_COPY.pro;

export const Route = createFileRoute("/app/pro")({
  component: AppPro,
});

/**
 * The upgrade screen (S6b).
 *
 * Structure, in order: what stays free (stated first, in a green "free forever"
 * card — this is the promise, not the upsell), what Pro adds, then the bands and
 * checkout. No countdown, no scarcity, no "limited time".
 *
 * `ProUpgradePanel` owns the three honest states (already Pro / free with
 * Stripe / free without Stripe) so this screen has no branching of its own.
 *
 * S9a — in the Android shell `ProUpgradePanel` renders plan status only, with no
 * band, no price, no checkout and no link (Google Play — see
 * `src/native/android-shell.ts`). The two cards above it stay: what is free,
 * and what Pro adds. Neither names a price or a place to pay, so nothing on this
 * screen is a purchase entry point; the list is what explains the locked
 * features the user meets elsewhere in the app.
 */
function AppPro() {
  const entitlement = useEntitlement();

  return (
    <div className="space-y-6">
      <ScreenHeader title={t.pageTitle} description={t.pageDescription} />

      <section className="flex items-start gap-3 rounded-card border-2 border-ok-border bg-ok-fill p-5">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok-solid text-on-ok">
          <CheckIcon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-bold text-ok-fg">{t.freeHeading}</h2>
          <ul className="mt-1.5 space-y-1">
            {t.freeItems.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-ok-fg">
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <Card>
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
          <SparkIcon className="h-4 w-4 text-brand-strong" aria-hidden />
          {t.proHeading}
        </h2>
        <ul className="mt-2 space-y-1.5">
          {t.proItems.map((item) => (
            <li
              key={item}
              className="text-sm leading-relaxed text-fg-muted"
            >
              {item}
            </li>
          ))}
        </ul>
      </Card>

      <ProUpgradePanel entitlement={entitlement} />
    </div>
  );
}
