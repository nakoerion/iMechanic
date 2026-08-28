import { createFileRoute } from "@tanstack/react-router";
import { Card, ScreenHeader, StickyActionBar } from "../../components/app-shell";
import { ArrowRightIcon, ScanIcon } from "../../components/icons";
import { FaultCodeCard } from "../../components/severity/fault-code-card";
import { VerdictPanel } from "../../components/severity/verdict-panel";
import { Button } from "../../components/ui/button";
import { FormField, inputClasses } from "../../components/ui/form-field";
import { SeverityBadge } from "../../components/ui/severity-badge";
import { ThemeControl } from "../../components/ui/theme-control";
import { APP_COPY } from "../../lib/copy";
import {
  MARKET_LIST,
  PRICE_BANDS,
  PRICING_PREVIEW_NOTE,
  formatBandAnnual,
  formatBandMonthly,
  formatDistance,
  formatMoneyRange,
} from "../../lib/market";
import { SEVERITY_ORDER } from "../../lib/severity";
import type { Severity } from "../../lib/severity";

export const Route = createFileRoute("/app/_gallery")({
  component: Gallery,
});

/* ------------------------------------------------------------------ */
/* Sample data — invented for review only. Not real vehicle data.      */
/* ------------------------------------------------------------------ */

const SAMPLE_CODES: {
  code: string;
  title: string;
  system: string;
  genericCause: string;
  severity: Severity;
  status: "stored" | "pending" | "permanent";
}[] = [
  {
    code: "P0442",
    title: "Small leak in the fuel vapour system",
    system: "Emissions",
    genericCause: "A loose or worn fuel cap seal is the usual culprit.",
    severity: "drive_on",
    status: "stored",
  },
  {
    code: "P0301",
    title: "Cylinder 1 is misfiring",
    system: "Ignition",
    genericCause: "Commonly a worn spark plug or a failing ignition coil.",
    severity: "repair_soon",
    status: "pending",
  },
  {
    code: "P0217",
    title: "Engine is over-temperature",
    system: "Cooling",
    genericCause: "Low coolant, a stuck thermostat or a failed water pump.",
    severity: "stop_driving",
    status: "permanent",
  },
  {
    code: "P1601",
    title: "Manufacturer-specific communication fault",
    system: "Network",
    genericCause: "Not in the generic rulebook — needs a manufacturer lookup.",
    severity: "unknown",
    status: "stored",
  },
];

function SampleTag() {
  return (
    <span className="rounded-full border border-line bg-neutral-fill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-fg">
      {APP_COPY.gallery.sampleBadge}
    </span>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wider text-fg-subtle">
          {title}
        </h2>
        {note && <span className="text-xs text-fg-subtle">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** The severity set, rendered whole. Reused inside the dark preview pane. */
function SeverityShowcase() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SEVERITY_ORDER.map((s) => (
          <SeverityBadge key={s} severity={s} />
        ))}
      </div>
      {SEVERITY_ORDER.map((s) => (
        <VerdictPanel key={s} severity={s} codeCount={s === "unknown" ? undefined : 2} />
      ))}
      {SAMPLE_CODES.map((c) => (
        <FaultCodeCard key={c.code} {...c} />
      ))}
    </div>
  );
}

function Gallery() {
  return (
    <div className="space-y-8 pb-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border-2 border-brand bg-brand/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand-fg">
            {APP_COPY.gallery.internalBadge}
          </span>
          <SampleTag />
        </div>
        <ScreenHeader
          title={APP_COPY.gallery.title}
          description={APP_COPY.gallery.intro}
        />
      </div>

      <Section title="Theme">
        <ThemeControl />
      </Section>

      <Section title="Colour roles">
        <Card className="space-y-3">
          <Swatches />
        </Card>
      </Section>

      <Section title="Severity" note="fill + silhouette + words + 2px anchor border">
        <SeverityShowcase />
      </Section>

      <Section title="Verdict — AI unavailable" note="honest fallback, never fabricated">
        <VerdictPanel severity="repair_soon" source="ai" aiUnavailable codeCount={1} />
      </Section>

      <Section title="Buttons">
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary">Read codes</Button>
            <Button variant="secondary">Enter a code</Button>
            <Button variant="ghost">Not now</Button>
            <Button variant="danger">Clear codes</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button loading>Reading…</Button>
            <Button disabled>Disabled</Button>
            <Button variant="secondary" disabled>
              Disabled
            </Button>
          </div>
          <Button fullWidth leadingIcon={<ScanIcon className="h-5 w-5" />} trailingIcon={<ArrowRightIcon className="h-4 w-4" />}>
            Full width
          </Button>
        </Card>
      </Section>

      <Section title="Form fields">
        <Card className="space-y-4">
          <FormField label="Fault code" hint="For example P0301" required>
            {(a11y) => (
              <input {...a11y} className={inputClasses} placeholder="P0301" />
            )}
          </FormField>
          <FormField
            label="Odometer"
            error="Enter a number between 0 and 2,000,000."
          >
            {(a11y) => <input {...a11y} className={inputClasses} defaultValue="abc" />}
          </FormField>
        </Card>
      </Section>

      <Section title="Market formatting" note="every figure comes from src/lib/market.ts">
        <Card className="space-y-2 text-sm">
          {MARKET_LIST.map((m) => (
            <p key={m.country} className="text-fg-muted">
              <span className="font-semibold text-fg">{m.name}</span> ·{" "}
              {formatMoneyRange(12000, 18000, m)} · {formatDistance(184000, m)}
            </p>
          ))}
        </Card>
      </Section>

      <Section title="Pro price bands" note="preview only — not committed prices">
        <Card className="space-y-2">
          <ul className="space-y-1 text-sm text-fg-muted">
            {PRICE_BANDS.map((band) => (
              <li key={band.id}>
                <span className="font-semibold text-fg">
                  {formatBandAnnual(band)}
                </span>{" "}
                per year · {formatBandMonthly(band)} per month
              </li>
            ))}
          </ul>
          <p className="text-xs leading-snug text-fg-subtle">{PRICING_PREVIEW_NOTE}</p>
        </Card>
      </Section>

      <Section title="Dark preview" note="the same components inside a nested dark subtree">
        <div className="dark rounded-card bg-app-bg p-4 text-fg">
          <SeverityShowcase />
        </div>
      </Section>

      <Section title="Sticky action bar">
        <Card>
          <p className="text-sm text-fg-muted">
            Pinned above the tab bar. The free action always owns this slot.
          </p>
        </Card>
        <StickyActionBar note="Clearing codes is free, always.">
          <Button fullWidth size="lg">
            Clear these codes
          </Button>
        </StickyActionBar>
      </Section>
    </div>
  );
}

const SWATCHES: { label: string; className: string }[] = [
  { label: "surface", className: "bg-surface border-line" },
  { label: "sunken", className: "bg-surface-sunken border-line" },
  { label: "raised", className: "bg-surface-raised border-line" },
  { label: "app-bg", className: "bg-app-bg border-line" },
  { label: "brand", className: "bg-brand border-brand" },
  { label: "ok", className: "bg-ok-solid border-ok-border" },
  { label: "warn", className: "bg-warn-solid border-warn-border" },
  { label: "danger", className: "bg-danger-solid border-danger-border" },
];

function Swatches() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {SWATCHES.map((s) => (
        <div key={s.label} className="space-y-1">
          <div className={`h-10 rounded-lg border-2 ${s.className}`} />
          <p className="text-[11px] font-medium text-fg-subtle">{s.label}</p>
        </div>
      ))}
    </div>
  );
}
