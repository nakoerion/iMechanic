import type { ComponentType, SVGProps } from "react";
import { cn } from "../../lib/cn";
import { severityClasses, severityCopy } from "../../lib/severity";
import type { Severity } from "../../lib/severity";
import {
  DriveOnIcon,
  RepairSoonIcon,
  StopDrivingIcon,
  UnknownSeverityIcon,
} from "../icons";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/** Each severity gets its own silhouette — never the same shape recoloured. */
export const SEVERITY_ICON: Record<Severity, IconType> = {
  drive_on: DriveOnIcon,
  repair_soon: RepairSoonIcon,
  stop_driving: StopDrivingIcon,
  unknown: UnknownSeverityIcon,
};

export function SeverityIcon({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  const Glyph = SEVERITY_ICON[severity] ?? UnknownSeverityIcon;
  return <Glyph className={className} />;
}

/**
 * SeverityBadge — fill + silhouette + word, plus a 2px border. All three
 * signals are always on: it must survive greyscale, colour-blindness and a
 * sunlit phone screen.
 */
export function SeverityBadge({
  severity,
  size = "md",
  className,
}: {
  severity: Severity;
  size?: "sm" | "md";
  className?: string;
}) {
  const c = severityClasses(severity);
  const copy = severityCopy(severity);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border-2 font-bold tracking-tight",
        size === "sm" ? "gap-1.5 px-2.5 py-1 text-xs" : "gap-2 px-3 py-1.5 text-sm",
        c.fill,
        c.border,
        c.text,
        className,
      )}
    >
      <SeverityIcon
        severity={severity}
        className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}
      />
      <span className="sr-only">{copy.announce}</span>
      <span aria-hidden>{copy.label}</span>
    </span>
  );
}
