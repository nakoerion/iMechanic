/**
 * iMechanic app — lightweight inline icon set (matching the landing page style:
 * stroke-based, currentColor). No icon dependencies.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function HomeIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function ScanIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
      <path d="M8 3H4a1 1 0 0 0-1 1v4" />
      <path d="M16 3h4a1 1 0 0 1 1 1v4" />
      <path d="M8 21H4a1 1 0 0 1-1-1v-4" />
      <path d="M16 21h4a1 1 0 0 0 1-1v-4" />
    </svg>
  );
}

export function VehiclesIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 11 7.5 6.5A2 2 0 0 1 9.3 5.5h5.4a2 2 0 0 1 1.8 1L19 11" />
      <path d="M4 11h16a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1" />
      <path d="M4 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1" />
      <circle cx="7.5" cy="17" r="1.5" />
      <circle cx="16.5" cy="17" r="1.5" />
    </svg>
  );
}

export function HistoryIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

export function AccountIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-3.5 3.6-6 8-6s8 2.5 8 6" />
    </svg>
  );
}

export function WrenchIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** RESERVED for genuine Pro gating (S6) — QA defect D2. A padlock must never
 * appear next to free-forever features (connecting, scanning, reading codes,
 * clearing codes) or next to "not built yet" notes. For those, use ClockIcon
 * or no icon at all. */
export function LockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** A plain clock — "this arrives later", nothing more. Used by the
 * EmptyState note slot for features that are not built yet. */
export function ClockIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Severity glyphs                                                     */
/*                                                                     */
/* These three must be distinguishable by SILHOUETTE alone, with the   */
/* colour stripped out: a circle, a clock-and-spanner, an octagon.     */
/* Do not swap them for a shared shape with a different tint.          */
/* ------------------------------------------------------------------ */

/** Drive on — a round tick. Calm, closed, complete. */
export function DriveOnIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m7.8 12.3 2.9 2.9 5.5-6" />
    </svg>
  );
}

/** Repair soon — a clock with a spanner: "book this in". */
export function RepairSoonIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="10" cy="14.2" r="7.3" />
      <path d="M10 10.3v4.1l2.7 1.6" />
      <path d="M22 2.6a3.4 3.4 0 0 1-4.4 4.4l-1.9 1.9-1.7-1.7 1.9-1.9A3.4 3.4 0 0 1 20.3.9l-2 2 1.7 1.7 2-2z" />
    </svg>
  );
}

/** Stop driving — an octagon. The one road sign everybody already knows. */
export function StopDrivingIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8.4 2.2h7.2l5.2 5.2v7.2l-5.2 5.2H8.4l-5.2-5.2V7.4z" />
      <path d="M12 7.4v5.1" />
      <path d="M12 16.1h.01" />
    </svg>
  );
}

/** Not yet assessed — a square with a question mark. Deliberately dull. */
export function UnknownSeverityIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="3.4" />
      <path d="M9.7 9.4a2.4 2.4 0 1 1 3.3 2.2c-.7.3-1 .9-1 1.6v.4" />
      <path d="M12 16.6h.01" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.3 3.6 2.5 17.2A1.9 1.9 0 0 0 4.2 20h15.6a1.9 1.9 0 0 0 1.7-2.8L13.7 3.6a1.9 1.9 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 16.5h.01" />
    </svg>
  );
}

export function InfoIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.8h.01" />
    </svg>
  );
}

export function SparkIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3.2 13.7 9l5.8 1.7-5.8 1.7L12 18.2l-1.7-5.8L4.5 10.7 10.3 9z" />
      <path d="M19 3v3" />
      <path d="M20.5 4.5h-3" />
    </svg>
  );
}

/** Loading indicator. Pair with `animate-spin` and `aria-hidden`. */
export function SpinnerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export function PlugIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 2v6" />
      <path d="M15 2v6" />
      <path d="M7 8h10v3a5 5 0 0 1-5 5 5 5 0 0 1-5-5V8Z" />
      <path d="M12 16v6" />
    </svg>
  );
}
