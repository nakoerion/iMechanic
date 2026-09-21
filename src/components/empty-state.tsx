import type { ComponentType, ReactNode, SVGProps } from "react";
import { ClockIcon } from "./icons";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * A genuine, honest empty state for an app screen.
 * `note` renders a "coming soon" banner (clearly not yet available) — never
 * use this to imply a feature exists.
 */
export function EmptyState({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  note,
}: {
  icon: IconType;
  eyebrow?: string;
  title: string;
  description: string;
  action?: ReactNode;
  note?: string;
}) {
  return (
    <section className="flex flex-col items-center rounded-2xl border border-line bg-surface px-6 py-12 text-center shadow-sm">
      {/* Plate + mark are role tokens (A1): the old raw navy plate with the
          raw amber mark only ever read correctly in the dark theme.
          --color-app-bg gives a visible recessed plate in both, and
          --color-brand-fg is the brand mark that stays legible on it
          (6.5:1 light, 13.5:1 dark). */}
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-app-bg text-brand-fg">
        <Icon className="h-7 w-7" />
      </span>
      {eyebrow && (
        <p className="label-micro mt-5 text-brand-fg">
          {eyebrow}
        </p>
      )}
      <h2 className="mt-2 text-xl font-bold text-fg">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg-muted">
        {description}
      </p>
      {action && <div className="mt-6 w-full max-w-xs">{action}</div>}
      {note && (
        /* Clock, not a padlock (QA defect D2): this slot means "not built
           yet", never "paid". LockIcon is reserved for genuine Pro gating. */
        <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-neutral-fill px-3 py-1.5 text-xs font-medium text-fg-subtle">
          <ClockIcon className="h-3.5 w-3.5" />
          {note}
        </p>
      )}
    </section>
  );
}
