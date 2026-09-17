/**
 * Entitlement state for the UI (S6b).
 *
 * One hook, one shape, used by every gate so no screen invents its own notion
 * of "is this user Pro". It reads S6a's `getEntitlement()` server function
 * (which never throws for a signed-out visitor) and exposes THREE states, not
 * a boolean — the difference matters:
 *
 *   loading → we do not know yet. Gates must NOT claim the user is not Pro
 *             (nothing is asserted until the answer arrives).
 *   ready   → the server's answer, including `stripeConfigured` /
 *             `stripeTestMode` so the upgrade surface can be honest about
 *             whether payments can actually be taken.
 *   error   → we could not find out. Gates stay closed and SAY SO, rather than
 *             silently pretending the user is a free user.
 *
 * `reload()` re-asks (used by the account screen after a Stripe redirect and by
 * the "Check again" buttons).
 */
import { useCallback, useEffect, useState } from "react";
import { getEntitlement } from "../server/pro";

/** The six statuses `subscriptions.status` allows. */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

/** Exactly what `getEntitlement()` returns. */
export type Entitlement = {
  signedIn: boolean;
  pro: boolean;
  status: SubscriptionStatus | null;
  bandId: "a" | "b" | "c" | null;
  currentPeriodEnd: string | null;
  stripeConfigured: boolean;
  /** True only when a Stripe *test* key is in use — never a claim otherwise. */
  stripeTestMode: boolean;
};

export type EntitlementState =
  | { kind: "loading" }
  | { kind: "ready"; entitlement: Entitlement }
  | { kind: "error" };

export type EntitlementHandle = {
  state: EntitlementState;
  reload: () => void;
};

export function useEntitlement(): EntitlementHandle {
  const [state, setState] = useState<EntitlementState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getEntitlement()
      .then((entitlement: Entitlement) => {
        if (!cancelled) setState({ kind: "ready", entitlement });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState({ kind: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, reload };
}

/**
 * Convenience for screens that only need the boolean and can treat "unknown"
 * as "not Pro" — pass `pro` to `ProGate`, which renders the honest
 * checking/unknown note instead of a paywall for loading and error states.
 */
export function isPro(state: EntitlementState): boolean {
  return state.kind === "ready" && state.entitlement.pro;
}
