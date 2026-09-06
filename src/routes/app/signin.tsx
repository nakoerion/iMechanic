import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";
import { ScreenHeader } from "../../components/app-shell";
import { Button } from "../../components/ui/button";
import { FormField, inputClasses } from "../../components/ui/form-field";
import { APP_COPY } from "../../lib/copy";
import { requestMagicLink } from "../../server/auth";

export const Route = createFileRoute("/app/signin")({
  component: SignInPage,
});

function SignInPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setError(null);
    setSending(true);
    try {
      await requestMagicLink({ data: email });
      setSent(true);
    } catch {
      setError(APP_COPY.signIn.sendError);
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-6">
        <ScreenHeader
          title={APP_COPY.signIn.sentTitle}
          description={APP_COPY.signIn.sentDescription}
        />
        <section className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-10 text-center shadow-sm">
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
        className="rounded-2xl border border-line bg-surface p-5 shadow-sm"
      >
        <FormField label={APP_COPY.signIn.emailLabel} error={error} required>
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
              required
            />
          )}
        </FormField>
        <p className="mt-3 text-xs leading-snug text-fg-subtle">
          {APP_COPY.signIn.emailHint}
        </p>
        <Button
          type="submit"
          size="lg"
          fullWidth
          loading={sending}
          loadingLabel={APP_COPY.signIn.sendingButton}
          className="mt-5"
        >
          {APP_COPY.signIn.sendButton}
        </Button>
      </form>
    </div>
  );
}