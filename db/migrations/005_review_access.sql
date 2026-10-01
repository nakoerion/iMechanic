-- iMechanic — S10-T2: the review-only access path (Google Play app access review).
--
-- Adds the ONE durable marker of the store-review account beyond its address:
-- `users.is_reviewer`. Every other account keeps the default `false`, so any
-- future analytics, metric or export can exclude the reviewer with
--
--     WHERE NOT is_reviewer            -- or: email <> 'playreview@imechanic.app'
--
-- without touching a single product table. The email address
-- `playreview@imechanic.app` is the primary marker (it is what a human reads);
-- this column is the machine-readable one, so no metric has to string-match an
-- address. The app ships no analytics SDK today — this is deliberately
-- forward-looking, and it costs nothing: the column is only ever `true` for that
-- one row, and only when REVIEW_ACCESS_CODE was set at the moment it was created.
--
-- Applied exactly once via the schema_migrations ledger, inside a transaction.
-- Never edit an applied migration; add a new file instead.

ALTER TABLE users
  ADD COLUMN is_reviewer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN users.is_reviewer IS
  'Store-review account (S10-T2, playreview@imechanic.app). Exclude from metrics with: WHERE NOT is_reviewer.';
