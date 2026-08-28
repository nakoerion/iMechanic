import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  HistoryIcon,
  ScanIcon,
  WrenchIcon,
} from "../../components/icons";

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

      {/* Primary scan entry */}
      <section className="overflow-hidden rounded-2xl bg-navy-950 p-6 text-white shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">
          New diagnosis
        </p>
        <h2 className="mt-2 text-2xl font-extrabold tracking-tight">
          Start a scan
        </h2>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">
          Connect an OBD2 adapter or try the demo — then read your codes, get an
          honest verdict and decide what to do next.
        </p>
        <Link
          to="/app/scan"
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-400 px-5 py-3 text-base font-semibold text-fg transition-colors hover:bg-amber-300"
        >
          <ScanIcon className="h-5 w-5" />
          Go to scan
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
        <p className="mt-4 text-xs font-medium text-slate-400">
          Scanning and demo mode arrive with an upcoming update.
        </p>
      </section>

      {/* Golden path reference */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-bold text-fg">
          <WrenchIcon className="h-4 w-4 text-brand-strong" />
          Every session follows the same path
        </h2>
        <ol className="mt-4 flex flex-wrap gap-2">
          {GOLDEN_PATH.map((step, i) => (
            <li
              key={step}
              className="flex items-center gap-1.5 rounded-full bg-neutral-fill px-3 py-1.5 text-xs font-semibold text-fg-muted"
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/20 text-[10px] font-bold text-brand-fg">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>

      {/* Recent activity — honest empty state */}
      <section className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-950 text-amber-400">
          <HistoryIcon className="h-7 w-7" />
        </span>
        <h2 className="mt-4 text-lg font-bold text-fg">No scans yet</h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
          Your scan history will show up here. Once connecting and scanning are
          live, every diagnosis is saved to your history automatically.
        </p>
      </section>
    </div>
  );
}
