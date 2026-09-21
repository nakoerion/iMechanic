import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import { cn } from "../../lib/cn";
import {
  filterTerms,
  isListedValue,
  MAX_SUGGESTION_LIMIT,
  normalizeVehicleTerm,
  DEFAULT_SUGGESTION_LIMIT,
} from "../../lib/vehicle-catalog";
import { AlertIcon, ChevronDownIcon } from "../icons";

/**
 * A type-to-filter combobox for a form field.
 *
 * What it is: an ordinary text input (the value is ALWAYS exactly what the user
 * typed or picked — it is never rewritten) plus a listbox of SUGGESTIONS that
 * filters as they type. That combination is the whole point: the suggestions
 * guide someone who doesn't know what to type, and the text input keeps the door
 * open for a car that is not in our curated list. It never refuses a value.
 *
 * Accessibility: the WAI-ARIA editable-combobox-with-listbox pattern. The input
 * carries role="combobox"/aria-expanded/aria-controls/aria-activedescendant, the
 * popup is role="listbox" with role="option" rows, and every list action is
 * reachable from the keyboard: ArrowDown/ArrowUp move (opening the list if it is
 * closed), Enter takes the highlighted row, Escape closes, Tab moves on. Nothing
 * depends on hover or on a mouse.
 *
 * Keyboard path by design: typing never auto-highlights a row, so Enter on a
 * freshly typed value submits the form with what the user typed. A row only
 * becomes active once they arrow onto it or tap it.
 */

const INPUT_CLASS =
  "mt-1 h-12 w-full rounded-control border-2 border-line-strong bg-surface px-3 pr-11 text-base text-fg placeholder:text-fg-subtle focus:border-brand focus:outline-none aria-[invalid]:border-danger-border";
const LIST_CLASS =
  "absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-card border border-line-strong bg-surface py-1 shadow-lg";
const ROW_CLASS =
  "flex cursor-pointer items-center px-3 py-2.5 text-sm leading-snug text-fg";
const ROW_ACTIVE_CLASS = "bg-neutral-fill font-semibold";
const NOTE_CLASS =
  "sticky bottom-0 border-t border-line bg-surface px-3 py-2 text-xs leading-snug text-fg-subtle";

export type ComboboxCopy = {
  /** aria-label of the input's suggestion list. */
  listLabel: string;
  /** Small guidance line under the input — how to use the picker. */
  hint: string;
  /** Shown when the filtered list is empty; the field stays typeable. */
  emptyMessage: string;
  /** Shown as a sticky footer inside the open list. */
  listNote?: string;
  /** aria-label of the open/close chevron. */
  showSuggestions: string;
  /** Announced to screen readers as the filtered list changes. */
  count: (n: number) => string;
  /**
   * Trailing row that keeps a typed value the catalog doesn't have. Absent on
   * pickers (like the year) where every legal value is already listed.
   */
  otherOption?: (typed: string) => string;
  /** Reassurance shown once the kept value is not in the catalog. */
  customNote?: string;
};

export type ComboboxFieldProps = {
  id: string;
  name: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: readonly string[];
  copy: ComboboxCopy;
  /** Extra search terms per option (never displayed) — see MAKE_ALIASES. */
  aliases?: Readonly<Record<string, readonly string[]>>;
  error?: string;
  placeholder?: string;
  /** Rows shown before the user types. The list itself is scrollable. */
  collapsedLimit?: number;
  maxLength?: number;
  inputMode?: "text" | "numeric";
  enterKeyHint?: "next" | "done" | "go" | "search";
  autoComplete?: string;
};

export function ComboboxField({
  id,
  name,
  label,
  value,
  onValueChange,
  options,
  copy,
  aliases,
  error,
  placeholder,
  collapsedLimit = DEFAULT_SUGGESTION_LIMIT,
  maxLength = 80,
  inputMode = "text",
  enterKeyHint,
  autoComplete = "off",
}: ComboboxFieldProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  /* Set only when the user explicitly keeps a typed, unlisted value. */
  const [keptOwnText, setKeptOwnText] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const listId = `${id}-list`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const customId = `${id}-custom`;
  const typed = value.trim();

  const matches = useMemo(
    () =>
      filterTerms(
        options,
        value,
        typed === "" ? collapsedLimit : MAX_SUGGESTION_LIMIT,
        aliases,
      ),
    [options, value, typed, collapsedLimit, aliases],
  );

  /* The "type your own" row: offered whenever a non-empty value is not one of
     the catalog entries. Choosing it changes nothing about the value — it just
     says out loud that what they typed is what will be saved. */
  const otherIndex =
    copy.otherOption && typed !== "" && !isListedValue(options, value)
      ? matches.length
      : -1;
  const optionCount = matches.length + (otherIndex >= 0 ? 1 : 0);

  /* The value isn't in the catalog: say so, and say it will still be saved
     exactly as typed. Quiet while they are still typing, spoken once they have
     settled on it. */
  const showCustomNote =
    optionCount > 0 &&
    !!copy.customNote &&
    !isListedValue(options, value) &&
    (keptOwnText || !open);
  const describedBy =
    [hintId, error ? errorId : undefined, showCustomNote ? customId : undefined]
      .filter(Boolean)
      .join(" ") || undefined;

  /* Keep the highlighted row inside the scrollable list. */
  useEffect(() => {
    if (!open || active < 0) return;
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    row?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const optionId = (index: number) => `${listId}-opt-${index}`;

  function choose(index: number) {
    if (index >= 0 && index < matches.length) {
      onValueChange(matches[index]);
      setKeptOwnText(false);
    } else if (index >= 0 && index === otherIndex) {
      setKeptOwnText(true);
    }
    setOpen(false);
    setActive(-1);
    inputRef.current?.focus();
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    onValueChange(event.target.value);
    setKeptOwnText(false);
    setActive(-1);
    /* Open on typing: the list is the guidance, and it is now filtered. */
    setOpen(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(optionCount > 0 ? 0 : -1);
      } else {
        setActive((current) =>
          optionCount === 0 ? -1 : current + 1 >= optionCount ? 0 : current + 1,
        );
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(optionCount > 0 ? optionCount - 1 : -1);
      } else {
        setActive((current) =>
          optionCount === 0
            ? -1
            : current - 1 < 0
              ? optionCount - 1
              : current - 1,
        );
      }
      return;
    }
    if (event.key === "Enter") {
      if (open && active >= 0 && active < optionCount) {
        /* Take the highlighted row instead of submitting the form. */
        event.preventDefault();
        choose(active);
      } else if (open) {
        /* Nothing highlighted: close and let the form submit as typed. */
        setOpen(false);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      setActive(-1);
    }
  }

  function onFocus() {
    /* An empty field is exactly where guidance is needed most. */
    if (typed === "") setOpen(true);
  }

  function onRootBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setOpen(false);
    setActive(-1);
  }

  const announcement = !open
    ? ""
    : optionCount > 0
      ? copy.count(optionCount)
      : copy.emptyMessage;

  return (
    <div onBlur={onRootBlur} ref={rootRef}>
      <label htmlFor={id} className="block text-xs font-semibold text-fg">
        {label}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          role="combobox"
          aria-expanded={open}
          {...(open ? { "aria-controls": listId } : {})}
          {...(open && active >= 0 && active < optionCount
            ? { "aria-activedescendant": optionId(active) }
            : {})}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          autoComplete={autoComplete}
          enterKeyHint={enterKeyHint}
          inputMode={inputMode}
          maxLength={maxLength}
          className={INPUT_CLASS}
        />
        {/* APG's optional popup indicator: a real button, but out of the tab
            order — the input's own ArrowDown/ArrowUp already open the list, so
            the form keeps one tab stop per field. */}
        <button
          type="button"
          tabIndex={-1}
          aria-label={copy.showSuggestions}
          aria-expanded={open}
          {...(open ? { "aria-controls": listId } : {})}
          onClick={() => {
            setOpen((wasOpen) => !wasOpen);
            setActive(-1);
            inputRef.current?.focus();
          }}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-control text-fg-subtle hover:text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-focus"
        >
          <ChevronDownIcon
            className={cn(
              "h-5 w-5 transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={copy.listLabel}
            className={LIST_CLASS}
          >
            {/* Nothing matched and there is nothing to offer — the field is
                still fully typeable, so say that rather than showing an
                empty box. */}
            {optionCount === 0 && (
              <li role="presentation" className={cn(ROW_CLASS, "text-fg-muted")}>
                {copy.emptyMessage}
              </li>
            )}

            {matches.map((option, index) => (
              <li
                key={option}
                id={optionId(index)}
                role="option"
                aria-selected={normalizeVehicleTerm(option) === normalizeVehicleTerm(value)}
                data-active={index === active ? "true" : undefined}
                /* Keep focus in the input so the value is never lost when a
                   row is tapped (desktop mouse and mobile touch alike). */
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(index)}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  ROW_CLASS,
                  index === active && ROW_ACTIVE_CLASS,
                )}
              >
                {option}
              </li>
            ))}

            {otherIndex >= 0 && (
              <li
                id={optionId(otherIndex)}
                role="option"
                aria-selected={false}
                data-active={active === otherIndex ? "true" : undefined}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(otherIndex)}
                onMouseEnter={() => setActive(otherIndex)}
                className={cn(
                  ROW_CLASS,
                  "gap-2 text-fg-muted",
                  active === otherIndex && ROW_ACTIVE_CLASS,
                )}
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line-strong text-fg-subtle"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </span>
                {copy.otherOption?.(typed)}
              </li>
            )}

            {copy.listNote && (
              <li role="presentation" className={NOTE_CLASS}>
                {copy.listNote}
              </li>
            )}
          </ul>
        )}

        <span role="status" aria-live="polite" className="sr-only">
          {announcement}
        </span>
      </div>

      <p id={hintId} className="mt-1 text-xs leading-snug text-fg-subtle">
        {copy.hint}
      </p>

      {showCustomNote && copy.customNote && (
        <p
          id={customId}
          className="mt-1 flex items-start gap-1 text-xs leading-snug text-fg-muted"
        >
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {copy.customNote}
        </p>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="mt-1 flex items-start gap-1 text-xs font-medium text-danger-fg"
        >
          <AlertIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}
