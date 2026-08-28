import { createFileRoute } from "@tanstack/react-router";
import { EmptyState } from "../../components/empty-state";
import { PlugIcon, ScanIcon } from "../../components/icons";

export const Route = createFileRoute("/app/scan")({
  component: AppScan,
});

const MODES = [
  {
    icon: PlugIcon,
    title: "OBD2 adapter",
    text: "Connect the ELM327 adapter you already own over Bluetooth or Wi-Fi.",
  },
  {
    icon: ScanIcon,
    title: "Demo mode",
    text: "A simulated adapter — try the whole experience without any hardware.",
  },
  {
    icon: ScanIcon,
    title: "Manual entry",
    text: "Type in a fault code you've already read elsewhere to look it up.",
  },
];

function AppScan() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-fg">
          Scan
        </h1>
        <p className="mt-1 text-sm text-fg-subtle">
          Read your fault codes and decide what to do next.
        </p>
      </header>

      <EmptyState
        icon={ScanIcon}
        eyebrow="Coming in an upcoming update"
        title="Scanning isn't available yet"
        description="Soon you'll be able to connect your OBD2 adapter, read stored and pending fault codes, and see them in plain English — free, always."
        note="Connect, Scan and Demo arrive with an upcoming release"
      />

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-bold text-fg">
          Three ways to scan
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          All three are planned — none are active yet.
        </p>
        <ul className="mt-4 space-y-3">
          {MODES.map((mode) => (
            <li key={mode.title} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-950 text-amber-400">
                <mode.icon className="h-4.5 w-4.5" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-fg">
                  {mode.title}
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">
                  {mode.text}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
