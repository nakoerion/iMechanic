/**
 * The free/Pro boundary, in one place (S6b).
 *
 * Free keeps the most recent few scans and one vehicle; Pro keeps everything.
 * These two numbers are the ONLY expression of that boundary in the codebase —
 * a screen enforces it by calling `visibleForPlan` with them, never by slicing
 * inline, so the limit can change without hunting through JSX.
 *
 * Slice S6b enforces this client-side over the existing `listScans` /
 * `listVehicles` results (server pagination is unchanged, so nothing about the
 * database needs a migration to move the limit).
 *
 * Honesty rule: truncation is never silent. `hiddenCount` is what the caller
 * renders as "N saved but not shown here" — the UI must always say a limit
 * exists rather than quietly returning a shorter list.
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
