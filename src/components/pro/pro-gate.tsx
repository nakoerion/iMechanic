import type { ReactNode } from "react";
import type { EntitlementHandle } from "../../lib/entitlement";
import { PlanUnknownNote, ProUpgradePrompt } from "./pro-prompt";

/**
 * ProGate — the client-side enforcement point for every Pro feature (S6b).
 *
 *   Pro user        → children render exactly as before (no badge, no wrapper).
 *   Free user       → the explicit ProUpgradePrompt, in this feature's words.
 *   loading / error → the honest "we couldn't check" note. Fail CLOSED: an
 *                     unknown entitlement never unlocks a Pro surface, and it
 *                     never tells the user they are on the free plan either.
 *
 * Enforcement is client-side by design in this slice: the free tier is free and
 * the Pro surfaces here are read-only rendering of data the user already owns,
 * so nothing is exposed that a UI check could leak. Server-side gating of the
 * Pro *actions* (e.g. the AI call) is a separate concern, tracked for the lead.
 */
export function ProGate({
  entitlement,
  title,
  description,
  compact = false,
  children,
}: {
  entitlement: EntitlementHandle;
  title: string;
  description: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const { state, reload } = entitlement;
  if (state.kind === "ready") {
    return state.entitlement.pro ? (
      <>{children}</>
    ) : (
      <ProUpgradePrompt
        title={title}
        description={description}
        compact={compact}
      />
    );
  }
  return <PlanUnknownNote kind={state.kind} onRetry={reload} />;
}
