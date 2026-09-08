# iMechanic

iMechanic is a mobile-first application that carries an out-of-warranty car owner
from a check-engine light to a completed, affordable repair. It connects to any
cheap OBD2 adapter the user already owns, uses AI to find the root cause, gives an
honest severity verdict (drive on / repair soon / stop driving), and presents a
DIY-vs-workshop cost decision with step-by-step guided repairs.

Its defining promise is radical pricing transparency: **reading codes, clearing
codes, plain-English code meaning and the rules-based severity verdict are free,
always.** See `AGENTS.md` for the standing product rules every change must respect.

One codebase serves three surfaces: the marketing site, an installable mobile-first
web app (PWA) that also serves desktop, and (later, S7) native iOS/Android wrappers
around that app.

## Stack

- [TanStack Start](https://tanstack.com/start) (React 19, file-based routing, server functions)
- Vite 7, TypeScript, Tailwind CSS 4
- Neon Postgres (serverless driver, `@neondatabase/serverless`)
- Vitest for tests, Bun as the runtime/package manager
- PWA: `public/manifest.webmanifest`, `public/sw.js` service worker, generated icons

## Running it

```sh
bun install         # install dependencies
bun run dev         # dev server on port 3000 (hot reload)
bun run build       # production build (vite build → dist/)
bun run migrate     # apply pending SQL migrations from db/migrations/
bun run test        # run the vitest suite (pure unit tests need no DB;
                    # DB-backed suites need TEST_DATABASE_URL — see below)
```

Do not run `bun run dev` and `bun run build` at the same time on a small machine.

## Environment variables

Never commit values for any of these — they are injected into the environment.

| Variable | Status | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | required now | Neon Postgres connection string. Used by server functions (`src/db.ts`) and `bun run migrate`. Queries fail with a clear error if it is unset. |
| `TEST_DATABASE_URL` | required for DB-backed tests | Separate Neon **branch** for tests. Never point it at production. |
| `MIGRATION_DATABASE_URL` | optional override | When set, `bun run migrate` targets this URL instead of `DATABASE_URL`. Used by the migration test to exercise the runner against the test database. |
| `ANTHROPIC_API_KEY` | required from S4 | LLM key for AI root-cause analysis. When absent or the AI is unavailable, the app must say so and fall back to the deterministic rules engine — never fabricate a diagnosis. |

## Test database isolation

DB-backed tests (`tests/schema.test.ts`, `tests/migrate.test.ts`, the scan
persistence block in `tests/obd.test.ts`) must never touch production — the
production database holds real sessions and the public waitlist. They connect
only through the `tests/test-db.ts` helper:

- The helper reads `TEST_DATABASE_URL` (a separate Neon branch — create one in
  the Neon dashboard and export its connection string:
  `export TEST_DATABASE_URL='postgresql://…'`).
- If `TEST_DATABASE_URL` is **unset**, the suite aborts with a clear message
  instead of running — the pure unit tests (dtc/obd parsing, diagnosis, auth)
  still pass with no DB at all.
- If `TEST_DATABASE_URL` **equals** `DATABASE_URL`, the suite aborts too — the
  variable must never point at production.
- To exercise the migration runner against the test database, the migration
  test sets `MIGRATION_DATABASE_URL=$TEST_DATABASE_URL` when spawning
  `scripts/migrate.ts`; a normal `bun run migrate` uses `DATABASE_URL`.

No test suite reads the production URL — the only whole-word `DATABASE_URL`
match under `tests/` is the equality guard inside `tests/test-db.ts` itself
(`TEST_DATABASE_URL` mentions elsewhere are the new variable, not production).

## Route map

| Route | File | Purpose |
| --- | --- | --- |
| `/` | `src/routes/index.tsx` | Marketing landing page: wedge message, golden path, free-forever list, pricing preview, beta waitlist form (persists to the `waitlist` table). |
| `/app` | `src/routes/app/route.tsx` + `index.tsx` | App shell layout and home screen. |
| `/app/scan` | `src/routes/app/scan.tsx` | Scan screen (OBD2 connect / read / clear codes). |
| `/app/history` | `src/routes/app/history.tsx` | Scan and repair history. |
| `/app/vehicles` | `src/routes/app/vehicles.tsx` | Vehicle management. |
| `/app/account` | `src/routes/app/account.tsx` | Account / sign-in. |
| `/app/_gallery` | `src/routes/app/[_gallery].tsx` | Internal design-system gallery (development reference, not linked from the UI). |

## Project layout

- `src/components/ui/`, `src/components/severity/` — design system components
- `src/lib/` — theme, severity model, market/pricing config (`market.ts` — the **only** place prices live), shared copy
- `db/migrations/` — append-only SQL migrations, applied via `bun run migrate`, recorded in `schema_migrations`
- `scripts/` — `migrate.ts`, `gen-icons.mjs` (regenerates PWA icons from `design/icon-master.png`)
- `design/` — source assets that must never be served to visitors (e.g. the 1MB icon master)
- `tests/` — vitest suites for migrations and schema integrity (run against the real database)

## Architecture & decisions

- `APP_SPEC.md` (in the team shared directory) — the architecture contract
- `APP_NOTES.md` (repo root) — build notes and decisions made during implementation
- `AGENTS.md` (repo root) — standing product rules for every contributor and agent session
- `SITE.md` — notes on the hosting template this app is built on
