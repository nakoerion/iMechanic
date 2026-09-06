import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ScreenHeader } from "../../components/app-shell";
import { Button } from "../../components/ui/button";
import { APP_COPY } from "../../lib/copy";
import { verifyMagicLink } from "../../server/auth";

export const Route = createFileRoute("/app/verify")({
  validateSearch: (search) => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: SignInVerifyPage,
});

function SignInVerifyPage() {
  const [state, setState] = useState<"working" | "error">("working");
  const token = Route.useSearch().token as string | undefined;

  useEffect(() => {
    let cancelled = false;
    // Same guard as the server validator: a truncated/absent token can never
    // succeed, so surface the honest error immediately instead of failing
    // quietly after a round-trip.
    if (!token || token.length < 32) {
      setState("error");
      return;
    }
    verifyMagicLink({ data: { token } })
      .then(() => {
        if (cancelled) return;
        // Session cookie is set server-side; a full navigation picks it up
        // and the app layout's guard lets us through to the app home.
        window.location.href = "/app";
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (state === "error") {
    return (
      <div className="space-y-6">
        <ScreenHeader
          title={APP_COPY.signIn.invalidLinkTitle}
          description={APP_COPY.signIn.invalidLinkDescription}
        />
        <a
          href="/app/signin"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-control border-2 border-line-strong bg-surface px-5 text-base font-semibold text-fg transition-colors hover:bg-surface-sunken"
        >
          {APP_COPY.signIn.backToSignIn}
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ScreenHeader
        title="Signing you in…"
        description="One moment, please."
      />
    </div>
  );
}