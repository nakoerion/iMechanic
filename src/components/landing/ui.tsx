import type { ReactNode } from "react";
import { EngineIcon } from "../icons";
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
        /* Fixed palette both sides: the light eyebrow always lands on the
           marketing page's permanently white/slate ground, so the themed
           `brand-fg` token would flip to the dark theme's pale amber there
           (measured: #b45309 on white 5.0:1 — the flipped value would be
           1.4:1). amber-700 on slate-100 measures 4.6:1. */
        tone === "dark" ? "text-amber-300" : "text-amber-700",
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

/* ------------------------------------------------------------------ */
/* Plate — the marketing side of the app's "data plate" material (A3).  */
/*                                                                      */
/* A plate is machine data, not prose: an uppercase legend, a monospaced */
/* value, hairline dividers, the tighter `--radius-plate`. It is the     */
/* same material the app uses for code metadata, cost bands and vehicle  */
/* rows, so the marketing page and the product read as one instrument.   */
/*                                                                      */
/* Two grounds, because the landing page paints on both — and BOTH are    */
/* fixed, because the marketing page is a light document with navy        */
/* sections (its root sets `bg-white text-slate-900`) rather than a        */
/* themed app surface. A role token such as `--color-hairline` or          */
/* `--color-fg` flips with the visitor's OS theme, so on a ground that     */
/* does not flip it would simply disappear — themed tokens belong in       */
/* `src/components/*` (the app), not here:                                 */
/*   - tone="dark"  → the navy hero/section ground: white alphas.         */
/*   - tone="light" → the white page ground: slate/navy palette values.   */
/* ------------------------------------------------------------------ */

export type PlateItem = {
  label: string;
  value: ReactNode;
  /** Optional second line of prose under the mono value. */
  note?: ReactNode;
};

export function Plate({
  items,
  tone = "light",
  layout = "stack",
  className,
}: {
  items: PlateItem[];
  tone?: "light" | "dark";
  /** `stack` = hairline-separated rows; `strip` = a wide spec band. */
  layout?: "stack" | "strip";
  className?: string;
}) {
  const dark = tone === "dark";
  /* The dividers are the 1px GAPS in the grid, with the plate's own ground
     showing through — so a hairline lands between every pair of cells at
     every breakpoint without a stack of nth-child border rules. */
  return (
    <dl
      className={cn(
        "grid gap-px",
        layout === "strip" && "sm:grid-cols-2 lg:grid-cols-4",
        dark ? "bg-white/10" : "bg-slate-200",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn("px-4 py-3.5 sm:px-5", dark ? "bg-navy-900" : "bg-white")}
        >
          <dt
            className={cn(
              "label-micro",
              dark ? "text-amber-300" : "text-slate-500",
            )}
          >
            {item.label}
          </dt>
          <dd
            className={cn(
              "num mt-1.5 font-mono text-[0.8125rem] font-medium leading-snug",
              dark ? "text-slate-200" : "text-navy-950",
            )}
          >
            {item.value}
          </dd>
          {item.note && (
            <p
              className={cn(
                "mt-1 text-xs leading-snug",
                dark ? "text-slate-400" : "text-slate-600",
              )}
            >
              {item.note}
            </p>
          )}
        </div>
      ))}
    </dl>
  );
}

/** The brand mark on marketing surfaces (A4 — it was a spanner until then).
 *
 *  It is the app's own `EngineIcon`, so the logo on the landing page, the tile
 *  in the app header and the installed app icon are one shape. Marketing
 *  surfaces keep the slightly heavier 2.2 stroke the old spanner mark used. */
export function EngineMark({ className = "h-5 w-5" }: { className?: string }) {
  return <EngineIcon className={className} strokeWidth={2.2} />;
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

/* Landing CTA surfaces. One primary look, used once per view.
 *
 * The primary lift is the shared `--shadow-key` token (the same one the app's
 * primary Button consumes since A7) — it used to be a local
 * `shadow-lg shadow-amber-500/20`, which drifted from the app by definition. */

export const ctaPrimary =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-control bg-brand px-6 text-base font-bold text-on-brand shadow-key transition-[background-color,transform] duration-150 hover:bg-brand-strong active:translate-y-px";

export const ctaOnNavy =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-control border border-white/25 px-6 text-base font-semibold text-white transition-colors duration-150 hover:border-white/50 hover:bg-white/10";

export const ctaOnWhite =
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-control border border-line-strong bg-white px-6 text-base font-semibold text-navy-950 transition-colors duration-150 hover:border-navy-700 hover:bg-slate-50";
