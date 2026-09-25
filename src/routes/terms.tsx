/**
 * /terms — the public terms of use (slice S9b).
 *
 * Plain-language terms for a diagnostic tool whose worst failure mode is a
 * driver trusting it too much. The safety disclaimer is therefore the second
 * thing on the page, not paragraph 14 of fine print.
 *
 * Every factual claim is taken from the built product: what stays free
 * (AGENTS.md "free tier is sacred" + the live landing page), what Pro adds
 * (`src/lib/pro-limits.ts`, `src/components/pro/*`), and the pricing status
 * (three annual-first bands in `src/lib/market.ts`, labelled a preview; the
 * Stripe keys in use are sandbox keys, so no money moves).
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  B,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  P,
  Placeholder,
} from "../components/legal/legal-page";
import {
  CONTACT_EMAIL,
  LEGAL_PLACEHOLDERS,
  contactMailto,
} from "../lib/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of use — iMechanic" },
      {
        name: "description",
        content:
          "The rules for using iMechanic, in plain language — including the safety disclaimer: our diagnoses are guidance, not a substitute for a qualified mechanic.",
      },
    ],
  }),
  component: TermsPage,
});

const TOC = [
  { id: "agreement", label: "This agreement" },
  { id: "safety", label: "Safety comes first" },
  { id: "what-it-is", label: "What iMechanic is" },
  { id: "your-part", label: "Your part" },
  { id: "free-and-pro", label: "Free, Pro and prices" },
  { id: "clearing-codes", label: "Clearing codes honestly" },
  { id: "fair-use", label: "Fair use" },
  { id: "availability", label: "Availability and changes" },
  { id: "liability", label: "Liability" },
  { id: "ending", label: "Ending your use" },
  { id: "law", label: "Which law applies" },
  { id: "contact", label: "Contact" },
];

function TermsPage() {
  return (
    <LegalPage
      title="Terms of use"
      lede={
        <>
          The agreement between you and iMechanic. Short version: use it, trust
          it as guidance rather than gospel, and you stay responsible for your
          car. The long version is below and it is still not long.
        </>
      }
      toc={TOC}
    >
      <LegalSection id="agreement" title="This agreement">
        <P>
          iMechanic is operated by{" "}
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_ENTITY_NAME}</Placeholder>,{" "}
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_ENTITY_ADDRESS}</Placeholder>.
        </P>
        <P>
          By using iMechanic — the website, the web app at{" "}
          <span className="font-mono text-xs">/app</span>, or the iPhone and
          Android apps — you accept these terms. If you do not accept them, do
          not use iMechanic. You must be old enough to enter a contract where you
          live.
        </P>
      </LegalSection>

      <LegalSection id="safety" title="Safety comes first">
        <P>
          <B>
            iMechanic's diagnoses are guidance. They are not a substitute for a
            qualified mechanic, and they are not a roadworthiness inspection.
          </B>{" "}
          The verdicts come from your car's own fault codes, a reference
          catalogue and — if you use it — an AI model. All three can be wrong,
          incomplete, or right about a different fault than the one your car
          actually has.
        </P>
        <P>
          <B>
            You are responsible for the repairs you carry out and for deciding
            whether the car is safe to drive.
          </B>{" "}
          If iMechanic says &quot;stop driving&quot;, stop driving and have the
          car looked at — that verdict exists because the code is associated with
          a risk to people, and it is never an attempt to sell you anything.
        </P>
        <LegalList>
          <li>
            Work on a car can hurt you: hot surfaces, high voltages, fuel, moving
            parts, and stored energy that does not care that the ignition is off.
          </li>
          <li>
            Do not rely on iMechanic for a safety-critical decision on its own.
            Have brakes, steering, airbags, fuel systems and high-voltage
            systems checked by a qualified workshop.
          </li>
          <li>
            If what you see under the car or on the road test does not match what
            the app said, trust what you see.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="what-it-is" title="What iMechanic is">
        <P>
          iMechanic connects to a cheap OBD2 adapter you already own, reads the
          fault codes your car reports, explains them in plain English, gives a
          severity verdict, and — with Pro — an AI root cause, a DIY-versus-
          workshop cost decision and step-by-step guided repairs.
        </P>
        <P>
          It is a decision aid. It does not replace a workshop, it does not
          perform a repair, and it cannot see or touch your car.
        </P>
        <P>
          Adapters vary. Generic ELM327 devices — including the cheap clones —
          are supported, but an adapter that misbehaves, a car that does not
          fully implement the standard, or a lost Bluetooth connection can all
          mean an incomplete reading. When the app cannot read something it says
          so; it does not invent a code or a diagnosis.
        </P>
      </LegalSection>

      <LegalSection id="your-part" title="Your part">
        <LegalList>
          <li>
            Use iMechanic only on a car you own or are authorised to work on.
          </li>
          <li>
            Keep your sign-in email secure: whoever can open your sign-in link
            can reach your garage and scan history.
          </li>
          <li>
            Give the app honest data. Mileage and vehicle details shape the
            advice, and a wrong figure produces wrong guidance.
          </li>
          <li>
            Follow the law where you are: roadworthiness, emissions and
            inspection rules are yours to keep, not ours.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="free-and-pro" title="Free, Pro and prices">
        <P>
          These stay free and we will not put them behind a paywall: connecting
          to your adapter, reading fault codes, their plain-English meaning, the
          severity verdict from the rules engine, clearing codes, and the demo
          scan and manual code entry. That promise is the product, not a trial.
        </P>
        <P>
          <B>iMechanic Pro</B> is the paid tier: AI root-cause analysis with its
          reasoning and confidence, the DIY-versus-workshop cost decision, guided
          repairs and the re-scan verification flow, and — as they ship —
          multiple vehicles and extended repair history.
        </P>
        <P>
          <B>Billing is not switched on yet.</B> The three price bands shown on
          the site and in the app are explicitly labelled a preview while
          iMechanic is in beta: no payment is taken, nothing is charged, and no
          subscription starts by using the app. When billing does go live you
          will see the price and the terms before you pay, and a price change
          will never apply silently to an existing subscription.
        </P>
        <P>
          In the Android app, Pro is not sold at all: purchases there are handled
          only through the app store's own billing if and when we offer it, so an
          Android build never sends you anywhere else to pay.
        </P>
      </LegalSection>

      <LegalSection id="clearing-codes" title="Clearing codes honestly">
        <P>
          Clearing fault codes is free because hiding a fault should never cost
          money. But clearing a code does not fix the fault, and it can hide a
          problem that matters. The app warns you before it clears, and you
          should read that warning.
        </P>
        <P>
          One thing we will not help with: clearing codes to mislead someone —
          passing an emissions or roadworthiness test, or selling a car with a
          fault you have erased. That is your legal problem and it is not what
          iMechanic is for.
        </P>
      </LegalSection>

      <LegalSection id="fair-use" title="Fair use">
        <LegalList>
          <li>
            Do not attack, overload, scrape or reverse-engineer the service, or
            try to reach another person's data.
          </li>
          <li>
            Do not resell iMechanic, or present its output as your own
            diagnostic service without saying where it came from.
          </li>
          <li>
            Respect the limits we set (for example how many vehicles or how much
            history a free account holds) instead of working around them.
          </li>
        </LegalList>
        <P className="mt-4">
          We may suspend an account that is being used to damage the service or
          other people. If we do, we will say why.
        </P>
      </LegalSection>

      <LegalSection id="availability" title="Availability and changes">
        <P>
          iMechanic is a young product. Features appear, change and occasionally
          go away, and the service may be unavailable while we work on it. The AI
          feature in particular depends on a third-party model and can be
          unavailable at any time — when that happens the app says so and falls
          back to the free rules engine.
        </P>
        <P>
          We may update these terms. If a change materially affects you we will
          tell signed-in users in the app and update the date at the top of this
          page. Continuing to use iMechanic after that means you accept the new
          terms.
        </P>
      </LegalSection>

      <LegalSection id="liability" title="Liability">
        <P>
          iMechanic is provided as it is. We do not promise that a diagnosis is
          correct, that a fault is fully identified, or that a repair you carry
          out will succeed. To the extent the law allows, we are not liable for
          damage to your car, lost time, lost money, or a repair that did not
          fix the problem.
        </P>
        <P>
          <B>Nothing in these terms limits liability that cannot be limited</B> —
          including liability for death or personal injury caused by negligence,
          for fraud, or any right you have as a consumer under the mandatory law
          where you live. If a court finds part of these terms unenforceable,
          the rest still stands.
        </P>
      </LegalSection>

      <LegalSection id="ending" title="Ending your use">
        <P>
          You can stop using iMechanic at any time, and you can ask us to delete
          your account and data — see the{" "}
          <LegalLink href="/delete-account">account deletion page</LegalLink>{" "}
          and the{" "}
          <LegalLink href="/privacy">privacy policy</LegalLink>. We may end or
          suspend access if these terms are broken, or if we stop running the
          service.
        </P>
      </LegalSection>

      <LegalSection id="law" title="Which law applies">
        <P>
          These terms are governed by the law of{" "}
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_JURISDICTION}</Placeholder>. If
          you are a consumer, you keep the protection of the mandatory consumer
          law of the country you live in, and you may bring proceedings there.
        </P>
      </LegalSection>

      <LegalSection id="contact" title="Contact">
        <P>
          Questions about these terms, or about anything the app told you:{" "}
          <LegalLink href={contactMailto("iMechanic terms question")}>
            {CONTACT_EMAIL}
          </LegalLink>
          .
        </P>
        <P>
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_ENTITY_NAME}</Placeholder>,{" "}
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_ENTITY_ADDRESS}</Placeholder>
        </P>
      </LegalSection>
    </LegalPage>
  );
}
