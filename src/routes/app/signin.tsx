import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ScreenHeader } from "../../components/app-shell";
import { LegalLinks } from "../../components/legal/legal-page";
import { Button } from "../../components/ui/button";
import { FormField, inputClasses } from "../../components/ui/form-field";
import { APP_COPY } from "../../lib/copy";
import { requestMagicLink, submitReviewCode } from "../../server/auth";

export const Route = createFileRoute("/app/signin")({
  component: SignInPage,
});

/**
 * Sign-in — a one-time email link, always.
 *
 * S10-T2 adds a SECOND step that is invisible unless the SERVER asks for it:
 * when REVIEW_ACCESS_CODE is configured and the submitted address is the
 * store-review address, `requestMagicLink` answers `{ codeRequired: true }`
 * and this form swaps the only action it offers to an "Access code" field.
 * Nothing about that is decided in the browser — with the variable unset the
 * answer never carries the field, so a clean checkout renders exactly the
 * single-step form it rendered before this slice.
 *
 * A code that is not accepted sends the form to the SAME "check your email"
 * screen any other address gets (no separate error, no different wording):
 * there is nothing here that tells a guesser whether the address was special
 * or the code was wrong.
 */
function SignInPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  /** True only after the server asked for an access code. */
  const [codeRequired, setCodeRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      if (codeRequired) {
        const result = await submitReviewCode({ data: { email, code } });
        if (result.signedIn) {
          /* A full reload, not a client-side navigate: the /app guard runs on
             the server and has to see the session cookie this response set. */
          window.location.assign("/app");
          return;
        }
        // Neutral on purpose — identical to the ordinary send screen.
        setSent(true);
        return;
      }

      const result = await requestMagicLink({ data: email });
      if (result.codeRequired) {
        setCodeRequired(true);
        setCode("");
        return;
      }
      setSent(true);
    } catch {
      setError(APP_COPY.signIn.sendError);
    } finally {
      setSending(false);
    }
  }

  function onUseDifferentEmail() {
    setCodeRequired(false);
    setCode("");
    setError(null);
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <ScreenHeader
          title={APP_COPY.signIn.sentTitle}
          description={APP_COPY.signIn.sentDescription}
        />
        <section className="flex flex-col items-center rounded-card border border-line bg-surface px-6 py-10 text-center shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-fg">
            {APP_COPY.signIn.sentEyebrow}
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-fg-muted">
            {APP_COPY.signIn.sentNote}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ScreenHeader
        title={APP_COPY.signIn.title}
        description={APP_COPY.signIn.description}
      />
      <form
        onSubmit={onSubmit}
        noValidate
        className="rounded-card border border-line bg-surface p-5 shadow-card"
      >
        <FormField
          label={APP_COPY.signIn.emailLabel}
          error={codeRequired ? null : error}
          required
        >
          {(a11y) => (
            <input
              {...a11y}
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClasses}
              readOnly={codeRequired}
              required
            />
          )}
        </FormField>

        {codeRequired ? (
          <div className="mt-4 space-y-3">
            <FormField
              label={APP_COPY.signIn.reviewCodeLabel}
              error={error}
              required
            >
              {(a11y) => (
                <input
                  {...a11y}
                  type="text"
                  autoComplete="off"
                  inputMode="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={inputClasses}
                  required
                />
              )}
            </FormField>
            <p className="text-xs leading-snug text-fg-subtle">
              {APP_COPY.signIn.reviewCodeHint}
            </p>
            <p className="font-mono text-xs text-fg-muted">
              {APP_COPY.signIn.reviewCodeSigningInAs(email)}
            </p>
            <button
              type="button"
              onClick={onUseDifferentEmail}
              className="text-xs font-semibold text-brand-fg underline underline-offset-2"
            >
              {APP_COPY.signIn.reviewCodeChangeEmail}
            </button>
          </div>
        ) : (
          <p className="mt-3 text-xs leading-snug text-fg-subtle">
            {APP_COPY.signIn.emailHint}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={sending}
          loadingLabel={
            codeRequired
              ? APP_COPY.signIn.reviewCodeChecking
              : APP_COPY.signIn.sendingButton
          }
          className="mt-5"
        >
          {codeRequired
            ? APP_COPY.signIn.reviewCodeButton
            : APP_COPY.signIn.sendButton}
        </Button>
      </form>
      {/* S9b — the three public legal pages, reachable from inside the app too
          (the Android shell loads this same site, and Play requires the
          deletion URL to be findable). Plain links, no sign-in needed. */}
      <div className="border-t border-line pt-5">
        <p className="text-xs leading-snug text-fg-subtle">
          Sign-in is a one-time email link — iMechanic never sets a password.
        </p>
        <LegalLinks className="mt-3" />
      </div>
    </div>
  );
}
