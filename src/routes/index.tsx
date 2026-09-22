import { createServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { sql } from "../db";
import { ProductShowcase } from "../components/landing/product-showcase";
import { PhoneFrame } from "../components/landing/phone-frame";
import { SAMPLE_CAPTION, SAMPLE_SCAN } from "../components/landing/sample-data";
import {
  ArrowIcon,
  Eyebrow,
  Note,
  SectionHeader,
  TickIcon,
  EngineMark,
  ctaOnNavy,
  ctaOnWhite,
  ctaPrimary,
} from "../components/landing/ui";
import { VerdictPanel } from "../components/severity/verdict-panel";
import { FaultCodeCard } from "../components/severity/fault-code-card";
import {
  PRICE_BANDS,
  PRICING_PREVIEW_NOTE,
  formatBandAnnual,
  formatBandMonthly,
} from "../lib/market";

/* ------------------------------------------------------------------ */
/* Waitlist server function                                            */
/* ------------------------------------------------------------------ */

const joinWaitlist = createServerFn({ method: "POST" })
  .validator((value: unknown) => {
    if (typeof value !== "string") {
      throw new Error("Invalid email");
    }
    const email = value.trim().toLowerCase();
    // Deliberately simple validation — the address is confirmed by the email
    // we actually send, not by a clever regex here.
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error("Invalid email");
    }
    return email;
  })
  .handler(async ({ data }) => {
    const message = "You're on the list — we'll email you when the apps land.";
    try {
      const db = sql();
      // Schema lives in db/migrations/003_waitlist.sql (QA defect D17) —
      // request handlers never run DDL.
      // Dedupe on email so a repeat signup is a no-op, not an error.
      await db`INSERT INTO waitlist (email) VALUES (${data})
        ON CONFLICT (email) DO NOTHING`;
    } catch {
      // Never leak raw DB errors or connection details to the client — the
      // form already maps a thrown error to its friendly error state.
      throw new Error("Unable to save signup");
    }
    return { ok: true, message };
  });

/* ------------------------------------------------------------------ */
/* Content                                                             */
/*                                                                     */
/* COPY RULES (business plan + AGENTS.md), enforced by review:          */
/*  - "free forever" facts are exact: read codes, plain-English         */
/*    meaning, severity verdict, clear codes. Never softened.           */
/*  - features that are built but not switched on for everyone (AI      */
/*    root cause, Pro surfaces) are described as capabilities, never    */
/*    as "you get this today".                                          */
/*  - pricing is a labelled PREVIEW read from src/lib/market.ts, with   */
/*    no checkout affordance anywhere on this page.                     */
/*  - no invented users, ratings, testimonials, logos or urgency.       */
/* ------------------------------------------------------------------ */

const NAV_LINKS = [
  { href: "#product", label: "Inside the app" },
  { href: "#how", label: "How it works" },
  { href: "#free", label: "Free forever" },
  { href: "#pricing", label: "Pricing" },
];

const HERO_FACTS = [
  "Works with any generic ELM327 adapter",
  "Reading and clearing codes is free, always",
  "No adapter yet? Run the built-in demo scan",
];

const CAPABILITY_STRIP = [
  { label: "Adapters", value: "Bluetooth, BLE or Wi-Fi ELM327" },
  { label: "Where it runs", value: "Browser, installable to your home screen" },
  { label: "Store apps", value: "iPhone and Android builds in progress" },
  { label: "Markets", value: "Germany · United Kingdom · Albania" },
];

const STEPS = [
  {
    name: "Connect",
    text: "Pair any generic ELM327 adapter over Bluetooth, BLE or Wi-Fi — including the cheap clones, which the setup wizard is honest about. No adapter yet? Walk the whole path with a demo scan, or type a code in by hand.",
  },
  {
    name: "Scan",
    text: "Reads the fault codes your car is actually reporting — stored, pending and permanent. The raw response stays visible next to our reading of it. We never invent a code.",
  },
  {
    name: "Understand",
    text: "Each code in plain English, with the cause that usually sits behind it. iMechanic Pro adds AI root-cause analysis with its reasoning and confidence — and when the AI can't answer, the app says so and falls back to the rules engine instead of guessing.",
  },
  {
    name: "Verdict",
    text: "One of three answers, every time: drive on, repair soon, or stop driving — with a one-line reason. Free on every standard code lookup.",
  },
  {
    name: "Decide",
    text: "The DIY path and the workshop path side by side, in your market's currency, as honest bands rather than false precision. You choose with numbers instead of fear.",
  },
  {
    name: "Act",
    text: "Ordered, checkable repair steps with the tools and rough time each one needs. Safety-critical work is routed to a workshop — a safety call, never an upsell.",
  },
  {
    name: "Verify",
    text: "Re-scan, confirm the fault is really gone, clear the codes. The job only counts as verified when the codes come back clean. Free, always.",
  },
];

const PAIN_POINTS = [
  {
    title: "Out of warranty, on your own",
    text: "Most European cars are out of warranty. When something goes wrong, the owner carries the risk and the bill alone.",
  },
  {
    title: "Codes that answer nothing",
    text: "\u201cP0420 — Catalyst System Efficiency Below Threshold.\u201d The light is on, the wallet is worried, and the message is in code.",
  },
  {
    title: "Apps that stop where it starts",
    text: "Scanning apps hand you a code and a paywall. They stop right where the journey begins — and charge you to go further.",
  },
  {
    title: "Trust, burned",
    text: "Pay-to-clear-the-light, subscription traps and dark-pattern billing have poisoned trust in the whole category.",
  },
];

/** Free and working in the app right now. */
const FREE_NOW = [
  "Adapter connection and setup wizard",
  "Fault-code reading with plain-language descriptions",
  "Severity verdict on standard code lookups",
  "Code clearing, with the honest warnings it deserves",
  "Demo scan and manual code entry",
  "One vehicle's scan history",
];

/** Published as free, still being built. Listed separately on purpose. */
const FREE_WHEN_SHIPPED = ["Freeze frames", "Live data for core sensors"];

/** Pro surfaces that exist in the app today (Pro billing is not switched on). */
const PRO_BUILT = [
  "AI root-cause analysis with reasoning and confidence",
  "DIY-vs-workshop cost decision with localized bands",
  "Step-by-step guided repairs and the re-scan verify flow",
];

/** Pro surfaces we intend to build. Named as intentions, not as features. */
const PRO_PLANNED = [
  "Multiple vehicles on one account",
  "Extended repair history and export",
  "A shareable report for your workshop",
];

const MARKETS = [
  {
    country: "Germany",
    tag: "First market",
    text: "The largest EU car market — and the place where an honest diagnostic partner matters most.",
  },
  {
    country: "United Kingdom",
    tag: "MOT-test pressure",
    text: "The annual MOT test turns every fault into a deadline, and there's zero localization cost for us.",
  },
  {
    country: "Albania",
    tag: "Pilot market",
    text: "Our pilot: a small, fast market where we test and sharpen the product before it scales.",
  },
];

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <div className="bg-white font-sans text-slate-900">
      <Nav />
      <main>
        <Hero />
        <ProductShowcase />
        <HowItWorks />
        <Why />
        <FreeForever />
        <Pricing />
        <Markets />
        <StoreApps />
      </main>
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav                                                                 */
/* ------------------------------------------------------------------ */

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a
          href="#top"
          className="flex items-center gap-2 rounded-control text-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-on-brand">
            <EngineMark className="h-4.5 w-4.5" />
          </span>
          <span className="text-lg font-bold tracking-tight">iMechanic</span>
        </a>
        <nav className="hidden items-center gap-7 lg:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-300 transition-colors hover:text-white"
            >
              {link.label}
            </a>
          ))}
        </nav>
        <a
          href="/app"
          className="inline-flex min-h-[2.75rem] items-center gap-2 rounded-control bg-brand px-4 text-sm font-bold text-on-brand transition-colors hover:bg-brand-strong"
        >
          Open the app
          <ArrowIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-navy-950 text-white">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-48 right-[-10%] h-[34rem] w-[34rem] rounded-full bg-amber-400/12 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[-12rem] left-[-8%] h-[28rem] w-[28rem] rounded-full bg-navy-700/50 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:pb-20 lg:pt-18">
        <div>
          <p className="im-rise mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-amber-300">
            <EngineMark className="h-3.5 w-3.5" />
            For out-of-warranty car owners
          </p>
          <h1 className="im-rise im-delay-1 text-[2.6rem] font-extrabold leading-[1.03] tracking-tight sm:text-5xl lg:text-[3.75rem]">
            From fault code to{" "}
            <span className="text-brand">completed repair.</span>
          </h1>
          <p className="im-rise im-delay-2 mt-6 max-w-xl text-lg leading-relaxed text-slate-300 sm:text-xl">
            Scan your car with any cheap OBD2 adapter and get a straight
            answer: <strong className="font-semibold text-white">drive on</strong>,{" "}
            <strong className="font-semibold text-white">repair soon</strong>,
            or{" "}
            <strong className="font-semibold text-white">stop driving</strong>.
            Then what it costs either way, and the steps to fix it.
          </p>

          <div className="im-rise im-delay-3 mt-8 flex flex-wrap items-center gap-3">
            <a href="/app" className={ctaPrimary}>
              Open the app
              <ArrowIcon />
            </a>
            <a href="#product" className={ctaOnNavy}>
              See the actual screens
            </a>
          </div>
          <p className="im-rise im-delay-3 mt-3 text-sm text-slate-400">
            Sign in with your email — no password, no card. Runs in your browser
            and installs to your home screen.
          </p>

          <ul className="im-rise im-delay-4 mt-8 space-y-2.5 border-t border-white/10 pt-7">
            {HERO_FACTS.map((fact) => (
              <li key={fact} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ok-solid text-on-ok">
                  <TickIcon className="h-3 w-3" />
                </span>
                <span className="text-[15px] font-medium leading-snug text-slate-200">
                  {fact}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* The hero visual IS the product: the real verdict + code cards. */}
        <div className="im-rise im-delay-2">
          <PhoneFrame label="Scan result" screenLabel="Sample scan result screen">
            <VerdictPanel severity="repair_soon" codeCount={1} />
            <FaultCodeCard {...SAMPLE_SCAN[0]} />
          </PhoneFrame>
          <p className="mx-auto mt-4 max-w-[21.5rem] text-center text-xs leading-relaxed text-slate-400">
            {SAMPLE_CAPTION}
          </p>
        </div>
      </div>

      {/* Capability strip — plain facts about the product, no social proof. */}
      <div className="relative border-t border-white/10 bg-navy-900/60">
        <dl className="mx-auto grid max-w-6xl gap-x-6 gap-y-5 px-4 py-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          {CAPABILITY_STRIP.map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-bold uppercase tracking-wider text-amber-300">
                {item.label}
              </dt>
              <dd className="mt-1 text-sm font-medium leading-snug text-slate-200">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* How it works — the golden path                                      */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  return (
    <section id="how" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="The golden path"
          title="Seven steps. No dead ends."
        >
          <p>
            From the moment the light comes on to the moment it's gone, every
            session follows the same path — and every step tells you what it
            knows, what it doesn't, and what it costs.
          </p>
        </SectionHeader>

        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.name}
              className={
                "im-reveal group relative flex flex-col rounded-2xl border p-6 transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:shadow-lg " +
                (i === 0
                  ? "border-brand bg-warn-fill lg:col-span-1"
                  : "border-line bg-surface-sunken hover:border-line-strong")
              }
            >
              <div className="flex items-center gap-3">
                <span
                  className={
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold " +
                    (i === 0
                      ? "bg-brand text-on-brand"
                      : "bg-navy-950 text-brand")
                  }
                >
                  {i + 1}
                </span>
                <h3 className="text-lg font-bold tracking-tight text-navy-950">
                  {step.name}
                </h3>
              </div>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-600">
                {step.text}
              </p>
            </li>
          ))}
          <li className="im-reveal flex flex-col justify-between rounded-2xl bg-navy-950 p-6 text-white">
            <div>
              <h3 className="text-lg font-bold tracking-tight">
                Walk it yourself
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-slate-300">
                The whole path is in the app now, on the free tier. Start with a
                demo scan if your adapter hasn't arrived yet.
              </p>
            </div>
            <a href="/app" className={ctaPrimary + " mt-6 w-full"}>
              Open the app
              <ArrowIcon />
            </a>
          </li>
        </ol>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Why iMechanic — the problem                                         */
/* ------------------------------------------------------------------ */

function Why() {
  return (
    <section id="why" className="bg-navy-950 py-16 text-white sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader
          eyebrow="Why iMechanic"
          title="The car industry left owners to guess."
          tone="dark"
        >
          <p>
            When the check-engine light comes on outside the warranty window,
            the owner is handed a mystery — and then a bill for decoding it.
            That's the gap iMechanic exists to close.
          </p>
        </SectionHeader>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {PAIN_POINTS.map((point, i) => (
            <div
              key={point.title}
              className="im-reveal rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors hover:border-white/20"
            >
              <span className="text-sm font-extrabold tabular-nums text-amber-300">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1 text-lg font-bold tracking-tight">
                {point.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-300">
                {point.text}
              </p>
            </div>
          ))}
        </div>

        <div className="im-reveal mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 sm:p-8">
          <h3 className="text-lg font-bold text-amber-300">Our bet</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {[
              [
                "Scanning is a commodity",
                "Any dongle can read a code. That part is solved and cheap.",
              ],
              [
                "Interpretation is the missing layer",
                "Explaining what it means — and what to do — is where owners are abandoned.",
              ],
              [
                "Honesty is a growth channel",
                "Do right by people once and they never go back to the paywalls.",
              ],
            ].map(([title, text]) => (
              <div key={title} className="rounded-xl bg-navy-900 p-5">
                <h4 className="font-bold text-white">{title}</h4>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-300">
                  {text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Free forever                                                        */
/* ------------------------------------------------------------------ */

function FreeForever() {
  return (
    <section id="free" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader eyebrow="The trust section" title="What's free, forever">
          <p>
            The free tier isn't a trial and it isn't a teaser. It's the core of
            the product — including the things most apps charge for that only
            breed resentment.
          </p>
        </SectionHeader>

        <ul className="im-reveal mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FREE_NOW.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-2xl border-2 border-ok-border bg-ok-fill p-5"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ok-solid text-on-ok">
                <TickIcon className="h-3.5 w-3.5" />
              </span>
              <span className="text-[15px] font-semibold leading-snug text-ok-fg">
                {item}
              </span>
            </li>
          ))}
        </ul>

        <div className="im-reveal mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface-sunken p-6">
            <h3 className="text-base font-bold text-navy-950">
              Free too, once they're built
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              We promised these as part of the free tier and they aren't in the
              app yet. They stay free when they land.
            </p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {FREE_WHEN_SHIPPED.map((item) => (
                <li
                  key={item}
                  className="rounded-full border border-line-strong bg-white px-3 py-1.5 text-sm font-semibold text-slate-700"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border-2 border-brand bg-warn-fill p-6">
            <h3 className="text-base font-bold text-warn-fg">
              Why the paywall sits where it does
            </h3>
            <p className="mt-1.5 text-[15px] font-medium leading-relaxed text-warn-fg">
              We deliberately left the resentment-generators out of it. If a
              feature is core to knowing whether your car is safe to drive,
              it's free — no pay-to-clear, no pay-to-read, no surprises.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing preview                                                     */
/*                                                                     */
/* Every figure comes from src/lib/market.ts — no price is written in   */
/* this file, and there is deliberately no checkout affordance: the     */
/* bands are an unvalidated preview, not something you can buy.         */
/* ------------------------------------------------------------------ */

function annualSavingPercent(annualCents: number, monthlyCents: number) {
  const yearOfMonths = monthlyCents * 12;
  if (yearOfMonths <= 0) return 0;
  return Math.round(((yearOfMonths - annualCents) / yearOfMonths) * 100);
}

function Pricing() {
  return (
    <section id="pricing" className="bg-app-bg py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="im-reveal max-w-2xl">
          <div className="flex flex-wrap items-center gap-3">
            <Eyebrow>Pricing</Eyebrow>
            <span className="rounded-full border border-line-strong bg-white px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-slate-600">
              Preview — not final
            </span>
          </div>
          <h2 className="mt-3 text-3xl font-extrabold leading-[1.1] tracking-tight text-navy-950 sm:text-4xl">
            One subscription. No dark patterns.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            iMechanic Pro will be a single, transparent subscription. These
            three bands are how we're testing what's fair — what separates them
            isn't decided, none of them is committed, and there's nothing to buy
            on this page.
          </p>
        </div>

        <div className="im-reveal mt-12 grid gap-4 md:grid-cols-3">
          {PRICE_BANDS.map((band) => (
            <div
              key={band.id}
              className="rounded-2xl border border-line bg-surface p-6 shadow-sm"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Pro · annual band
              </p>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-navy-950">
                {formatBandAnnual(band)}
                <span className="text-lg font-semibold text-slate-500">
                  {" "}
                  /year
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-600">
                or {formatBandMonthly(band)}/month — about{" "}
                {annualSavingPercent(band.annualCents, band.monthlyCents)}% less
                paid annually
              </p>
            </div>
          ))}
        </div>

        <div className="im-reveal mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h3 className="text-base font-bold text-navy-950">
              Pro surfaces already in the app
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              Built and working. Billing isn't switched on yet, so nothing is
              chargeable today — and the AI layer answers only when its provider
              is reachable.
            </p>
            <ul className="mt-4 space-y-2.5">
              {PRO_BUILT.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand/25 text-brand-fg">
                    <TickIcon className="h-3 w-3" />
                  </span>
                  <span className="text-[15px] leading-snug text-slate-700">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            <h3 className="text-base font-bold text-navy-950">
              What we intend to add
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              Intentions, not features. They aren't in the app yet and we won't
              pretend otherwise.
            </p>
            <ul className="mt-4 space-y-2.5">
              {PRO_PLANNED.map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-line-strong"
                  />
                  <span className="text-[15px] leading-snug text-slate-700">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <Note className="mt-6 max-w-3xl">{PRICING_PREVIEW_NOTE}</Note>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Markets                                                             */
/* ------------------------------------------------------------------ */

function Markets() {
  return (
    <section id="markets" className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeader eyebrow="Launch markets" title="Where we start">
          <p>
            Three markets to start — deliberately different, so we learn fast
            about what owners actually need.
          </p>
        </SectionHeader>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {MARKETS.map((market) => (
            <div
              key={market.country}
              className="im-reveal rounded-2xl border border-line bg-surface-sunken p-6"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-brand-fg">
                {market.tag}
              </p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-navy-950">
                {market.country}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
                {market.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Store apps + waitlist (supporting, not the main call to action)     */
/* ------------------------------------------------------------------ */

function StoreApps() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      await joinWaitlist({ data: email });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="beta" className="bg-navy-950 py-14 text-white sm:py-18">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="im-reveal grid gap-8 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <Eyebrow tone="dark">Store apps</Eyebrow>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Want it from the App Store or Google Play?
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
              The web app works today — open it in your browser and install it
              to your home screen. The iPhone and Android store builds are still
              in progress: an iPhone needs our native build to talk to an OBD2
              adapter at all. Leave your email and we'll tell you when they
              land.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a href="/app" className={ctaOnWhite}>
                Open the web app
                <ArrowIcon />
              </a>
            </div>
          </div>

          <div>
            {status === "done" ? (
              <div className="rounded-2xl border-2 border-ok-border bg-ok-fill p-6">
                <p className="text-base font-bold text-ok-fg">
                  You're on the list — we'll email you when the apps land.
                </p>
                <p className="mt-2 text-sm leading-relaxed text-ok-fg">
                  That's the whole promise. No spam, no pitches, one email.
                </p>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="flex flex-col gap-3">
                <label
                  htmlFor="waitlist-email"
                  className="text-sm font-semibold text-slate-200"
                >
                  Email address
                </label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <input
                    id="waitlist-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (status === "error") setStatus("idle");
                    }}
                    className="min-h-tap w-full flex-1 rounded-control border border-white/20 bg-white/5 px-4 text-base text-white placeholder:text-slate-400 focus:border-brand focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className={
                      ctaPrimary +
                      " shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
                    }
                  >
                    {status === "loading" ? "Signing up…" : "Keep me posted"}
                  </button>
                </div>
                {status === "error" && (
                  <p className="text-sm font-semibold text-red-300">
                    That email doesn't look right — please check it and try
                    again.
                  </p>
                )}
                <p className="text-sm leading-relaxed text-slate-400">
                  A mailing list, not an account — no charge, no obligation, and
                  you don't need it to use the app.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-navy-950 text-slate-300">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-on-brand">
                <EngineMark className="h-4 w-4" />
              </span>
              <span className="text-base font-bold tracking-tight">
                iMechanic
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              From fault code to completed repair. Reading codes and clearing
              them is free, always.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
              <a className="text-amber-300 hover:text-amber-200" href="/app">
                Open the app
              </a>
              <a className="text-slate-300 hover:text-white" href="#beta">
                Store-app mailing list
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Pricing principles
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              <li>No paywalls on core scanning — reading is free, always.</li>
              <li>
                One transparent subscription. No tiers that hide the real
                product.
              </li>
              <li>
                No dark patterns: no pay-to-clear, no surprise renewals, no fine
                print gotchas.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Data policy — in one paragraph
            </h3>
            <p className="mt-3 text-sm leading-relaxed">
              Your car's data is your data. iMechanic reads what your car
              reports and shows it to you in plain language. We don't sell it,
              we don't keep anything secret about what we collect, and we'll
              publish the full data policy before launch — readable, not
              legalese.
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-400 sm:flex-row">
          <p>© 2026 iMechanic</p>
          <p className="font-medium text-amber-300/90">
            Reading codes and clearing them is free. Always.
          </p>
        </div>
      </div>
    </footer>
  );
}
