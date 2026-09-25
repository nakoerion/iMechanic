/**
 * /delete-account — the PUBLIC account-deletion URL Google Play requires
 * (slice S9b).
 *
 * Two things this page must do at once:
 *  1. satisfy the Play requirement — a public, signed-out URL that explains how
 *     a user deletes their account and their data; and
 *  2. stay honest. There is currently NO delete path in the codebase: the only
 *     thing the app deletes today is a session row on sign-out
 *     (`signOutCore`, src/server/auth-core.ts). The in-app "Account → Delete
 *     account" button is a LATER slice, so this page presents the route that
 *     works NOW (email) first and marks the in-app flow as "coming with the
 *     next release" rather than describing a button that does not exist.
 */
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  B,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalTable,
  P,
} from "../components/legal/legal-page";
import { CARD_MATERIAL } from "../components/app-shell";
import { CONTACT_EMAIL, contactMailto } from "../lib/legal";

export const Route = createFileRoute("/delete-account")({
  head: () => ({
    meta: [
      { title: "Delete your iMechanic account" },
      {
        name: "description",
        content:
          "How to delete your iMechanic account and everything stored against it: the in-app flow and an email route if you cannot sign in.",
      },
    ],
  }),
  component: DeleteAccountPage,
});

const DELETE_SUBJECT = "Delete my iMechanic account";

function RouteCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={CARD_MATERIAL.card}>
      <p className="label-micro text-brand-fg">{eyebrow}</p>
      <h3 className="mt-1 text-base font-bold text-fg">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function DeleteAccountPage() {
  return (
    <LegalPage
      title="Delete your iMechanic account"
      lede={
        <>
          You can have everything iMechanic holds about you and your car deleted.
          Here is exactly how, what goes, and what stays behind.
        </>
      }
    >
      <section className="mt-2 grid gap-5 md:grid-cols-2">
        <RouteCard eyebrow="Works today" title="Delete by email">
          <P>
            Send an email from the address you sign in with — subject{" "}
            <B>&quot;{DELETE_SUBJECT}&quot;</B> — to{" "}
            <LegalLink href={contactMailto(DELETE_SUBJECT)}>
              {CONTACT_EMAIL}
            </LegalLink>
            . You do not need to explain anything or fill in a form.
          </P>
          <P>
            We delete your account and everything stored against it, and reply to
            confirm it is done. Requests are normally handled within a few days,
            and always within 30 days.
          </P>
        </RouteCard>

        <RouteCard eyebrow="Coming with the next release" title="Account → Delete account">
          <P>
            Deleting your account from inside the app — <B>Account</B>, then{" "}
            <B>Delete account</B> — is built in a following release. This page is
            the public URL for that flow.
          </P>
          <P>
            Until the button ships, use the email route: it does exactly the same
            thing, and it is the route Play reviewers are pointed at today.
          </P>
        </RouteCard>
      </section>

      <LegalSection id="cant-sign-in" title="If you cannot sign in">
        <P>
          You do not need access to the app, or a working sign-in link, to be
          deleted. Email{" "}
          <LegalLink href={contactMailto(DELETE_SUBJECT)}>{CONTACT_EMAIL}</LegalLink>{" "}
          from any address, tell us the email address the account uses, and we
          will verify the request and delete it manually.
        </P>
      </LegalSection>

      <LegalSection id="what-is-deleted" title="What gets deleted">
        <P>
          Deleting your account deletes everything stored against it. iMechanic's
          database is built so that one account deletion cascades to every
          record, so nothing is left orphaned:
        </P>
        <LegalList>
          <li>
            your <B>account and email address</B>;
          </li>
          <li>
            your <B>vehicles</B> — make, model, year, engine, VIN and mileage;
          </li>
          <li>
            every <B>scan and fault code</B>, including the adapter transcript;
          </li>
          <li>
            every <B>diagnosis</B> — verdicts, root causes, AI answers and cost
            bands;
          </li>
          <li>
            your <B>repair jobs</B>, step progress and verification scans;
          </li>
          <li>
            your <B>sessions</B>, so you are signed out everywhere;
          </li>
          <li>
            your <B>subscription record</B>, and we cancel any active Pro
            subscription so you are not billed again;
          </li>
          <li>
            any <B>mailing-list signup</B> you made on the marketing page.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="what-stays" title="What stays behind, and why">
        <LegalTable
          label="Data that survives an account deletion"
          head={["What", "Why"]}
          rows={[
            [
              "Billing records held by Stripe (the payment processor)",
              "Tax and accounting law requires payment records to be kept, and they are held by Stripe rather than by iMechanic. Card details were never stored by us.",
            ],
            [
              "Expired sign-in-link hashes",
              "They hold no usable credential and expire in 15 minutes; we remove them on request.",
            ],
          ]}
        />
        <P className="mt-4">
          Nothing else is kept, and nothing is kept 'to improve the product'.
          There is no advertising or analytics profile that would survive you.
        </P>
      </LegalSection>

      <LegalSection id="before" title="Before you delete">
        <P>
          Deletion is permanent: your scan history and repair record go with the
          account and cannot be restored. Automated export is not built yet, so if
          you want a copy of your data first, say so in the same email — you have
          the right to a copy under the GDPR, and we will send it before anything
          is removed.
        </P>
      </LegalSection>

      <LegalSection id="more" title="More detail">
        <P>
          The{" "}
          <LegalLink href="/privacy">privacy policy</LegalLink> explains what
          iMechanic stores and who processes it, and the{" "}
          <LegalLink href="/terms">terms of use</LegalLink> cover how the app may
          be used.
        </P>
      </LegalSection>
    </LegalPage>
  );
}
