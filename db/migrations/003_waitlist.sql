-- 003_waitlist.sql — bring the pre-existing waitlist table under migration
-- control (QA defect D17).
--
-- This table predates the app: the landing page created it ad hoc from
-- inside the waitlist submit handler, which meant DDL ran on every form
-- submission. The statement below is byte-for-byte the one the handler ran,
-- so against the live database it is a pure no-op (IF NOT EXISTS) and no
-- existing row is touched. The handler now only INSERTs.
--
-- waitlist is deliberately global (no user_id) — one of the two documented
-- exceptions (with dtc_catalog) to the every-table-is-user-scoped rule.

CREATE TABLE IF NOT EXISTS waitlist (
  email text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
