import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

/**
 * PhoneFrame — a handset-shaped window that the landing page renders REAL app
 * components inside. Nothing here re-implements an app screen: the frame is
 * chrome only, so what a visitor sees is the same component the app ships.
 *
 * The screen keeps the app's light surface tokens (`bg-app-bg`) so the cards
 * inside are painted on exactly the background they get in the product.
 */
export function PhoneFrame({
  /** Short label in the fake status bar, e.g. "Scan result". */
  label,
  /** Accessible name for the scrollable screen region. */
  screenLabel,
  children,
  className,
  tall = false,
}: {
  label: string;
  screenLabel: string;
  children: ReactNode;
  className?: string;
  tall?: boolean;
}) {
  return (
    <div
      className={cn(
        /* M2: the frame gains the same "backlit bezel" the app's surfaces got
           in A2/A6 — a 1px inset `--ui-bezel` rim along the top edge, so light
           reads as catching the handset's chrome. The raw `--ui-bezel` var is
           used (not the `--color-bezel` theme alias) because Tailwind only
           emits a theme variable a utility actually references, and this is an
           arbitrary shadow value. The drop shadow is `shadow-2xl`'s own
           geometry, inlined so both live in one box-shadow. */
        "mx-auto w-full max-w-[21.5rem] rounded-[2.25rem] border border-white/15 bg-navy-900 p-2.5 shadow-[0_25px_50px_-12px_rgb(0_0_0/0.5),inset_0_1px_0_var(--ui-bezel)]",
        className,
      )}
    >
      <div className="overflow-hidden rounded-[1.75rem] bg-app-bg">
        {/* Chrome, not content: a compact stand-in for the app header. */}
        <div className="flex items-center justify-between gap-2 bg-navy-950 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            iMechanic
          </span>
          <span className="truncate text-[11px] font-semibold text-slate-300">
            {label}
          </span>
        </div>
        <div
          // Keyboard users need to be able to scroll the taller screens.
          tabIndex={0}
          role="group"
          aria-label={screenLabel}
          className={cn(
            "space-y-3 overflow-y-auto p-3",
            tall ? "max-h-[34rem]" : "max-h-[30rem]",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
