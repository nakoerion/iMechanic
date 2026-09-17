import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * Small marketing-page primitives. Kept separate from `src/components/ui/*`
 * (the app's design system) because the landing page paints on the fixed navy
 * brand surfaces as well as white, so it needs its own light/dark-on-navy
 * variants. Colours come from the same token palette — no new hexes.
 */

export function Eyebrow({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <p
      className={cn(
        "text-sm font-semibold uppercase tracking-wider",
        tone === "dark" ? "text-amber-300" : "text-brand-fg",
      )}
    >
      {children}
    </p>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  children,
  tone = "light",
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div className={cn("im-reveal max-w-2xl", className)}>
      <Eyebrow tone={tone}>{eyebrow}</Eyebrow>
      <h2
        className={cn(
          "mt-3 text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-4xl",
          tone === "dark" ? "text-white" : "text-navy-950",
        )}
      >
        {title}
      </h2>
      {children && (
        <div
          className={cn(
            "mt-4 text-lg leading-relaxed",
            tone === "dark" ? "text-slate-300" : "text-slate-600",
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** A quiet, honest footnote. Never styled as fine print to hide something. */
export function Note({
  children,
  tone = "light",
  className,
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-sm leading-relaxed",
        tone === "dark" ? "text-slate-400" : "text-slate-500",
        className,
      )}
    >
      {children}
    </p>
  );
}

export function WrenchMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

export function TickIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function ArrowIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/* Landing CTA surfaces. One primary look, used once per view. */

export const ctaPrimary =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-control bg-brand px-6 text-base font-bold text-on-brand shadow-lg shadow-amber-500/20 transition-[background-color,transform] duration-150 hover:bg-brand-strong active:translate-y-px";

export const ctaOnNavy =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-control border border-white/25 px-6 text-base font-semibold text-white transition-colors duration-150 hover:border-white/50 hover:bg-white/10";

export const ctaOnWhite =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-control border border-line-strong bg-white px-6 text-base font-semibold text-navy-950 transition-colors duration-150 hover:border-navy-700 hover:bg-slate-50";
