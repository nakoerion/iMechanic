import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { SpinnerIcon } from "../icons";

/**
 * The one button in the app.
 *
 * Sized for someone standing next to a car: the default height is 48px and
 * nothing drops below 40px (sm = 40px — the floor, still a real tap target).
 * Never render a paywalled action in `primary` on a screen whose main job is
 * free — the free action always owns the primary slot.
 *
 * A7 — hardware feel. The primary control carries `--shadow-key`, the one
 * amber-tinted lift shared with the marketing CTA, and every variant travels
 * 1px down and drops its lift while pressed (`active:`). `aria-pressed` gets
 * the same treatment so a TOGGLE control reads as physically latched: the
 * `toggle` variant lights amber when pressed. Nothing here glows, pulses or
 * animates beyond the press.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "toggle";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-on-brand border-2 border-transparent shadow-key hover:bg-brand-strong active:bg-brand-strong active:shadow-none",
  secondary:
    "bg-surface text-fg border-2 border-line-strong hover:bg-surface-sunken active:bg-surface-sunken",
  ghost:
    "bg-transparent text-fg-muted border-2 border-transparent hover:bg-neutral-fill hover:text-fg active:bg-neutral-fill",
  danger:
    "bg-danger-solid text-on-danger border-2 border-transparent hover:opacity-90 active:opacity-90",
  /* A latched, hardware-style control: `aria-pressed="true"` fills it with the
     brand amber, the same selected treatment the chips use. Use it for
     on/off controls (never for a plain action) and always set aria-pressed. */
  toggle:
    "bg-surface text-fg-muted border-2 border-line-strong hover:text-fg aria-pressed:bg-brand aria-pressed:text-on-brand aria-pressed:border-transparent",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3.5 text-sm gap-1.5",
  md: "min-h-12 px-5 text-base gap-2",
  lg: "min-h-14 px-6 text-lg gap-2.5",
};

const BASE =
  "inline-flex select-none items-center justify-center rounded-control font-semibold tracking-tight " +
  "transition-[background-color,color,transform,opacity,box-shadow] duration-100 " +
  "active:translate-y-px active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 " +
  "aria-busy:cursor-progress";

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  fullWidth = false,
): string {
  return cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  loading?: boolean;
  /** Announced while `loading`; keeps the visible label stable. */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  loading = false,
  loadingLabel = "Working…",
  leadingIcon,
  trailingIcon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, fullWidth), className)}
    >
      {loading ? (
        <>
          <SpinnerIcon className="h-5 w-5 animate-spin" aria-hidden />
          <span className="sr-only">{loadingLabel}</span>
          <span aria-hidden>{children}</span>
        </>
      ) : (
        <>
          {leadingIcon}
          {children}
          {trailingIcon}
        </>
      )}
    </button>
  );
}
