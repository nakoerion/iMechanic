import { cn } from "../../lib/cn";
import { APP_COPY } from "../../lib/copy";
import { THEME_CHOICES, useTheme } from "../../lib/theme";

/**
 * System / Light / Dark. A real radio group so it is keyboard- and
 * screen-reader-navigable; 48px tall so it is usable with cold hands.
 */
export function ThemeControl({ className }: { className?: string }) {
  const { choice, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label={APP_COPY.theme.groupLabel}
      className={cn(
        "grid grid-cols-3 gap-1 rounded-control border-2 border-line-strong bg-surface-sunken p-1",
        className,
      )}
    >
      {THEME_CHOICES.map((option) => {
        const selected = choice === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            title={option.hint}
            onClick={() => setTheme(option.value)}
            className={cn(
              "min-h-12 rounded-[0.5rem] px-2 text-sm font-semibold transition-colors",
              selected
                /* A6 dark-theme fix: the selected pill used to be raw
                   `bg-navy-950 text-white`, which in the dark theme painted
                   navy on `--ui-surface-sunken` — the SAME #0b1220 — so the
                   chosen option vanished. `bg-brand` + `text-on-brand` is the
                   app's established selected-chip treatment (vehicle picker,
                   market picker), legible in both themes, and the group is
                   still a real radiogroup so the state is never colour-only. */
                ? "bg-brand text-on-brand"
                : "text-fg-muted hover:bg-neutral-fill hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
