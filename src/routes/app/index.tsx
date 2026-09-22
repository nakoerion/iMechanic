import { Link, createFileRoute } from "@tanstack/react-router";
import { Card } from "../../components/app-shell";
import {
  ArrowRightIcon,
  EngineIcon,
  HistoryIcon,
  ScanIcon,
} from "../../components/icons";
import { buttonClasses } from "../../components/ui/button";
import { cn } from "../../lib/cn";

export const Route = createFileRoute("/app/")({
  component: AppHome,
});

const GOLDEN_PATH = [
  "Connect",
  "Scan",
  "Understand",
  "Verdict",
  "Decide",
  "Act",
  "Verify",
];

function AppHome() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">
          Today
        </h1>
        <p className="mt-1 text-sm text-fg-subtle">
          From a fault code to a completed repair — one honest path.
        </p>
      </header>

      {/* Primary scan entry. Panel + text are role tokens: the old raw-navy
          panel with white/amber/grey utility colours only ever worked in the
          dark theme, and its CTA set `text-fg` on amber — which in dark is
          near-white text on amber, 1.6:1.

          A2: the plate is `--color-chrome`, the same fixed navy the header and
          tab bar use, so it stays navy in BOTH themes instead of turning into
          a pale plate in light. Because chrome does not flip, its text must
          come from the `on-chrome` roles — `text-fg` here would be dark ink on
          navy at ~1.1:1 in the light theme. The CTA keeps `bg-brand` +
          `text-on-brand`, which is already fixed in both themes. */}
      <section className="overflow-hidden rounded-card border border-navy-800 bg-chrome p-6 text-on-chrome shadow-card">
        <p className="label-micro text-brand">New diagnosis</p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
          Start a scan
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-on-chrome-muted">
          Connect an OBD2 adapter or try the demo — then read your codes, get an
          honest verdict and decide what to do next.
        </p>
        <Link
          to="/app/scan"
          /* The shared primary button, so the hero CTA is the same control as
             every other screen's — including the A7 `--shadow-key` lift. */
          className={cn("mt-5", buttonClasses("primary", "md"))}
        >
          <ScanIcon className="h-5 w-5" />
          Go to scan
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
        <p className="mt-4 text-xs font-medium text-on-chrome-muted">
          Scanning is live — connect an adapter, run the demo, or type a code in
          by hand.
        </p>
      </section>

      {/* Golden path reference */}
      <Card>
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
          <EngineIcon className="h-4 w-4 text-brand-strong" />
          Every session follows the same path
        </h2>
        <ol className="mt-4 flex flex-wrap gap-2">
          {GOLDEN_PATH.map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-1.5 rounded-full bg-neutral-fill px-3 py-1.5 text-xs font-semibold text-fg-muted"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/20 text-[10px] font-bold text-brand-fg">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </Card>

      {/* Saving is live: every scan is persisted (S3). This card therefore
          says what happens to a scan — it never claims the list is empty.
          A6: it is the same card material as EmptyState (the screen it
          foreshadows), including the plate-recessed mark. */}
      <Card className="flex flex-col items-center px-6 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-plate border border-line bg-surface-sunken text-brand-fg">
          <HistoryIcon className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-fg">
          Saved to your history
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
          Every scan — live, demo or typed in — is saved to your history
          automatically. They are all on the History tab.
        </p>
        <Link
          to="/app/history"
          className={cn("mt-5", buttonClasses("secondary", "md"))}
        >
          <HistoryIcon className="h-4 w-4" aria-hidden />
          View history
        </Link>
      </Card>
    </div>
  );
}
