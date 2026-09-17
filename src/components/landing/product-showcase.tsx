import { useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { estimateCosts } from "../../lib/cost";
import { MARKET_LIST, type CountryCode } from "../../lib/market";
import { CostDecisionCard } from "../decide/cost-decision-card";
import { GuidedRepairPanel } from "../repair/guided-repair-panel";
import { FaultCodeCard } from "../severity/fault-code-card";
import { VerdictPanel } from "../severity/verdict-panel";
import { PhoneFrame } from "./phone-frame";
import { SAMPLE_CAPTION, SAMPLE_SCAN, SAMPLE_STOP_DRIVING } from "./sample-data";
import { Note, SectionHeader, TickIcon } from "./ui";

/**
 * ProductShowcase — the landing page's centre of gravity.
 *
 * Every panel below renders the SAME components the app ships (VerdictPanel,
 * FaultCodeCard, CostDecisionCard, GuidedRepairPanel) with sample codes, so a
 * visitor is looking at the real product rather than an illustration of it.
 * Nothing is re-styled or re-implemented here; the frame is chrome only.
 *
 * Honesty rules this component must keep:
 *   - the sample caption stays visible on every panel (never real-vehicle data);
 *   - free surfaces (verdict, code cards) carry no lock, blur or Pro badge;
 *   - Pro surfaces are described as Pro, and Pro is described as not yet
 *     switched on for billing — no "start today and get X".
 */

type TabId = "verdict" | "decide" | "repair";

const TABS: { id: TabId; label: string; screen: string }[] = [
  { id: "verdict", label: "Scan & verdict", screen: "Scan result" },
  { id: "decide", label: "Cost decision", screen: "Decide" },
  { id: "repair", label: "Guided repair", screen: "Act" },
];

const PRO_NOTE =
  "The cost decision, guided repairs and AI root-cause analysis belong to iMechanic Pro. Pro billing isn't switched on yet, so nothing is chargeable today.";

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/20 text-amber-300">
            <TickIcon className="h-3.5 w-3.5" />
          </span>
          <span className="text-[15px] leading-relaxed text-slate-300">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}

function VerdictPane() {
  return (
    <>
      <PhoneFrame label="Scan result" screenLabel="Sample scan result screen">
        <VerdictPanel severity="repair_soon" codeCount={SAMPLE_SCAN.length} />
        {SAMPLE_SCAN.map((c) => (
          <FaultCodeCard key={c.code} {...c} />
        ))}
      </PhoneFrame>
      <div className="space-y-6">
        <h3 className="text-xl font-bold text-white">
          Two codes in. One answer out.
        </h3>
        <Bullets
          items={[
            "A deterministic rules engine turns your codes into one verdict: drive on, repair soon, or stop driving — with the reason in plain English.",
            "Your raw codes stay on screen next to our reading of them. We never invent a code and never hide one.",
            "Reading codes, their plain-English meaning, the severity verdict and clearing codes are free forever — no lock, no blur, no teaser.",
          ]}
        />
      </div>
    </>
  );
}

function DecidePane() {
  const [country, setCountry] = useState<CountryCode>("DE");
  const estimate = estimateCosts("ignition", country, {
    codes: SAMPLE_SCAN.map((c) => ({ code: c.code, status: c.status })),
    verdict: "repair_soon",
  });

  return (
    <>
      <PhoneFrame label="Decide" screenLabel="Sample cost decision screen">
        <CostDecisionCard
          family={estimate.family}
          currency={estimate.currency}
          country={country}
          diyLowCents={estimate.diyLowCents}
          diyHighCents={estimate.diyHighCents}
          shopLowCents={estimate.shopLowCents}
          shopHighCents={estimate.shopHighCents}
          workshopRecommended={estimate.workshopRecommended}
        />
      </PhoneFrame>
      <div className="space-y-6">
        <h3 className="text-xl font-bold text-white">
          Do it yourself, or pay a workshop — with real numbers.
        </h3>
        <Bullets
          items={[
            "Both paths, side by side: parts-and-tools for the DIY route, fair local labour plus parts for the workshop route.",
            "Costs are bands in your market's currency, never a single false-precision figure.",
            "Safety-critical work is routed to a workshop. That is a safety call, and the card that says so is not an upsell.",
          ]}
        />
        <fieldset>
          <legend className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Show the bands for
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {MARKET_LIST.map((market) => {
              const active = market.country === country;
              return (
                <button
                  key={market.country}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCountry(market.country)}
                  className={cn(
                    "min-h-tap rounded-control border px-4 text-sm font-semibold transition-colors",
                    active
                      ? "border-brand bg-brand text-on-brand"
                      : "border-white/25 text-white hover:border-white/50 hover:bg-white/10",
                  )}
                >
                  {market.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </>
  );
}

function RepairPane() {
  return (
    <>
      <PhoneFrame label="Act" screenLabel="Sample guided repair screen" tall>
        <GuidedRepairPanel family="ignition" />
      </PhoneFrame>
      <div className="space-y-6">
        <h3 className="text-xl font-bold text-white">
          Step by step, then proof it worked.
        </h3>
        <Bullets
          items={[
            "Ordered, checkable steps with the tools and the rough time each one takes.",
            "Safety warnings sit where you need them — before the step, not in a footnote.",
            "The job is only marked verified when a fresh re-scan comes back with the fault codes actually gone.",
          ]}
        />
      </div>
    </>
  );
}

export function ProductShowcase() {
  const [tab, setTab] = useState<TabId>("verdict");
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const delta =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + TABS.length) % TABS.length;
    setTab(TABS[next].id);
    tabRefs.current[next]?.focus();
  }

  return (
    <section
      id="product"
      className="relative overflow-hidden bg-navy-950 py-16 text-white sm:py-24"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Inside the app"
          title="This is the app, not an illustration."
          tone="dark"
        >
          <p>
            Every screen below is the product's own interface, rendered live on
            this page with sample fault codes. Open the app and this is what you
            get.
          </p>
        </SectionHeader>

        {/* Tabs */}
        <div
          role="tablist"
          aria-label="App screens"
          className="im-reveal mt-10 flex flex-wrap gap-2 rounded-control border border-white/10 bg-white/5 p-2"
        >
          {TABS.map((item, i) => {
            const active = item.id === tab;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                role="tab"
                id={`tab-${item.id}`}
                aria-selected={active}
                aria-controls={`panel-${item.id}`}
                tabIndex={active ? 0 : -1}
                onKeyDown={(e) => onKeyDown(e, i)}
                onClick={() => setTab(item.id)}
                className={cn(
                  "min-h-tap flex-1 rounded-[0.6rem] px-4 text-sm font-bold transition-colors sm:flex-none sm:px-6",
                  active
                    ? "bg-brand text-on-brand"
                    : "text-slate-300 hover:bg-white/10 hover:text-white",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {TABS.map((item) => (
          <div
            key={item.id}
            role="tabpanel"
            id={`panel-${item.id}`}
            aria-labelledby={`tab-${item.id}`}
            hidden={item.id !== tab}
            className="im-reveal mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,22.5rem)_1fr] lg:gap-14"
          >
            {item.id === "verdict" && <VerdictPane />}
            {item.id === "decide" && <DecidePane />}
            {item.id === "repair" && <RepairPane />}
          </div>
        ))}

        <Note tone="dark" className="mt-8 max-w-3xl">
          {SAMPLE_CAPTION} {PRO_NOTE}
        </Note>

        {/* The three answers, rendered with the real verdict component. */}
        <div className="im-reveal mt-16 rounded-3xl border border-white/10 bg-white/5 p-5 sm:p-8">
          <h3 className="text-2xl font-extrabold tracking-tight text-white">
            One of three answers. Every single time.
          </h3>
          <p className="mt-3 max-w-2xl leading-relaxed text-slate-300">
            The verdict is the part you read standing next to the car, so it
            says the same thing three ways — colour, shape and words — and it is
            free on every standard code lookup.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <VerdictPanel severity="drive_on" codeCount={1} />
            <VerdictPanel severity="repair_soon" codeCount={2} />
            <VerdictPanel severity="stop_driving" codeCount={1} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <FaultCodeCard {...SAMPLE_SCAN[1]} />
            <FaultCodeCard {...SAMPLE_SCAN[0]} />
            <FaultCodeCard {...SAMPLE_STOP_DRIVING} />
          </div>
          <Note tone="dark" className="mt-5">
            {SAMPLE_CAPTION}
          </Note>
        </div>
      </div>
    </section>
  );
}
