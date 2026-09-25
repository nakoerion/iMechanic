/**
 * The legal page shell (slice S9b) — `/privacy`, `/terms`, `/delete-account`.
 *
 * These three pages are read by people who are worried, and by Google Play
 * reviewers. So the layout is deliberately dull: a navy brand bar (the same
 * chrome as the landing page), one readable column, real headings with anchors,
 * and the site footer. No motion, no reveals, nothing hidden behind a tap.
 *
 * THEMING — the one thing worth stating out loud. The pages reuse the app's
 * token system (`bg-app-bg`, `text-fg`, `border-line`, `bg-surface`,
 * `shadow-card`, `CARD_MATERIAL`) rather than the landing page's fixed white
 * document, so they are readable in BOTH the light and the dark theme the
 * visitor's device asks for. The header and the footer keep the fixed navy
 * brand ground and therefore use only `on-chrome`/white-alpha colours — never
 * `text-fg`, which would be dark ink on navy (~1.1:1) in the light theme.
 *
 * Server-rendered and free of client state on purpose: no sign-in, no fetch, so
 * the pages render complete HTML for a public URL that a Play reviewer (or a
 * crawler) can fetch with no session and no JavaScript.
 */
import type { ReactNode } from "react";
import { CARD_MATERIAL } from "../app-shell";
import { EngineMark } from "../landing/ui";
import { SiteFooter } from "../site-footer";
import { cn } from "../../lib/cn";
import {
  CONTACT_EMAIL,
  LAST_UPDATED_LABEL,
  LEGAL_PAGES,
  LEGAL_PLACEHOLDERS,
  contactMailto,
} from "../../lib/legal";

/* ------------------------------------------------------------------ */
/* Placeholders — visible on purpose                                   */
/* ------------------------------------------------------------------ */

/**
 * An owner-fillable placeholder, rendered so it cannot be mistaken for a real
 * value (mono, amber, boxed). Never replace one of these with a guess: the
 * pages are public, and an invented entity name or address would be a false
 * statement on a legal page.
 */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-[4px] bg-neutral-fill px-1.5 py-0.5 font-mono text-[0.95em] font-semibold text-brand-fg">
      {children}
    </span>
  );
}

/** "Last updated: {{LAST_UPDATED}}" — the same line on all three pages. */
function LastUpdated() {
  return (
    <p className="mt-4 text-xs text-fg-subtle">
      {LAST_UPDATED_LABEL}:{" "}
      <Placeholder>{LEGAL_PLACEHOLDERS.LAST_UPDATED}</Placeholder>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Prose primitives                                                    */
/* ------------------------------------------------------------------ */

export const proseText = "text-sm leading-relaxed text-fg-muted";

/** A paragraph of policy prose. */
export function P({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={cn("mt-3 first:mt-0", proseText, className)}>{children}</p>;
}

/** A bulleted list. Pass `<li>` children; the list owns the styling. */
export function LegalList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul className={cn("mt-3 list-disc space-y-2 pl-5", proseText, className)}>
      {children}
    </ul>
  );
}

/** `strong` in policy prose reads as the ink colour, never as a link. */
export function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-fg">{children}</strong>;
}

/** A link inside prose. Amber ink on both themes, always underlined. */
export function LegalLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className="font-semibold text-brand-fg underline decoration-1 underline-offset-2 hover:text-brand-strong"
    >
      {children}
    </a>
  );
}

/**
 * A data table in the plate material, for "what we store and why" rows. Real
 * `<table>` markup (a screen reader should be able to say which column a cell
 * belongs to), horizontally scrollable on a phone rather than reflowed into
 * something ambiguous.
 */
export function LegalTable({
  head,
  rows,
  label,
}: {
  head: string[];
  rows: ReactNode[][];
  /** Accessible name for the table. */
  label: string;
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-plate border border-line bg-surface-sunken">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{label}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th
                key={cell}
                scope="col"
                className="label-micro border-b border-line px-3 py-2 text-fg-subtle"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border-b border-line px-3 py-2 leading-relaxed text-fg-muted last:border-r-0"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page shell                                                          */
/* ------------------------------------------------------------------ */

/**
 * One anchored policy section. `id` is what the contents list links to, so
 * every section is reachable by a direct link (and by a Play reviewer).
 */
export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={cn(CARD_MATERIAL.card, "mt-5 scroll-mt-24")}>
      <h2 className="text-base font-bold text-fg">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** "On this page" — the section index. Plain anchors, no JavaScript. */
export function LegalToc({
  items,
}: {
  items: { id: string; label: string }[];
}) {
  return (
    <nav
      aria-label="On this page"
      className="rounded-card border border-line bg-surface-sunken p-4"
    >
      <p className="label-micro text-fg-subtle">On this page</p>
      <ol className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
        {items.map((item, i) => (
          <li key={item.id} className="flex gap-2">
            <span className="num font-mono text-xs text-fg-subtle">
              {String(i + 1).padStart(2, "0")}
            </span>
            <a
              href={`#${item.id}`}
              className="text-fg-muted underline decoration-line-strong underline-offset-2 hover:text-fg"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function LegalHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-navy-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a
          href="/"
          className="flex items-center gap-2 rounded-control text-white"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-on-brand">
            <EngineMark className="h-4.5 w-4.5" />
          </span>
          <span className="text-lg font-bold tracking-tight">iMechanic</span>
        </a>
        <nav
          aria-label="Legal"
          className="hidden items-center gap-6 text-sm font-semibold text-slate-300 md:flex"
        >
          {LEGAL_PAGES.map((page) => (
            <a key={page.href} href={page.href} className="hover:text-white">
              {page.label}
            </a>
          ))}
        </nav>
        <a
          href="/app"
          className="inline-flex min-h-tap items-center rounded-control border border-white/25 px-4 text-sm font-semibold text-white transition-colors hover:border-white/50 hover:bg-white/10"
        >
          Open the app
        </a>
      </div>
    </header>
  );
}

export function LegalPage({
  title,
  lede,
  toc,
  children,
}: {
  title: string;
  lede: ReactNode;
  /** Section index. Omit on short pages. */
  toc?: { id: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-app-bg text-fg">
      <LegalHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        <p className="label-micro text-brand-fg">iMechanic · legal</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-fg sm:text-4xl">
          {title}
        </h1>
        <div className={cn("mt-4 text-base leading-relaxed text-fg-muted")}>
          {lede}
        </div>
        <LastUpdated />
        {toc && toc.length > 0 && (
          <div className="mt-8">
            <LegalToc items={toc} />
          </div>
        )}
        <div className="mt-6">{children}</div>
        <div className="mt-10 border-t border-line pt-6">
          <p className={proseText}>
            Something here unclear, or wrong? Tell us:{" "}
            <LegalLink href={contactMailto("iMechanic legal pages")}>
              {CONTACT_EMAIL}
            </LegalLink>
            .
          </p>
        </div>
      </main>
      <SiteFooter anchorBase="/" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cross-links (used by the app screens: sign-in and account)          */
/* ------------------------------------------------------------------ */

/**
 * The three legal pages, as links. Rendered on `/app/signin` and
 * `/app/account` so the pages are reachable from inside the installed Android
 * app as well as from a browser — and so a Play reviewer can find the public
 * deletion URL from the app itself.
 */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav
      aria-label="Legal"
      className={cn("flex flex-wrap gap-x-4 gap-y-2 text-xs", className)}
    >
      {LEGAL_PAGES.map((page) => (
        <a
          key={page.href}
          href={page.href}
          className="font-semibold text-brand-fg underline decoration-1 underline-offset-2 hover:text-brand-strong"
        >
          {page.label}
        </a>
      ))}
    </nav>
  );
}
