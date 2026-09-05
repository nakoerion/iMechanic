import { Link } from "@tanstack/react-router";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { cn } from "../lib/cn";
import { APP_COPY } from "../lib/copy";
import {
  AccountIcon,
  HistoryIcon,
  ScanIcon,
  VehiclesIcon,
  WrenchIcon,
} from "./icons";

/**
 * The app chrome.
 *
 * Layout rules:
 *  - Mobile-first single column, capped at 480px so it never turns into a
 *    stretched-out desktop form on a laptop.
 *  - Bottom tab bar below 1024px (thumb reach), left rail at >=1024px.
 *  - Header and tab bar stay navy in both themes — that is the brand anchor,
 *    and it keeps the status-bar area consistent in the installed PWA.
 *  - Safe-area insets are honoured top and bottom for notched phones.
 */

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type NavItem = { to: string; label: string; icon: IconType; exact: boolean };

export const NAV_ITEMS: NavItem[] = [
  { to: "/app/scan", label: APP_COPY.nav.scan, icon: ScanIcon, exact: false },
  { to: "/app/history", label: APP_COPY.nav.history, icon: HistoryIcon, exact: false },
  { to: "/app/vehicles", label: APP_COPY.nav.vehicle, icon: VehiclesIcon, exact: false },
  { to: "/app/account", label: APP_COPY.nav.account, icon: AccountIcon, exact: false },
];

/* ------------------------------------------------------------------ */
/* Brand                                                               */
/* ------------------------------------------------------------------ */

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-on-brand",
        className,
      )}
    >
      <WrenchIcon className="h-4.5 w-4.5" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* AppHeader                                                           */
/* ------------------------------------------------------------------ */

export function AppHeader({ actions }: { actions?: ReactNode }) {
  return (
    <header className="sticky top-0 z-40 bg-navy-950 pt-safe text-white">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
        <Link
          to="/app"
          aria-label={APP_COPY.brand.homeLabel}
          className="flex min-h-11 items-center gap-2 rounded-control pr-2"
        >
          <BrandMark />
          <span className="text-lg font-bold tracking-tight text-white">
            {APP_COPY.brand.name}
          </span>
        </Link>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

const TAB_BASE =
  "relative flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold";

export function BottomTabBar() {
  return (
    <nav
      aria-label={APP_COPY.nav.label}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-800 bg-navy-950 pb-safe lg:hidden"
    >
      <ul className="mx-auto grid w-full max-w-lg grid-cols-4">
        {NAV_ITEMS.map((item) => (
          <li key={item.to} className="contents">
            <Link
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className={cn(TAB_BASE, "text-slate-300")}
              /* aria-current: active state must not be colour-only (D13). */
              activeProps={{
                className: cn(TAB_BASE, "text-brand"),
                "aria-current": "page",
              }}
              inactiveProps={{ className: cn(TAB_BASE, "text-slate-300") }}
            >
              {({ isActive }) => (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "absolute inset-x-4 top-0 h-0.5 rounded-full",
                      isActive ? "bg-brand" : "bg-transparent",
                    )}
                  />
                  <item.icon className="h-6 w-6" />
                  <span>{item.label}</span>
                </>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const RAIL_BASE =
  "flex min-h-12 items-center gap-3 rounded-control px-3 text-sm font-semibold";

function SideRail() {
  return (
    <nav
      aria-label={APP_COPY.nav.label}
      className="sticky top-20 hidden h-fit w-56 shrink-0 flex-col gap-1 lg:flex"
    >
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: item.exact }}
          className={cn(RAIL_BASE, "text-fg-muted hover:bg-neutral-fill hover:text-fg")}
          /* aria-current: active state must not be colour-only (D13). */
          activeProps={{
            className: cn(RAIL_BASE, "bg-neutral-fill text-fg"),
            "aria-current": "page",
          }}
          inactiveProps={{
            className: cn(RAIL_BASE, "text-fg-muted hover:bg-neutral-fill hover:text-fg"),
          }}
        >
          {({ isActive }) => (
            <>
              <item.icon className={cn("h-5 w-5", isActive && "text-brand-strong")} />
              <span>{item.label}</span>
            </>
          )}
        </Link>
      ))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Shell + containers                                                  */
/* ------------------------------------------------------------------ */

export function AppShell({
  children,
  headerActions,
}: {
  children: ReactNode;
  headerActions?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-app-bg text-fg">
      <AppHeader actions={headerActions} />
      <div className="mx-auto flex w-full max-w-5xl gap-8 px-0 lg:px-4">
        <SideRail />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
      <BottomTabBar />
    </div>
  );
}

/**
 * The 480px reading column every screen lives in. `pb-28` clears the fixed
 * tab bar on mobile.
 */
export function ScreenContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[30rem] px-4 pt-5 pb-28 lg:mx-0 lg:pb-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Screen title block. Keeps every screen's heading rhythm identical. */
export function ScreenHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className="mb-5">
      <h1 className="text-2xl font-extrabold tracking-tight text-fg">{title}</h1>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-fg-muted">{description}</p>
      )}
    </header>
  );
}

/**
 * StickyActionBar — the one primary action for a screen, pinned above the tab
 * bar so it is always in thumb reach. Put the free action here; never put a
 * paywalled action in this slot on a screen whose job is free.
 */
export function StickyActionBar({
  children,
  note,
}: {
  children: ReactNode;
  note?: string;
}) {
  return (
    <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-6 border-t border-line bg-surface/95 px-4 pt-3 pb-3 backdrop-blur lg:bottom-0">
      {children}
      {note && (
        <p className="mt-2 text-center text-xs leading-snug text-fg-subtle">{note}</p>
      )}
    </div>
  );
}

/** Neutral content card. The severity components bring their own borders. */
export function Card({
  children,
  className,
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-line bg-surface p-5 shadow-sm",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
