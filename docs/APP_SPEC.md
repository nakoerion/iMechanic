# iMechanic — Full Application Build Spec (working document)

Status: working spec authored by agent-lead. Anchors the delegation sequence.
Not owner-ratified strategy — the business plan is authoritative for strategy.

## Product surfaces

1. **Marketing site** — `/` (exists today: landing + waitlist → Neon).
2. **Web + mobile app** — `/app/*`, mobile-first, installable PWA (manifest + service
   worker + offline shell). Same codebase serves desktop web and phone.
3. **Native wrappers** — Capacitor iOS + Android projects wrapping `/app`, using a
   native BLE plugin for OBD2. Required because **iOS Safari does not support Web
   Bluetooth**; Android Chrome does. Store submission needs the owner's Apple
   Developer and Google Play accounts.

## Stack (fixed — memory-light, matches what's already here)

- TanStack Start (React 19 + Vite 7) + Tailwind 4 — already in the repo.
- Server functions / API routes in the same app (no separate backend service).
- Neon Postgres via `@neondatabase/serverless` (`DATABASE_URL` already set).
- Auth: passwordless email magic-link, own tables, HttpOnly signed session cookie.
- AI diagnosis: server-side LLM call. Needs `ANTHROPIC_API_KEY` (or `OPENAI_API_KEY`)
  in Secrets. Until present, the endpoint must fall back to the deterministic rule
  engine and say so — never fabricate a diagnosis.
- Payments: Stripe via the platform's managed account (lead-only tools).

## Data model (Postgres)

- `users` (id, email, created_at, locale, country)
- `sessions` (token_hash, user_id, expires_at)
- `login_tokens` (token_hash, email, expires_at, used_at)
- `vehicles` (id, user_id, make, model, year, engine, vin, mileage_km)
- `scans` (id, user_id, vehicle_id, source: live|demo|manual, created_at, raw_json)
- `scan_codes` (id, scan_id, code, status: stored|pending|permanent, freeze_frame_json)
- `dtc_catalog` (code, title, system, generic_cause, severity_default, ...) — seeded
- `diagnoses` (id, scan_id, verdict: drive_on|repair_soon|stop_driving, root_cause,
  confidence, reasoning, source: ai|rules, cost_diy_cents, cost_shop_cents, currency)
- `repair_steps` (id, diagnosis_id, step_no, title, body, tools, est_minutes)
- `repair_jobs` (id, user_id, diagnosis_id, state: planned|in_progress|done|verified)
- `waitlist` (exists)
- Every table owned-row scoped by `user_id`; no query without a user filter.

## The golden path (must work end to end)

Connect → Scan → Understand → Verdict → Decide → Act → Verify

- **Connect**: Web Bluetooth/Web Serial ELM327 driver + **Demo mode** (simulated
  adapter, always available, no hardware) + **Manual mode** (type in a code).
- **Scan**: read stored/pending/permanent DTCs, freeze frames, live PIDs, VIN.
  **Clear codes is free forever** — never behind the paywall.
- **Understand/Verdict**: rules engine first (deterministic, from `dtc_catalog`),
  AI layered on top for root cause + reasoning. Verdict always shown with confidence.
- **Decide**: DIY vs workshop cost bands per launch market (DE / UK / AL).
- **Act**: step-by-step guided repair, checkable steps, tool list.
- **Verify**: re-scan, confirm the code is gone, mark job verified.

## Free vs Pro (per business plan)

Free forever: connect, read codes, clear codes, plain-English code meaning.
Pro (paid): AI root-cause diagnosis, severity verdict, cost decision, guided repairs,
repair history, multi-vehicle. Prices are an unvalidated preview — do not hard-code
final prices in the UI; read them from one config module.

## Build sequence (one write delegation each)

- **S1** Repo under version control + app shell: `/app` routes, PWA manifest +
  service worker, mobile-first layout/nav, full DB migration, all tables created.
- **S2** Auth: magic-link request + verify, session cookie, protected `/app` routes,
  account page, sign out. (Needs an email sender — inbox provisioning by lead.)
- **S3** OBD2 layer: ELM327 driver (Web Bluetooth + Web Serial), demo simulator,
  manual entry, scan persistence, free clear-codes flow.
- **S4** Diagnosis: `dtc_catalog` seed (top ~300 generic P-codes), rules engine,
  AI endpoint with graceful fallback, verdict UI.
- **S5** Decide + Act + Verify: cost estimator, guided repair steps, re-scan verify.
- **S6** Pro paywall + Stripe checkout wiring + entitlement checks.
- **S7** Capacitor iOS/Android wrappers + native BLE bridge; build artifacts only.

Definition of done for each slice: `bun run build` passes, the working site serves the
new routes, no console errors, and the slice's happy path is exercised for real
(not just written).

## S3 merge gates — owner architecture review, 2026-09-07 (BLOCKING PR #5)

PR #5 must NOT merge to `main` until all four land. The published free promise
("severity verdict on standard code lookups") must be TRUE before S3 publishes,
so the deterministic part of the old S4 is pulled FORWARD into S3:

1. **dtc_catalog seed migration + severity rules engine.** New append-only
   migration seeds `dtc_catalog` (top ~300 generic P-codes: `code`, `title`,
   `system`, `generic_cause`, `severity_default`). A deterministic rules engine
   derives a verdict (`drive_on` | `repair_soon` | `stop_driving`) from the
   catalog. **Every scan writes a `diagnoses` row** (source `rules`, with
   confidence), and the scan result view renders a free, ungated `VerdictPanel`.
2. **Tests migrate to `TEST_DATABASE_URL`** with a HARD refusal to run against
   `DATABASE_URL`. All DB-backed tests (schema, migrate, obd persistence) read
   `TEST_DATABASE_URL` via one shared helper that throws when the var is unset
   or equal to `DATABASE_URL`. Tests must never touch production. (Third time
   this has been raised — the S3 obd persistence tests were also hitting prod.)
3. **Live scans persist the full command/response transcript** in
   `scans.raw_json` — every AT command sent and the adapter's raw reply, not
   just the parsed codes. Demo/manual scans may omit it.
4. **Clear-codes confirmation gains the masking + readiness-monitor warnings**
   from the spec: clearing codes does not fix the underlying fault (the light
   may return), and it resets the readiness monitors, so the car may not pass an
   emissions inspection until they re-run. Confirmation copy must say both.

### Logged follow-ups (NOT blocking this merge)
- multi-ECU reply parsing in `parseDtcResponseText`
- `ATSP0` in the ELM327 init sequence
- the `44` acknowledgment check after clear-codes (service 04)
- S2 security-test debt (still owed)
