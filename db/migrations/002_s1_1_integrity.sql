-- iMechanic — S1.1 corrective slice (QA review defects D4, D5, D6, D7, D11).
--
-- Applied exactly once via the schema_migrations ledger, inside a transaction.
-- This file is NOT idempotent on its own — never run it by hand; use
-- `bun run migrate`. Never edit an applied migration; add a new file instead.

-- ==================================================================
-- D5 — denormalise user_id onto child tables.
-- The tables are empty in every environment, so a plain ADD COLUMN
-- NOT NULL is safe. Each user_id also references users directly so a
-- GDPR user-delete cascades no matter which path reaches the row.
-- ==================================================================
ALTER TABLE scan_codes
  ADD COLUMN user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE diagnoses
  ADD COLUMN user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE repair_steps
  ADD COLUMN user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX idx_scan_codes_user_id   ON scan_codes(user_id);
CREATE INDEX idx_diagnoses_user_id    ON diagnoses(user_id);
CREATE INDEX idx_repair_steps_user_id ON repair_steps(user_id);

-- ==================================================================
-- D4 — composite keys + composite FKs so the database physically
-- refuses to attach one user's child row to another user's parent.
-- The single-column FKs they replace are dropped: the composite FK
-- subsumes them (parent existence AND same owner).
-- NOTE: `ON DELETE SET NULL (column)` — nulling only the child column,
-- not user_id — requires Postgres 15+. Live database is Postgres 18.
-- ==================================================================
ALTER TABLE vehicles  ADD CONSTRAINT vehicles_id_user_uniq  UNIQUE (id, user_id);
ALTER TABLE scans     ADD CONSTRAINT scans_id_user_uniq     UNIQUE (id, user_id);
ALTER TABLE diagnoses ADD CONSTRAINT diagnoses_id_user_uniq UNIQUE (id, user_id);

-- scans → vehicles (vehicle_id is nullable; a vehicle delete detaches the
-- scan but must never null user_id, hence the column list on SET NULL)
ALTER TABLE scans DROP CONSTRAINT scans_vehicle_id_fkey;
ALTER TABLE scans ADD CONSTRAINT scans_vehicle_same_user
  FOREIGN KEY (vehicle_id, user_id) REFERENCES vehicles(id, user_id)
  ON DELETE SET NULL (vehicle_id);

-- scan_codes → scans
ALTER TABLE scan_codes DROP CONSTRAINT scan_codes_scan_id_fkey;
ALTER TABLE scan_codes ADD CONSTRAINT scan_codes_scan_same_user
  FOREIGN KEY (scan_id, user_id) REFERENCES scans(id, user_id)
  ON DELETE CASCADE;

-- diagnoses → scans
ALTER TABLE diagnoses DROP CONSTRAINT diagnoses_scan_id_fkey;
ALTER TABLE diagnoses ADD CONSTRAINT diagnoses_scan_same_user
  FOREIGN KEY (scan_id, user_id) REFERENCES scans(id, user_id)
  ON DELETE CASCADE;

-- repair_steps → diagnoses
ALTER TABLE repair_steps DROP CONSTRAINT repair_steps_diagnosis_id_fkey;
ALTER TABLE repair_steps ADD CONSTRAINT repair_steps_diagnosis_same_user
  FOREIGN KEY (diagnosis_id, user_id) REFERENCES diagnoses(id, user_id)
  ON DELETE CASCADE;

-- repair_jobs → diagnoses
ALTER TABLE repair_jobs DROP CONSTRAINT repair_jobs_diagnosis_id_fkey;
ALTER TABLE repair_jobs ADD CONSTRAINT repair_jobs_diagnosis_same_user
  FOREIGN KEY (diagnosis_id, user_id) REFERENCES diagnoses(id, user_id)
  ON DELETE CASCADE;

-- ==================================================================
-- D7 — step completion + verification linkage for repair jobs.
-- ==================================================================
CREATE TABLE repair_job_steps (
  job_id  uuid NOT NULL REFERENCES repair_jobs(id) ON DELETE CASCADE,
  step_id uuid NOT NULL REFERENCES repair_steps(id) ON DELETE CASCADE,
  done_at timestamptz,
  PRIMARY KEY (job_id, step_id)
);

ALTER TABLE repair_jobs ADD COLUMN vehicle_id uuid;
ALTER TABLE repair_jobs ADD CONSTRAINT repair_jobs_vehicle_same_user
  FOREIGN KEY (vehicle_id, user_id) REFERENCES vehicles(id, user_id)
  ON DELETE SET NULL (vehicle_id);
CREATE INDEX idx_repair_jobs_vehicle_id ON repair_jobs(vehicle_id);

ALTER TABLE repair_jobs ADD COLUMN verified_by_scan_id uuid;
ALTER TABLE repair_jobs ADD CONSTRAINT repair_jobs_verified_scan_same_user
  FOREIGN KEY (verified_by_scan_id, user_id) REFERENCES scans(id, user_id)
  ON DELETE SET NULL (verified_by_scan_id);

-- ==================================================================
-- D6 — entitlement storage for the Pro tier (written by S6).
-- price_band records WHICH band a subscriber is on, never an amount.
-- No price is ever stored in the database or hardcoded in components —
-- amounts live ONLY in src/lib/market.ts.
-- ==================================================================
ALTER TABLE users ADD COLUMN stripe_customer_id text UNIQUE;

CREATE TABLE subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id text UNIQUE,
  status                 text NOT NULL CHECK (status IN
    ('trialing','active','past_due','canceled','incomplete','incomplete_expired')),
  price_band             text, -- WHICH band, never an amount
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE UNIQUE INDEX idx_subscriptions_one_active
  ON subscriptions(user_id) WHERE status IN ('trialing','active');

-- Stripe retries webhooks by design; without this ledger a replayed
-- webhook double-applies. S6 must insert the event id before acting.
CREATE TABLE stripe_events (
  id          text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);

-- ==================================================================
-- D11 — missing CHECKs, and three defaults that asserted a claim
-- nobody made. The columns stay NOT NULL: every caller must state the
-- value. A demo scan must never silently record itself as 'live', and
-- an incomplete diagnosis must never assert a verdict or attribute it
-- to the rules engine.
-- ==================================================================
ALTER TABLE users ADD CONSTRAINT users_country_check
  CHECK (country IN ('DE','GB','AL'));
ALTER TABLE dtc_catalog ADD CONSTRAINT dtc_catalog_severity_default_check
  CHECK (severity_default IN ('drive_on','repair_soon','stop_driving'));
ALTER TABLE diagnoses ADD CONSTRAINT diagnoses_confidence_check
  CHECK (confidence BETWEEN 0 AND 100);
ALTER TABLE diagnoses ADD CONSTRAINT diagnoses_currency_check
  CHECK (currency IN ('EUR','GBP','ALL'));

ALTER TABLE scans     ALTER COLUMN source  DROP DEFAULT;
ALTER TABLE diagnoses ALTER COLUMN verdict DROP DEFAULT;
ALTER TABLE diagnoses ALTER COLUMN source  DROP DEFAULT;

-- ==================================================================
-- Documentation comments (D5 exceptions + two QA-suggested notes).
-- waitlist is created here too so a fresh database gets it from the
-- migration (no-op against the live table; identical DDL to the
-- runtime copy in src/routes/index.tsx, which D17/S1.2 will remove).
-- ==================================================================
CREATE TABLE IF NOT EXISTS waitlist (
  email      text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE dtc_catalog IS
  'GLOBAL table — deliberate exception to the "every table is user-scoped" rule (APP_SPEC): static diagnostic-code reference data shared by all users. The only other exception is waitlist.';
COMMENT ON TABLE waitlist IS
  'GLOBAL table — deliberate exception to the "every table is user-scoped" rule (APP_SPEC): pre-launch marketing signups, not tied to app users. The only other exception is dtc_catalog.';
COMMENT ON COLUMN scan_codes.code IS
  'Deliberately NO FK to dtc_catalog: manufacturer-specific codes must remain storable even when they are not in the seeded catalog. Do not "fix" this.';
COMMENT ON COLUMN vehicles.mileage_km IS
  'Always kilometres, including GB vehicles — convert to miles at the presentation edge only.';
