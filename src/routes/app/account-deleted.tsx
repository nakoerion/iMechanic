/**
 * /app/account-deleted — the confirmation page after in-app account deletion
 * (slice S9c).
 *
 * Why it lives under `/app` and is PUBLIC (`app/route.tsx` exempts it from the
 * session guard, alongside `/app/signin` and `/app/verify`): it is where the
 * browser lands the instant the account and its session row are gone. A route
 * that required a session would bounce the just-deleted user to the sign-in
 * screen and look like a failure.
 *
 * It is deliberately stateless and server-rendered: nothing on it reads the
 * account (there is no account any more), it states plainly what was removed,
 * and it says the one thing a worried person needs to know — no further charges
 * — without promising anything the code does not do.
 */
import { createFileRoute } from "@tanstack/react-router";
import { Card, ScreenHeader } from "../../components/app-shell";
import { CheckIcon } from "../../components/icons";
import { LegalLinks } from "../../components/legal/legal-page";
import { buttonClasses } from "../../components/ui/button";
import { cn } from "../../lib/cn";
import { APP_COPY } from "../../lib/copy";

export const Route = createFileRoute("/app/account-deleted")({
  head: () => ({
    meta: [
      { title: "Your account has been deleted — iMechanic" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountDeleted,
});

function AccountDeleted() {
  const c = APP_COPY.accountDeleted;
  return (
    <div className="space-y-6">
      <ScreenHeader title={c.title} description={c.description} />

      <Card className="text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok-solid text-on-ok">
          <CheckIcon className="h-6 w-6" aria-hidden />
        </span>
        <p className="mt-4 text-xs font-semibold uppercase tracking-wider text-brand-fg">
          {c.eyebrow}
        </p>
        <h2 className="mt-2 text-xl font-bold text-fg">{c.heading}</h2>
        <p className="mt-3 text-sm leading-relaxed text-fg-muted">{c.body}</p>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-fg">Billing</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">
          {c.subscriptionNote}
        </p>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-fg">Starting again</h2>
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">
          {c.signOutNote}
        </p>
        <a
          href={c.ctaHref}
          className={cn("mt-4 inline-flex", buttonClasses("primary", "md"))}
        >
          {c.cta}
        </a>
      </Card>

      <Card>
        <h2 className="text-sm font-bold text-fg">Questions</h2>
        <p className="mt-1 text-xs leading-relaxed text-fg-subtle">
          What iMechanic stored, the terms you used it under, and the deletion
          route are all written down here.
        </p>
        <LegalLinks className="mt-3" />
      </Card>
    </div>
  );
}
