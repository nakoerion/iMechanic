import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { SpinnerIcon } from "../icons";

/**
 * The one button in the app.
 *
 * Sized for someone standing next to a car: the default height is 48px and
 * nothing drops below 40px. Never render a paywalled action in `primary` on a
 * screen whose main job is free — the free action always owns the primary slot.
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-on-brand border-2 border-transparent hover:bg-brand-strong active:bg-brand-strong",
  secondary:
    "bg-surface text-fg border-2 border-line-strong hover:bg-surface-sunken active:bg-surface-sunken",
  ghost:
    "bg-transparent text-fg-muted border-2 border-transparent hover:bg-neutral-fill hover:text-fg active:bg-neutral-fill",
  danger:
    "bg-danger-solid text-on-danger border-2 border-transparent hover:opacity-90 active:opacity-90",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3.5 text-sm gap-1.5",
  md: "min-h-12 px-5 text-base gap-2",
  lg: "min-h-14 px-6 text-lg gap-2.5",
};

const BASE =
  "inline-flex select-none items-center justify-center rounded-control font-semibold tracking-tight " +
  "transition-[background-color,color,transform,opacity] duration-100 " +
  "active:scale-[0.985] disabled:pointer-events-none disabled:opacity-45 " +
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
