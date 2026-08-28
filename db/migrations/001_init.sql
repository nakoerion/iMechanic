-- iMechanic — initial schema (Slice S1)
-- Idempotent: safe to re-run (CREATE TABLE IF NOT EXISTS). The existing
-- `waitlist` table is intentionally NOT touched here.

-- ------------------------------------------------------------------
-- users
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  locale     text,
  country    text
);

-- ------------------------------------------------------------------
-- sessions — HttpOnly signed session cookies (token_hash is the hashed value)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id      ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash   ON sessions(token_hash);

-- ------------------------------------------------------------------
-- login_tokens — passwordless email magic links
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_tokens (
  token_hash text PRIMARY KEY,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_login_tokens_token_hash ON login_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_login_tokens_email      ON login_tokens(email);

-- ------------------------------------------------------------------
-- vehicles
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make        text,
  model       text,
  year        integer,
  engine      text,
  vin         text,
  mileage_km  integer,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);

-- ------------------------------------------------------------------
-- scans
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  source     text NOT NULL DEFAULT 'live'
             CHECK (source IN ('live', 'demo', 'manual')),
  raw_json   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scans_user_id    ON scans(user_id);
CREATE INDEX IF NOT EXISTS idx_scans_vehicle_id ON scans(vehicle_id);

-- ------------------------------------------------------------------
-- scan_codes — a single DTC read during a scan
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scan_codes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id           uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  code              text NOT NULL,
  status            text NOT NULL DEFAULT 'stored'
                    CHECK (status IN ('stored', 'pending', 'permanent')),
  freeze_frame_json jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_codes_scan_id ON scan_codes(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_codes_code    ON scan_codes(code);

-- ------------------------------------------------------------------
-- dtc_catalog — static diagnostic trouble code reference (seeded in S4)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dtc_catalog (
  code             text PRIMARY KEY,
  title            text NOT NULL,
  system           text,
  generic_cause    text,
  severity_default text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------------
-- diagnoses — a severity verdict + root cause for a scan
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diagnoses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id        uuid NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
  verdict        text NOT NULL DEFAULT 'repair_soon'
                 CHECK (verdict IN ('drive_on', 'repair_soon', 'stop_driving')),
  root_cause     text,
  confidence     integer, -- 0-100
  reasoning      text,
  source         text NOT NULL DEFAULT 'rules'
                 CHECK (source IN ('ai', 'rules')),
  cost_diy_cents  integer,
  cost_shop_cents integer,
  currency       text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_diagnoses_scan_id ON diagnoses(scan_id);

-- ------------------------------------------------------------------
-- repair_steps — step-by-step guided repair steps for a diagnosis
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repair_steps (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id uuid NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
  step_no      integer NOT NULL,
  title        text,
  body         text,
  tools        text,
  est_minutes  integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_repair_steps_diagnosis_id ON repair_steps(diagnosis_id);

-- ------------------------------------------------------------------
-- repair_jobs — a repair the user chose to carry out (DIY or workshop)
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS repair_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  diagnosis_id uuid NOT NULL REFERENCES diagnoses(id) ON DELETE CASCADE,
  state        text NOT NULL DEFAULT 'planned'
               CHECK (state IN ('planned', 'in_progress', 'done', 'verified')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_user_id      ON repair_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_repair_jobs_diagnosis_id ON repair_jobs(diagnosis_id);
