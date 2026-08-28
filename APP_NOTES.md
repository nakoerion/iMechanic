# iMechanic app — build notes

Living handover file. Update it at the end of every slice.

## Commands

```bash
cd /home/team/shared/site
bun run dev        # working site (do not run alongside a build — modest RAM)
bun run build      # production build; must pass before any slice is "done"
bun run migrate    # apply db/migrations/*.sql (idempotent, safe to re-run)
node scripts/gen-icons.mjs   # regenerate PWA icons from public/icons/icon-master.png
```

## Environments

- Working: https://6e1923cb2eb061d84c9c1a0cc9cbfefb-dev.ctonew.app
- Live: https://6e1923cb2eb061d84c9c1a0cc9cbfefb.ctonew.app (only the lead publishes)

## Route map

| Route | File | Purpose |
|---|---|---|
| `/` | `src/routes/index.tsx` | Marketing landing page + waitlist. Nav now has an "Open the app" link to `/app`. |
| `/app` | `src/routes/app/route.tsx` (layout) + `app/index.tsx` | App shell + home |
| `/app/scan` | `src/routes/app/scan.tsx` | Scan surface (S3) |
| `/app/vehicles` | `src/routes/app/vehicles.tsx` | Garage (S3+) |
| `/app/history` | `src/routes/app/history.tsx` | Scan/repair history (S5) |
| `/app/account` | `src/routes/app/account.tsx` | Account (S2) |

Shared components live in `src/components/` (`empty-state.tsx`, `icons.tsx`).

## Database

Migration: `db/migrations/001_init.sql`, runner `scripts/migrate.ts`. Idempotent.
Eleven tables live in Neon and verified via `information_schema.tables`:
`users, sessions, login_tokens, vehicles, scans, scan_codes, dtc_catalog,
diagnoses, repair_steps, repair_jobs, waitlist`.

`waitlist` predates the app and is used by the landing page — do not alter it.

## PWA

- `public/manifest.webmanifest` — `start_url: /app`, `display: standalone`.
- `public/sw.js` — network-first for navigations, cache-first for static assets,
  **never** caches POST, `/api/*`, `/_server/*`, or `?data=` server-fn transport.
- Registered client-side from `ServiceWorkerRegistrar` in `src/routes/__root.tsx`;
  skipped on non-HTTPS non-localhost origins.
- Icons in `public/icons/` are engineer-generated placeholders. The designer
  replaces them with the amber-on-navy wrench mark (standardise on amber-400 —
  the favicon currently uses amber-500 and drifts from the on-page mark).

## Slice status

- **S1 app shell + schema — done.** Finished by the lead: manifest/apple-touch
  links, service-worker registration, landing→`/app` entry point.
- Next: designer implements the design-token system and core shell components,
  then S2 (auth).

## Decisions already made (do not relitigate)

- **The rules-engine severity verdict is FREE.** The live landing page publicly
  promises "Severity verdict on standard code lookups" in the free tier, and we
  honour what we published. AI root cause, reasoning and confidence are Pro.
- App is **light-first with a full dark theme** shipped alongside; the header and
  bottom tab bar stay navy-950 in both themes for brand continuity.
- Beta is **English-only**, but copy goes through props and all currency/unit
  formatting reads from one market config module (DE €/km, UK £/miles, AL ALL/km)
  keyed off `users.country`. That module also holds the price bands — no prices
  hardcoded in components.
- Clearing codes is free forever and must never carry a lock, a Pro badge, or a
  dimmed state.
