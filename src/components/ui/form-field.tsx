import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { AlertIcon } from "../icons";

/**
 * FormField owns the accessibility wiring so no screen can forget it: the
 * label is always associated, hint and error are always announced, and the
 * error state is always `aria-invalid`.
 *
 * Pass a render function so the control receives the generated ids:
 *
 *   <FormField label="Fault code" hint="For example P0301">
 *     {(a) => <input {...a} className={inputClasses} />}
 *   </FormField>
 */

export type FieldA11y = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

export const inputClasses =
  "block w-full min-h-12 rounded-control border-2 border-line-strong bg-surface px-4 text-base " +
  "text-fg placeholder:text-fg-subtle " +
  "focus:border-focus focus:outline-none " +
  "aria-[invalid]:border-danger-border disabled:opacity-45";

export function FormField({
  label,
  hint,
  error,
  required = false,
  labelHidden = false,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  labelHidden?: boolean;
  className?: string;
  children: (a11y: FieldA11y) => ReactNode;
}) {
  const uid = useId();
  const id = `field-${uid}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const a11y: FieldA11y = { id };
  if (describedBy) a11y["aria-describedby"] = describedBy;
  if (error) a11y["aria-invalid"] = true;
  if (required) a11y["aria-required"] = true;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={id}
        className={cn(
          "block text-sm font-semibold text-fg",
          labelHidden && "sr-only",
        )}
      >
        {label}
        {required && (
          <span className="ml-1 font-normal text-fg-subtle">(required)</span>
        )}
      </label>

      {hint && (
        <p id={hintId} className="text-sm leading-snug text-fg-muted">
          {hint}
        </p>
      )}

      {children(a11y)}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-start gap-1.5 text-sm font-medium text-danger-fg"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
