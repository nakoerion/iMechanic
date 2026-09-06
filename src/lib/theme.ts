/**
 * Theme store — System / Light / Dark.
 *
 * The app is light-first with a full dark theme. The choice is persisted in
 * localStorage and applied to <html> as a `dark` class. The blocking script in
 * __root.tsx runs the same logic before first paint so there is never a flash
 * of the wrong theme.
 */
import { useSyncExternalStore } from "react";

export type ThemeChoice = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "imechanic.theme";

export const THEME_CHOICES: { value: ThemeChoice; label: string; hint: string }[] = [
  { value: "system", label: "System", hint: "Follow the device setting" },
  { value: "light", label: "Light", hint: "Always light" },
  { value: "dark", label: "Dark", hint: "Always dark" },
];

function isChoice(value: unknown): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

/**
 * Inlined verbatim into <head>. Keep it small, dependency-free and ES5-safe:
 * it runs before the bundle and before first paint.
 */
export const themeInitScript = `(function(){try{var k=${JSON.stringify(
  THEME_STORAGE_KEY,
)};var c=localStorage.getItem(k);if(c!=="light"&&c!=="dark"&&c!=="system"){c="system";}var d=c==="dark"||(c==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.dataset.theme=c;}catch(_){}})();`;

/**
 * SSR-safe alias: scripts cannot set data attributes (React would not see
 * them) and the blocking inline script already applies the theme to
 * <html> before first paint — so React always SSR-renders the element
 * WITHOUT the attribute, and the script + useTheme (client) keep it in
 * sync. Never render `data-theme` from React.
 */
export const themeDataAttrs = { "data-theme": undefined } as const;

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

export function readStoredTheme(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isChoice(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function applyToDocument(choice: ThemeChoice) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("dark", resolveTheme(choice) === "dark");
  root.dataset.theme = choice;
}

/* --- tiny external store so every mounted control stays in sync --- */

const listeners = new Set<() => void>();
let current: ThemeChoice | null = null;

function snapshot(): ThemeChoice {
  if (current === null) current = readStoredTheme();
  return current;
}

function serverSnapshot(): ThemeChoice {
  return "system";
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  let mql: MediaQueryList | undefined;
  const onSystemChange = () => {
    if (snapshot() === "system") {
      applyToDocument("system");
      emit();
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    current = isChoice(event.newValue) ? event.newValue : "system";
    applyToDocument(current);
    emit();
  };

  if (typeof window !== "undefined") {
    mql = window.matchMedia?.("(prefers-color-scheme: dark)");
    mql?.addEventListener("change", onSystemChange);
    window.addEventListener("storage", onStorage);
  }

  return () => {
    listeners.delete(listener);
    mql?.removeEventListener("change", onSystemChange);
    if (typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function setTheme(choice: ThemeChoice) {
  current = choice;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* private mode — the theme still applies for this session */
  }
  applyToDocument(choice);
  emit();
}

export function useTheme(): {
  choice: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (choice: ThemeChoice) => void;
} {
  const choice = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return { choice, resolved: resolveTheme(choice), setTheme };
}
