import { createServerFn } from "@tanstack/react-start";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { sql } from "../db";

/* ------------------------------------------------------------------ */
/* Waitlist server function                                            */
/* ------------------------------------------------------------------ */

const joinWaitlist = createServerFn({ method: "POST" })
  .validator((value: unknown) => {
    if (typeof value !== "string") {
      throw new Error("Invalid email");
    }
    const email = value.trim().toLowerCase();
    // Keep validation intentionally simple; the full flow arrives with the beta.
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new Error("Invalid email");
    }
    return email;
  })
  .handler(async ({ data }) => {
    const message = "You're on the list — we'll be in touch when the beta opens.";
    try {
      const db = sql();
      // Idempotent one-time schema creation — safe to re-run on every call.
      await db`CREATE TABLE IF NOT EXISTS waitlist (
        email text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now()
      )`;
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
/* Icons (inline, lightweight)                                         */
/* ------------------------------------------------------------------ */

function WrenchIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function CheckIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function StepIcon({ step, className = "h-6 w-6" }: { step: number; className?: string }) {
  const paths = [
    // 1 Connect — plug
    <path key="p" d="M12 22v-3" />,
    // 2 Scan — magnifier
    <path key="p" d="M21 21l-4.35-4.35" />,
    // 3 Understand — brain/lightbulb
    <path key="p" d="M12 2v4" />,
    // 4 Verdict — traffic light
    <path key="p" d="M12 2v4" />,
    // 5 Decide — two coins
    <path key="p" d="M12 22v-3" />,
    // 6 Act — wrench
    <path key="p" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />,
    // 7 Verify — shield check
    <path key="p" d="M12 2v4" />,
  ];
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      {paths[step - 1]}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#why", label: "Why iMechanic" },
  { href: "#free", label: "Free forever" },
  { href: "#pricing", label: "Pricing" },
];

const STEPS = [
  {
    name: "Connect",
    text: "Works with any generic ELM327 adapter (Bluetooth, BLE or Wi-Fi) you already own. A guided wizard that's honest about cheap clone adapters — and a demo mode so you can try the whole experience before buying anything.",
  },
  {
    name: "Scan",
    text: "Reads fault codes, freeze frames, readiness monitors and live sensor data in under 30 seconds. Your raw data is always visible next to our interpretation — we never invent codes.",
  },
  {
    name: "Understand",
    text: "AI reasons over codes, freeze frames, live fuel-trim data, your exact vehicle (VIN-decoded), mileage and a short symptom interview. You get ranked probable root causes with confidence — ordered cheapest-to-confirm first.",
  },
  {
    name: "Verdict",
    text: "Every session ends with one of three clear answers: Drive on, Repair soon, or Stop driving — with a one-line justification.",
  },
  {
    name: "Decide",
    text: "A side-by-side comparison of the DIY path (parts cost, tools, difficulty 1–5, time) and the workshop path (fair localized labor plus a parts range). You choose with real numbers, not fear.",
  },
  {
    name: "Act",
    text: "DIY: step-by-step guided repairs with parts lists and safety warnings — safety-critical work like brakes, airbags and fuel lines is routed to a workshop. Workshop: a professional PDF diagnostic report and a \u201cquestions to ask your mechanic\u201d checklist.",
  },
  {
    name: "Verify",
    text: "Re-scan after the repair, confirm the fault is gone, clear the codes. Free, always.",
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

const FREE_FOREVER = [
  "Adapter connection and setup wizard",
  "Full fault-code reading with plain-language descriptions",
  "Freeze frames",
  "Live data for core sensors",
  "Severity verdict on standard code lookups",
  "Code clearing",
  "One vehicle's history",
  "Demo mode",
];

const PRO_UNLOCKS = [
  "AI diagnosis engine with symptom interview and ranked root causes",
  "Step-by-step repair flows",
  "DIY-vs-workshop cost comparison with localized pricing",
  "Professional PDF reports",
  "Unlimited vehicles",
  "Full history export",
];

const PRICE_BANDS = [
  { monthly: "€3.99", annual: "€31.99" },
  { monthly: "€4.99", annual: "€39.99" },
  { monthly: "€5.99", annual: "€47.99" },
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
        <HowItWorks />
        <Why />
        <FreeForever />
        <Pricing />
        <Markets />
        <Beta />
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <a href="#top" className="flex items-center gap-2 text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400 text-navy-950">
            <WrenchIcon className="h-4.5 w-4.5" />
          </span>
          <span className="text-lg font-bold tracking-tight">iMechanic</span>
        </a>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Main">
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
        <div className="flex items-center gap-2">
          <a
            href="/app"
            className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/5"
          >
            Open the app
          </a>
          <a
            href="#beta"
            className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-navy-950 transition-colors hover:bg-amber-300"
          >
            Join the beta
          </a>
        </div>
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Hero                                                                */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-navy-950 text-white">
      {/* subtle glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 right-0 h-130 w-130 rounded-full bg-amber-400/10 blur-3xl"
      />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:pb-24 lg:pt-20">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
            For out-of-warranty car owners
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            From fault code to{" "}
            <span className="text-amber-400">completed repair.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
            That check-engine light doesn't have to mean a guessing game.
            iMechanic turns it into a completed, affordable repair: AI
            root-cause diagnosis, an honest severity verdict, a
            DIY-vs-workshop cost decision, and step-by-step guided repairs. It
            works with the OBD2 adapter you already own.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a
              href="#beta"
              className="rounded-lg bg-amber-400 px-6 py-3 text-base font-semibold text-navy-950 transition-colors hover:bg-amber-300"
            >
              Join the beta waitlist
            </a>
            <a
              href="#how"
              className="rounded-lg border border-white/20 px-6 py-3 text-base font-semibold text-white transition-colors hover:border-white/40 hover:bg-white/5"
            >
              See how it works
            </a>
          </div>
          <p className="mt-8 flex items-center gap-2 text-sm font-medium text-amber-300">
            <CheckIcon className="h-4 w-4" />
            Reading codes and clearing them is free. Always.
          </p>
        </div>
        <div className="mx-auto w-full max-w-sm lg:max-w-none">
          <div className="overflow-hidden rounded-3xl border border-white/10 bg-navy-900 shadow-2xl shadow-black/40">
            <img
              src="/hero.webp"
              alt="Illustration of a smartphone showing an iMechanic-style diagnosis flowing from a check-engine light to a repaired, green checkmark"
              width={900}
              height={900}
              loading="eager"
              className="h-auto w-full object-cover"
            />
          </div>
        </div>
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
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">
            The golden path
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl">
            Seven steps. No dead ends.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            From the moment the light comes on to the moment it's gone, every
            iMechanic session follows the same honest path — and you can walk
            all seven steps in demo mode before you plug in a single adapter.
          </p>
        </div>

        {/* flow strip */}
        <div className="mt-10 flex flex-wrap items-center gap-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4">
          {STEPS.map((step, i) => (
            <span key={step.name} className="flex items-center">
              <span className="text-sm font-semibold text-navy-900">
                <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-400/20 text-[11px] font-bold text-amber-700">
                  {i + 1}
                </span>
                {step.name}
              </span>
              {i < STEPS.length - 1 && (
                <ArrowIcon className="mx-2.5 h-3.5 w-3.5 text-slate-400" />
              )}
            </span>
          ))}
        </div>

        {/* banner illustration */}
        <div className="mt-8 overflow-hidden rounded-3xl border border-navy-800 bg-navy-950">
          <img
            src="/golden.webp"
            alt="Illustration of the seven-step golden path: connect, scan, understand, verdict, decide, act, verify"
            width={900}
            height={900}
            loading="lazy"
            className="h-auto w-full object-cover"
          />
        </div>

        {/* step cards */}
        <div className="mt-10">
          {/* Connect — the highlighted entry point */}
          <article className="flex flex-col gap-5 rounded-2xl border border-amber-300/70 bg-amber-50 p-6 shadow-sm sm:flex-row sm:items-start">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400 text-navy-950">
              <StepIcon step={1} />
            </span>
            <div>
              <h3 className="text-lg font-bold text-navy-950">
                1. {STEPS[0].name}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {STEPS[0].text}
              </p>
            </div>
          </article>

          {/* steps 2–7 */}
          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.slice(1).map((step, i) => (
              <article
                key={step.name}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-950 text-amber-400">
                  <StepIcon step={i + 2} />
                </span>
                <h3 className="mt-4 text-lg font-bold text-navy-950">
                  {i + 2}. {step.name}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {step.text}
                </p>
              </article>
            ))}
          </div>
        </div>
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
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
            Why iMechanic
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            The car industry left owners to guess.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-300">
            When the check-engine light comes on outside the warranty window,
            the owner is handed a mystery — and then a bill for decoding it.
            That's the gap iMechanic exists to close.
          </p>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2">
          {PAIN_POINTS.map((point, i) => (
            <div
              key={point.title}
              className="rounded-2xl border border-white/10 bg-white/5 p-6"
            >
              <span className="text-sm font-bold text-amber-400">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-1 text-lg font-bold">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {point.text}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-6 sm:p-8">
          <h3 className="text-lg font-bold text-amber-300">Our bet</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {[
              ["Scanning is a commodity", "Any dongle can read a code. That part is solved and cheap."],
              ["Interpretation is the missing layer", "Explaining what it means — and what to do — is where owners are abandoned."],
              ["Honesty is a growth channel", "Do right by people once and they never go back to the paywalls."],
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
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">
            The trust section
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl">
            What's free, forever
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            The free tier isn't a trial and it isn't a teaser. It's the core
            of the product — and it stays free, including the things most apps
            charge for that only breed resentment.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FREE_FOREVER.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckIcon className="h-3.5 w-3.5" />
              </span>
              <span className="text-sm font-medium leading-snug text-slate-800">
                {item}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          We deliberately left the resentment-generators out of the paywall.
          If a feature is core to fixing your car, it's free — no pay-to-clear,
          no pay-to-read, no surprises.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Pricing preview                                                     */
/* ------------------------------------------------------------------ */

function Pricing() {
  return (
    <section id="pricing" className="bg-slate-50 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">
            Pricing preview
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl">
            One subscription. No dark patterns.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            iMechanic Pro is a single, transparent subscription. Here's a
            preview of the three price bands — the exact price for your
            market is finalized at launch.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {PRICE_BANDS.map((band, i) => (
            <div
              key={band.annual}
              className={
                "rounded-2xl border bg-white p-6 shadow-sm " +
                (i === 1
                  ? "border-amber-400 ring-2 ring-amber-400/40"
                  : "border-slate-200")
              }
            >
              <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Pro · annual
              </p>
              <p className="mt-3 text-4xl font-extrabold tracking-tight text-navy-950">
                {band.annual}
                <span className="text-lg font-semibold text-slate-500">
                  {" "}
                  /year
                </span>
              </p>
              <p className="mt-2 text-sm text-slate-600">
                or {band.monthly}/month — roughly 33% off with annual billing
              </p>
              {i === 1 && (
                <p className="mt-3 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  Most popular annual band
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-navy-950">What Pro unlocks</h3>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {PRO_UNLOCKS.map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/20 text-amber-700">
                  <CheckIcon className="h-3 w-3" />
                </span>
                <span className="text-sm leading-snug text-slate-700">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Preview pricing — bands and discounts are indicative and will be
          finalized at launch. Reading and clearing codes stays free, always.
        </p>
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
        <div className="max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-amber-600">
            Launch markets
          </p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-navy-950 sm:text-4xl">
            Where we start
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Three markets to start — deliberately different, so we learn fast
            about what owners actually need.
          </p>
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {MARKETS.map((market) => (
            <div
              key={market.country}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-6"
            >
              <p className="text-xs font-bold uppercase tracking-wider text-amber-600">
                {market.tag}
              </p>
              <h3 className="mt-2 text-xl font-bold text-navy-950">
                {market.country}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
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
/* Beta waitlist                                                       */
/* ------------------------------------------------------------------ */

function Beta() {
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
    <section id="beta" className="relative overflow-hidden bg-navy-950 py-16 text-white sm:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 left-1/2 h-100 w-150 -translate-x-1/2 rounded-full bg-amber-400/10 blur-3xl"
      />
      <div className="relative mx-auto max-w-2xl px-4 text-center sm:px-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-amber-400">
          Beta waitlist
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Join the beta.
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-slate-300">
          Be among the first to go from fault code to completed repair. The
          beta starts small — everyone on the list gets an email the moment it
          opens, before anyone else.
        </p>

        {status === "done" ? (
          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-6">
            <p className="text-base font-semibold text-emerald-300">
              You're on the list — we'll be in touch when the beta opens.
            </p>
            <p className="mt-2 text-sm text-slate-300">
              That's the whole promise. No spam, no pitches — one email when
              the beta is ready.
            </p>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row"
          >
            <label htmlFor="waitlist-email" className="sr-only">
              Email address
            </label>
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
              className="w-full flex-1 rounded-lg border border-white/20 bg-white/5 px-4 py-3 text-base text-white placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-lg bg-amber-400 px-6 py-3 text-base font-semibold text-navy-950 transition-colors hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "loading" ? "Signing up…" : "Join the beta"}
            </button>
          </form>
        )}

        {status === "error" && (
          <p className="mt-3 text-sm font-medium text-red-400">
            That email doesn't look right — please check it and try again.
          </p>
        )}

        <p className="mt-6 text-sm text-slate-400">
          This is a waitlist, not an account — no charge, no obligation. When
          the beta opens we'll email you a download link and a short guide.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Footer                                                              */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="bg-navy-950 text-slate-300">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-400 text-navy-950">
                <WrenchIcon className="h-4 w-4" />
              </span>
              <span className="text-base font-bold tracking-tight">iMechanic</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              From fault code to completed repair. Reading codes and clearing
              them is free, always.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Pricing principles
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              <li>No paywalls on core scanning — reading is free, always.</li>
              <li>One transparent subscription. No tiers that hide the real product.</li>
              <li>No dark patterns: no pay-to-clear, no surprise renewals, no fine print gotchas.</li>
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