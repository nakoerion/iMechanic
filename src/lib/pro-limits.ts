/**
 * The free/Pro boundary, in one place (S6b).
 *
 * Free keeps the most recent few scans and one vehicle; Pro keeps everything.
 * These two numbers are the ONLY expression of that boundary in the codebase —
 * a screen enforces it by calling `visibleForPlan` with them, never by slicing
 * inline, so the limit can change without hunting through JSX.
 *
 * S6b enforced this client-side over the full `listScans` / `listVehicles`
 * results. S6d moved the enforcement to the SERVER: those two server functions
 * now return a `PlanPage` (the limited rows plus honest counts), so a free user
 * cannot see more rows by calling the function directly, and the wire matches
 * what the screen renders. No migration was needed for either move.
 *
 * Honesty rule: truncation is never silent. `hiddenCount` is what the caller
 * renders as "N saved but not shown here" — a list must always say a limit
 * exists rather than quietly returning a shorter one.
 */

/** Free tier: the most recent N scans are visible. */
export const FREE_SCAN_HISTORY = 3;

/** Free tier: N vehicles in the garage. */
export const FREE_VEHICLES = 1;

export type Limited<T> = {
  /** What the plan may show. */
  visible: T[];
  /** How many further items were in the list but are not shown. */
  hiddenCount: number;
  /** True when a limit applied at all (i.e. something is hidden). */
  limited: boolean;
};

/**
 * Apply a plan limit to an already-loaded list, preserving its order.
 *
 * `items.length <= limit` (and Pro) always returns the list untouched with
 * `hiddenCount: 0`, so callers can render the "hidden" note unconditionally on
 * the returned counts and it correctly disappears when nothing is hidden.
 */
export function visibleForPlan<T>(
  items: readonly T[],
  pro: boolean,
  limit: number,
): Limited<T> {
  if (pro || items.length <= limit) {
    return { visible: [...items], hiddenCount: 0, limited: false };
  }
  return {
    visible: items.slice(0, limit),
    hiddenCount: items.length - limit,
    limited: true,
  };
}

/** Scans are served newest-first, so the limit keeps the newest. */
export function visibleScans<T>(scans: readonly T[], pro: boolean): Limited<T> {
  return visibleForPlan(scans, pro, FREE_SCAN_HISTORY);
}

/** Vehicles are served oldest-first; the limit keeps that order untouched. */
export function visibleVehicles<T>(
  vehicles: readonly T[],
  pro: boolean,
): Limited<T> {
  return visibleForPlan(vehicles, pro, FREE_VEHICLES);
}

/**
 * True when a free user may add another vehicle: they may hold exactly one,
 * so adding is only offered while the garage is empty. The form is never shown
 * and then rejected — the caller shows the Pro note instead.
 */
export function canAddFreeVehicle(vehicleCount: number): boolean {
  return vehicleCount < FREE_VEHICLES;
}

/* ------------------------------------------------------------------ */
/* Server-side enforcement (S6d)                                       */
/* ------------------------------------------------------------------ */

/**
 * What a plan-limited server function returns: the rows this plan may see,
 * plus the counts that make the limit honest — including `total`, how many
 * rows the user actually holds.
 *
 * `total` is what a screen renders when it names the real size of the list;
 * `hiddenCount` is what it renders as "N saved but not shown here". The two
 * are only equal while the server read was not itself capped, which is why
 * both travel: `listScansCore` reads at most SCAN_HISTORY_LIMIT rows, so a
 * user with more scans than that must still be told the true count.
 */
export type PlanPage<T> = Limited<T> & {
  /** Rows the user holds, whether or not this plan may show them. */
  total: number;
};

/**
 * Apply a plan limit to an already-loaded list and report honest counts.
 * This is the one place the server and the screens both go through, so the
 * free/Pro boundary cannot drift between them.
 *
 * `heldTotal` is how many rows the user holds in the database; it defaults to
 * the loaded length and is only needed when the read itself was capped.
 */
export function limitPageForPlan<T>(
  items: readonly T[],
  pro: boolean,
  limit: number,
  heldTotal: number = items.length,
): PlanPage<T> {
  const page = visibleForPlan(items, pro, limit);
  const total = Math.max(
    Number.isFinite(heldTotal) ? Math.floor(heldTotal) : items.length,
    items.length,
  );
  /* A Pro user is never limited, so nothing is added there — a short read
     stays a short read rather than turning into a paywall note. */
  const hiddenCount = pro
    ? 0
    : Math.max(page.hiddenCount, total - page.visible.length);
  return {
    visible: page.visible,
    hiddenCount,
    limited: hiddenCount > 0,
    total,
  };
}

/** Scans are newest-first, so the limit keeps the newest. */
export function limitScansForPlan<T>(
  scans: readonly T[],
  pro: boolean,
  heldTotal?: number,
): PlanPage<T> {
  return limitPageForPlan(scans, pro, FREE_SCAN_HISTORY, heldTotal);
}

/** Vehicles are served oldest-first; the limit keeps that order untouched. */
export function limitVehiclesForPlan<T>(
  vehicles: readonly T[],
  pro: boolean,
  heldTotal?: number,
): PlanPage<T> {
  return limitPageForPlan(vehicles, pro, FREE_VEHICLES, heldTotal);
}

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/**
 * Defensive read of a `PlanPage` off the wire. A screen must never crash on a
 * malformed payload, and it must never INVENT a limit either:
 *
 *  - a legacy plain array (limits applied client-side, or an older server) is
 *    treated as unlimited — showing a list we cannot count is safer than
 *    hiding rows behind a limit nothing substantiates;
 *  - anything unreadable is an empty page, not an error.
 */
export function readPlanPage<T>(value: unknown): PlanPage<T> {
  if (Array.isArray(value)) {
    const visible = value as T[];
    return {
      visible,
      hiddenCount: 0,
      limited: false,
      total: visible.length,
    };
  }
  if (value && typeof value === "object") {
    const raw = value as {
      visible?: unknown;
      hiddenCount?: unknown;
      total?: unknown;
    };
    if (Array.isArray(raw.visible)) {
      const visible = raw.visible as T[];
      /* The counts must agree with the rows: `total` is never less than what is
         shown, and `hiddenCount` is never less than the difference — a payload
         cannot quietly hide rows behind an understated number. */
      const total = Math.max(visible.length, nonNegativeInt(raw.total));
      const hiddenCount = Math.max(
        nonNegativeInt(raw.hiddenCount),
        total - visible.length,
      );
      return {
        visible,
        hiddenCount,
        limited: hiddenCount > 0,
        total: visible.length + hiddenCount,
      };
    }
  }
  return { visible: [], hiddenCount: 0, limited: false, total: 0 };
}

export type VehicleCreateGate =
  | { allowed: true }
  | { allowed: false; reason: "vehicle-limit" };

/**
 * May this user add another vehicle? ONE rule, asked by both sides: the UI asks
 * it before showing the form, and `createVehicle` asks it again before writing,
 * so a free user cannot bypass the garage limit by calling the server function
 * directly.
 *
 * It returns a reason code, never a sentence: the user-facing wording lives in
 * `APP_COPY.pro` with the rest of the copy, so the server's refusal and the
 * Pro note a screen shows cannot drift apart.
 */
export function vehicleCreateGate(
  pro: boolean,
  heldVehicles: number,
): VehicleCreateGate {
  if (pro || canAddFreeVehicle(heldVehicles)) return { allowed: true };
  return { allowed: false, reason: "vehicle-limit" };
}
