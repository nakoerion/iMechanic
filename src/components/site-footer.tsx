/**
 * The site footer — one component, two grounds (S9b).
 *
 * It was a local `Footer` inside `routes/index.tsx`. The legal pages
 * (`/privacy`, `/terms`, `/delete-account`) need the same footer, and the
 * landing footer is one of the places that must link to them, so the component
 * moved here and both surfaces import it. Two props, no variants to keep in
 * sync:
 *
 *  - `anchorBase` — the landing page's footer links point at in-page anchors
 *    (`#beta`) which only exist on `/`. Every other page passes `"/"` so the
 *    same link still lands somewhere real instead of silently doing nothing
 *    (a dead anchor in a footer is the kind of small lie this product does not
 *    ship). Default is `""` = the landing page.
 *  - `showLegalLinks` — the legal row is rendered by default; the landing page
 *    keeps it, so all three pages are reachable from the marketing footer with
 *    no second list to maintain.
 *
 * Colour note: this component paints on the FIXED navy brand ground (identical
 * in both themes), so it uses fixed palette values and white alphas — never a
 * themed `--color-fg` role, which would flip to dark ink and land at ~1.1:1.
 */
import { EngineMark } from "./landing/ui";
import { LEGAL_PAGES } from "../lib/legal";

export function SiteFooter({ anchorBase = "" }: { anchorBase?: string }) {
  return (
    <footer className="border-t border-white/10 bg-navy-950 text-slate-300">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2 text-white">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-on-brand">
                <EngineMark className="h-4 w-4" />
              </span>
              <span className="text-base font-bold tracking-tight">
                iMechanic
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              From fault code to completed repair. Reading codes and clearing
              them is free, always.
            </p>
            <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
              <a className="text-amber-300 hover:text-amber-200" href="/app">
                Open the app
              </a>
              <a
                className="text-slate-300 hover:text-white"
                href={`${anchorBase}#beta`}
              >
                Store-app mailing list
              </a>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Pricing principles
            </h3>
            <ul className="mt-3 space-y-2 text-sm leading-relaxed">
              <li>No paywalls on core scanning — reading is free, always.</li>
              <li>
                One transparent subscription. No tiers that hide the real
                product.
              </li>
              <li>
                No dark patterns: no pay-to-clear, no surprise renewals, no fine
                print gotchas.
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-white">
              Data policy — in one paragraph
            </h3>
            <p className="mt-3 text-sm leading-relaxed">
              Your car's data is your data. iMechanic reads what your car
              reports and shows it to you in plain language. We don't sell it,
              there are no ads and no third-party trackers, and the full policy
              is published below — readable, not legalese.
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              <a
                className="font-semibold text-amber-300 hover:text-amber-200"
                href="/privacy"
              >
                Read the privacy policy →
              </a>
            </p>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-white/10 pt-6 text-sm text-slate-400 sm:flex-row">
          <p>© 2026 iMechanic</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_PAGES.map((page) => (
              <a
                key={page.href}
                href={page.href}
                className="text-slate-300 underline decoration-white/25 underline-offset-2 hover:text-white"
              >
                {page.label}
              </a>
            ))}
          </nav>
        </div>

        <p className="mt-6 font-medium text-amber-300/90">
          Reading codes and clearing them is free. Always.
        </p>
      </div>
    </footer>
  );
}
