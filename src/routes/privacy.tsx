/**
 * /privacy — the public privacy policy (slice S9b).
 *
 * EVERY statement on this page is derived from the code, not from a template:
 *  - categories and columns  → db/migrations/001_init.sql, 002_s1_1_integrity.sql
 *  - session cookie + tokens → src/server/auth-core.ts (imechanic.session, 30d,
 *                              HttpOnly/Secure/SameSite=Lax; tokens stored only
 *                              as SHA-256 hashes)
 *  - theme storage           → src/lib/theme.ts (localStorage `imechanic.theme`)
 *  - Bluetooth               → android/app/src/main/AndroidManifest.xml
 *                              (`usesPermissionFlags="neverForLocation"`,
 *                              location capped at `maxSdkVersion="30"`), the
 *                              iOS usage strings in ios/App/App/Info.plist
 *  - the AI payload          → src/server/ai-core.ts `buildAiPrompt` +
 *                              src/server/scans-core.ts `loadAiContextCore`
 *  - processors              → src/server/email.ts (Resend),
 *                              src/server/pro-checkout.ts (Stripe),
 *                              src/db.ts (Neon), vercel-entry.ts (Vercel)
 *  - no tracking             → no analytics/ad SDK in package.json and no
 *                              third-party script in public/ or src/ (checked)
 *  - account deletion is NOT implemented yet → there is no delete path in
 *    src/ (only the magic-link/session sign-out); the page says so in plain
 *    words instead of claiming a button that does not exist.
 * If the code changes, this page changes in the same pull request.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  B,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalTable,
  P,
  Placeholder,
} from "../components/legal/legal-page";
import {
  CONTACT_EMAIL,
  LEGAL_PLACEHOLDERS,
  contactMailto,
} from "../lib/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — iMechanic" },
      {
        name: "description",
        content:
          "What iMechanic stores, why it stores it, exactly what is sent to our processors — and what we never do with your car's data.",
      },
    ],
  }),
  component: PrivacyPage,
});

const TOC = [
  { id: "who-we-are", label: "Who we are" },
  { id: "what-we-store", label: "What we store" },
  { id: "bluetooth", label: "Bluetooth and location" },
  { id: "cookies", label: "Cookies and local storage" },
  { id: "processors", label: "Who else processes it" },
  { id: "anthropic", label: "What the AI receives" },
  { id: "never", label: "What we never do" },
  { id: "retention", label: "How long we keep it" },
  { id: "deletion", label: "Deleting your data" },
  { id: "rights", label: "Your rights" },
  { id: "security", label: "How it is protected" },
  { id: "changes", label: "Changes to this policy" },
];

function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      lede={
        <>
          iMechanic reads your car's fault codes and helps you decide what to do
          about them. That means it handles data about you and about your car.
          This page says — in plain words — what is stored, why, who else sees
          it, and how to get rid of it.
        </>
      }
      toc={TOC}
    >
      <LegalSection id="who-we-are" title="Who we are">
        <P>
          iMechanic is operated by{" "}
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_ENTITY_NAME}</Placeholder>,{" "}
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_ENTITY_ADDRESS}</Placeholder>.
          That entity is the data controller for everything described below.
        </P>
        <P>
          For any question about this policy, or to exercise any of the rights at
          the end of it, write to{" "}
          <LegalLink href={contactMailto("iMechanic privacy request")}>
            {CONTACT_EMAIL}
          </LegalLink>
          .
        </P>
        <P>
          iMechanic is launched in <B>Germany</B>, the <B>United Kingdom</B> and{" "}
          <B>Albania</B>. If you are in the EU or the UK, the GDPR and UK GDPR
          apply; we follow them rather than the minimum wherever the rest of
          Europe is stricter.
        </P>
      </LegalSection>

      <LegalSection id="what-we-store" title="What we store">
        <P>
          Three rules, then the detail. We store what the app needs to work; we
          do not ask for anything it does not use; and we do not have fields for
          a name, an address, a phone number, contacts, photos or files —
          because the app has no use for them and we would rather not hold them.
        </P>
        <LegalTable
          label="Categories of data iMechanic stores"
          head={["What", "Why it exists", "Where it lives"]}
          rows={[
            [
              "Email address",
              "Sign-in is passwordless: we email you a one-time link. There is no password to store.",
              "Account record; the sign-in link itself is stored only as a hash, for 15 minutes",
            ],
            [
              "Country (Germany, UK or Albania)",
              "Decides the currency and the typical workshop price bands you see. You choose it; you can change or clear it any time.",
              "Account record",
            ],
            [
              "Your vehicles",
              "Make, model, year, engine, VIN and mileage in km. Only what you type into the form — nothing is read out of your car's registration or from any external source.",
              "Vehicle records",
            ],
            [
              "Scans and fault codes",
              "The date, whether the scan was live / demo / typed in, which vehicle it belongs to, each fault code with its status (stored, pending, permanent), the VIN if your adapter reported one, and — for a live scan — the short adapter transcript that shows what was actually asked and answered.",
              "Scan records and code rows",
            ],
            [
              "Diagnoses",
              "The severity verdict (drive on / repair soon / stop driving), the root cause, the confidence, the reasoning, and the DIY-versus-workshop cost bands in your currency.",
              "Diagnosis records",
            ],
            [
              "Repair jobs",
              "The repair you started, which steps you ticked off, and the re-scan that verified the codes are gone.",
              "Repair records",
            ],
            [
              "Subscription status",
              "Whether iMechanic Pro is active, which price band it is on and when the period ends, plus an identifier for your billing record at Stripe.",
              "Subscription record. Card and bank details are handled by Stripe and never reach iMechanic's own systems.",
            ],
            [
              "Sign-in session",
              "Keeps you signed in without a password. The cookie holds a random token whose hash is what the database stores.",
              "Session record, 30 days",
            ],
            [
              "Mailing-list email",
              "Only if you used the 'tell me when the apps land' form on the marketing page.",
              "A separate mailing-list record, not linked to an account",
            ],
          ]}
        />
        <P className="mt-4">
          A note on what we deliberately do <B>not</B> have: there is no field for
          your name, and no location, contact, photo or file data anywhere in the
          product. Diagnosis notes are not free-text and do not exist today.
          Freeze-frame data is a published future feature — nothing stores it
          yet.
        </P>
      </LegalSection>

      <LegalSection id="bluetooth" title="Bluetooth and location">
        <P>
          Bluetooth in iMechanic does exactly one thing: it talks to the OBD2
          adapter you already own, so the app can read and clear your car's fault
          codes. Nothing else. Adapter scans are <B>not</B> used to work out
          where you are, and iMechanic never asks for your GPS position.
        </P>
        <P>
          The Android build states this to the operating system itself: the
          manifest declares the Bluetooth scan permission with{" "}
          <code className="font-mono text-xs text-fg">
            usesPermissionFlags=&quot;neverForLocation&quot;
          </code>
          , which is Android's own promise that scan results are not used to
          derive location.
        </P>
        <P>
          On <B>Android 11 and older</B>, Android requires the location
          permission before any app may scan for Bluetooth devices at all — there
          is no Bluetooth-only option on those versions. iMechanic declares that
          permission capped at Android 11 for this one purpose, only to pair with
          the adapter. On Android 12 and newer the app asks only for Bluetooth
          permissions. On iOS the app asks for Bluetooth access, with the system
          prompt stating that it is used only to connect to your OBD2 adapter.
        </P>
        <P>
          You can use iMechanic without Bluetooth at all: the demo scan and
          manual code entry need no radio and no adapter, and the app works fine
          if you decline the Bluetooth permission.
        </P>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and local storage">
        <LegalList>
          <li>
            <B>imechanic.session</B> — the sign-in cookie. It is HttpOnly (no
            script on the page can read it), Secure (sent only over HTTPS),
            SameSite=Lax, and it lasts 30 days. Signing out deletes the session
            on the server as well as clearing the cookie.
          </li>
          <li>
            <B>imechanic.theme</B> — your choice of light, dark or system theme,
            kept in your browser's local storage. It never leaves your device.
          </li>
          <li>
            <B>An offline cache</B> — the app is installable, so it keeps a copy
            of its own pages and assets in the browser's cache so it can open
            without a network. Signing out wipes that cache.
          </li>
        </LegalList>
        <P className="mt-4">
          There are no advertising, analytics or tracking cookies. Nothing on the
          site or in the app sets one.
        </P>
      </LegalSection>

      <LegalSection id="processors" title="Who else processes it">
        <P>
          We do not sell or rent data, and we do not share it with anyone beyond
          the service providers that make the product work. Each one gets the
          minimum it needs:
        </P>
        <LegalTable
          label="Service providers that process iMechanic data"
          head={["Provider", "What it does", "What it receives"]}
          rows={[
            [
              "Vercel",
              "Hosts and delivers the website and the web app.",
              "Standard server request data (IP address, user agent, the page requested) for as long as their logs keep it.",
            ],
            [
              "Neon",
              "Runs the PostgreSQL database that holds everything in the table above.",
              "The stored data itself, at rest, in our database region.",
            ],
            [
              "Stripe",
              "Processes iMechanic Pro subscriptions. Web only — the Android app never offers a purchase and cannot start a checkout at all.",
              "Your email address, to create the billing record, plus the subscription state. Your card details go to Stripe directly and are never seen or stored by iMechanic.",
            ],
            [
              "Resend",
              "Sends the one-time sign-in email.",
              "Your email address and the sign-in link.",
            ],
            [
              "Anthropic",
              "Answers the optional Pro 'AI root cause' question. See the next section for exactly what it is sent.",
              "The fault codes on that one scan, the vehicle details you saved, and the free rules verdict — never your email, name, VIN or account identifier.",
            ],
          ]}
        />
        <P className="mt-4">
          The AI is a feature you have to trigger, and it is part of Pro. If you
          never tap it, nothing about your scan is sent anywhere except our own
          database.
        </P>
      </LegalSection>

      <LegalSection id="anthropic" title="What the AI receives">
        <P>
          When you ask for an AI root cause on a scan, iMechanic sends one
          request to Anthropic's API. This is the complete list of what is in it —
          read off the code, not summarised:
        </P>
        <LegalList>
          <li>
            the <B>fault codes</B> from that scan, each with its status and the
            generic catalogue meaning and system (for example{" "}
            <span className="font-mono text-xs">P0420 — catalyst system</span>);
          </li>
          <li>
            the <B>vehicle details you saved</B> — make, model, year and mileage
            in km;
          </li>
          <li>
            the <B>free rules verdict</B> for that scan and its reasons, so the
            model cannot contradict a &quot;stop driving&quot; safety call; and
          </li>
          <li>
            a fixed instruction describing what to answer. That instruction is
            the same for every user.
          </li>
        </LegalList>
        <P className="mt-4">
          <B>What is not sent:</B> your email address, your name (we don't have
          it), your VIN, your account or session identifier, your scan or repair
          history, your country, and anything about your device or location. The
          request is not used to identify you, and iMechanic does not send
          follow-up data about you afterwards.
        </P>
        <P>
          The answer is stored against your scan so we never pay twice for the
          same question. If the AI is unavailable, iMechanic says so and falls
          back to the free rules engine — it never makes a diagnosis up.
        </P>
      </LegalSection>

      <LegalSection id="never" title="What we never do">
        <LegalList>
          <li>We do not sell, rent or trade your data.</li>
          <li>
            We do not run advertising, and there is no analytics or tracking
            software in the site or the app — no ad network, no session
            recorder, no third-party tag.
          </li>
          <li>
            We do not build an advertising profile of you, and we do not use your
            car's data for anything except showing it back to you and diagnosing
            it.
          </li>
          <li>
            We do not send marketing email to an address you gave us for
            sign-in. The mailing list on the marketing page is separate, and one
            click in it removes you.
          </li>
          <li>
            We do not load fonts, scripts or images from third-party domains —
            they are served from our own site, so visiting iMechanic does not
            hand your IP address to anyone else.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <LegalTable
          label="Retention periods"
          head={["Data", "Kept for"]}
          rows={[
            [
              "Your account, vehicles, scans, codes, diagnoses and repair jobs",
              "Until you ask us to delete them. There is no automatic expiry today — your repair history is the point of the product, so we keep it until you say otherwise.",
            ],
            [
              "Sign-in session",
              "30 days, or until you sign out, whichever comes first.",
            ],
            [
              "Sign-in link",
              "15 minutes, single use. Only a hash of it is stored.",
            ],
            [
              "Mailing-list signup",
              "Until you ask to be removed.",
            ],
            [
              "Billing record",
              "Held by Stripe for as long as tax and accounting law requires, even after an account is deleted.",
            ],
          ]}
        />
        <P className="mt-4">
          Being straight about a gap: expired sign-in links and finished webhook
          receipts are not yet on an automatic cleanup schedule. They hold no
          usable credential (hashes only) and no personal content, and we remove
          them on request.
        </P>
      </LegalSection>

      <LegalSection id="deletion" title="Deleting your data">
        <P>
          Deleting your account is <B>not yet a button in the app</B>. We would
          rather say that plainly than describe a feature that does not exist.
          Today, deletion is done by asking us:
        </P>
        <P>
          Email{" "}
          <LegalLink href={contactMailto("Delete my iMechanic account")}>
            {CONTACT_EMAIL}
          </LegalLink>{" "}
          from the address you sign in with, and we delete your account and
          everything stored against it — vehicles, scans, fault codes,
          diagnoses, repair jobs, sessions and the subscription record — and
          confirm when it is done. If you cannot sign in at all, write to the
          same address and we will handle it manually. Full instructions are on
          the{" "}
          <LegalLink href="/delete-account">account deletion page</LegalLink>.
        </P>
      </LegalSection>

      <LegalSection id="rights" title="Your rights">
        <P>
          If you are in the EU or the UK, you have the right to:
        </P>
        <LegalList>
          <li>
            <B>Access</B> a copy of the data we hold about you, and the
            information in this policy;
          </li>
          <li>
            <B>Correct</B> anything wrong — most of it you can edit yourself in
            the app (vehicles, country), and we fix the rest;
          </li>
          <li>
            <B>Delete</B> your account and data, as described above;
          </li>
          <li>
            <B>Portability</B> — receive your data in a structured, commonly used
            machine-readable format;
          </li>
          <li>
            <B>Restrict or object</B> to certain processing, and withdraw consent
            where processing is based on consent;
          </li>
          <li>
            <B>Complain</B> to a supervisory authority. If you are in Germany or
            the UK that is your national data-protection authority; you can also
            complain anywhere you live or work. We would rather you told us
            first, but you do not have to.
          </li>
        </LegalList>
        <P className="mt-4">
          Write to{" "}
          <LegalLink href={contactMailto("iMechanic data request")}>
            {CONTACT_EMAIL}
          </LegalLink>{" "}
          for any of these. We answer within one month, normally much sooner, and
          we will not charge you for a request.
        </P>
      </LegalSection>

      <LegalSection id="security" title="How it is protected">
        <LegalList>
          <li>
            No passwords exist, so there is no password to leak: sign-in is a
            one-time link by email.
          </li>
          <li>
            Sign-in links and sessions are stored only as SHA-256 hashes. The
            database never holds a usable credential.
          </li>
          <li>
            The session cookie is HttpOnly and Secure, and it is the only cookie
            we set.
          </li>
          <li>
            Every app table carries the owning account, and the database is built
            so it physically refuses to attach one person's record to another
            person's account. Reads are scoped to the signed-in account on the
            server, not in the browser.
          </li>
          <li>
            No secret — database credentials, API keys — exists in anything your
            browser downloads.
          </li>
        </LegalList>
        <P className="mt-4">
          No system is perfect. If we ever discover a breach affecting your data,
          we will tell you and the relevant authority as the law requires.
        </P>
      </LegalSection>

      <LegalSection id="changes" title="Changes to this policy">
        <P>
          When this policy changes we update the date at the top and, for
          anything that matters, tell signed-in users in the app. The current
          version is always the one on this page.
        </P>
        <P>
          Contact:{" "}
          <LegalLink href={contactMailto("iMechanic privacy request")}>
            {CONTACT_EMAIL}
          </LegalLink>{" "}
          ·{" "}
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_ENTITY_NAME}</Placeholder>,{" "}
          <Placeholder>{LEGAL_PLACEHOLDERS.LEGAL_ENTITY_ADDRESS}</Placeholder>
        </P>
      </LegalSection>
    </LegalPage>
  );
}
