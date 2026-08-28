/**
 * Severity is the most safety-critical thing this app renders, so it is
 * expressed three redundant ways — never colour alone:
 *
 *   1. FILL      a tinted background (colour)
 *   2. SILHOUETTE a distinct icon outline (round / clock+spanner / octagon)
 *   3. WORDS     the verdict spelled out ("Stop driving")
 *
 * Plus an unconditional 2px anchor border in the severity colour on every
 * severity-bearing surface, so the card still reads at arm's length, in
 * daylight, on a cheap phone screen.
 *
 * Values match `diagnoses.verdict` in Postgres.
 */

export type Severity = "drive_on" | "repair_soon" | "stop_driving" | "unknown";

export const SEVERITY_ORDER: Severity[] = [
  "drive_on",
  "repair_soon",
  "stop_driving",
  "unknown",
];

export type SeverityCopy = {
  /** The word the user reads. Short on purpose. */
  label: string;
  /** One line of plain-English guidance. No jargon, no hedging. */
  guidance: string;
  /** Screen-reader prefix so the verdict is never just a colour. */
  announce: string;
};

export const SEVERITY_COPY: Record<Severity, SeverityCopy> = {
  drive_on: {
    label: "Drive on",
    guidance: "Safe to keep driving. Get it looked at when convenient.",
    announce: "Verdict: drive on",
  },
  repair_soon: {
    label: "Repair soon",
    guidance: "Still driveable, but book this in within the next few weeks.",
    announce: "Verdict: repair soon",
  },
  stop_driving: {
    label: "Stop driving",
    guidance: "Stop as soon as it is safe to do so. Driving on risks damage or injury.",
    announce: "Verdict: stop driving",
  },
  unknown: {
    label: "Not yet assessed",
    guidance: "We don't have enough to judge this one yet.",
    announce: "Verdict: not yet assessed",
  },
};

export type SeverityClasses = {
  fill: string;
  border: string;
  text: string;
  solid: string;
  onSolid: string;
};

/** Full literal class strings — Tailwind's scanner needs to see them here. */
export const SEVERITY_CLASSES: Record<Severity, SeverityClasses> = {
  drive_on: {
    fill: "bg-ok-fill",
    border: "border-ok-border",
    text: "text-ok-fg",
    solid: "bg-ok-solid",
    onSolid: "text-on-ok",
  },
  repair_soon: {
    fill: "bg-warn-fill",
    border: "border-warn-border",
    text: "text-warn-fg",
    solid: "bg-warn-solid",
    onSolid: "text-on-warn",
  },
  stop_driving: {
    fill: "bg-danger-fill",
    border: "border-danger-border",
    text: "text-danger-fg",
    solid: "bg-danger-solid",
    onSolid: "text-on-danger",
  },
  unknown: {
    fill: "bg-neutral-fill",
    border: "border-neutral-border",
    text: "text-neutral-fg",
    solid: "bg-neutral-border",
    onSolid: "text-fg-invert",
  },
};

export function severityClasses(severity: Severity): SeverityClasses {
  return SEVERITY_CLASSES[severity] ?? SEVERITY_CLASSES.unknown;
}

export function severityCopy(severity: Severity): SeverityCopy {
  return SEVERITY_COPY[severity] ?? SEVERITY_COPY.unknown;
}

/** Maps a `dtc_catalog.severity_default` string onto a Severity. */
export function toSeverity(value?: string | null): Severity {
  switch (value) {
    case "drive_on":
    case "repair_soon":
    case "stop_driving":
      return value;
    default:
      return "unknown";
  }
}
