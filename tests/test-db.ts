/**
 * Test-database helper (S3 merge-gate R2 — test isolation).
 *
 * DB-backed tests must NEVER touch production (DATABASE_URL holds real
 * sessions and the public waitlist). They run against a separate Neon
 * branch whose connection string arrives via TEST_DATABASE_URL.
 *
 * - TEST_DATABASE_URL unset → throw with setup instructions (the suite
 *   aborts instead of silently running nowhere or, worse, somewhere real).
 * - TEST_DATABASE_URL === DATABASE_URL → throw (the variable was pointed
 *   at production, defeating the whole guard).
 *
 * NOTE: this file intentionally references process.env.DATABASE_URL — only
 * for the equality guard above. It is the single allowed DATABASE_URL
 * reference under tests/; no test suite reads the production URL.
 */
import { neon } from "@neondatabase/serverless";

export function requireTestDbUrl(): string {
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) {
    throw new Error(
      "TEST_DATABASE_URL is not set — DB-backed tests refuse to run against production.\n" +
        "Create a separate Neon branch for tests and export its connection string:\n" +
        "  export TEST_DATABASE_URL='postgresql://< test-branch connection string >'\n" +
        "See README “Test database isolation” for the full flow.",
    );
  }
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      "TEST_DATABASE_URL equals DATABASE_URL — the test database must be a separate " +
        "Neon branch, never production. Point TEST_DATABASE_URL at a branch.",
    );
  }
  return testUrl;
}

/** neon handle bound to the guarded test-database URL. */
export function testDb() {
  return neon(requireTestDbUrl());
}

/**
 * True when a usable, non-production test database is configured.
 *
 * The DB-backed suites wrap themselves in `describe.skipIf(!hasTestDbUrl())` so
 * that `bun run test` is GREEN with no `TEST_DATABASE_URL` — the suites SKIP
 * (and say so in the summary) instead of failing the run with a setup error.
 * The safety property is unchanged: they only ever run against a separate
 * branch, and `requireTestDbUrl()` still refuses a missing variable or a URL
 * that equals production.
 */
export function hasTestDbUrl(): boolean {
  const testUrl = process.env.TEST_DATABASE_URL;
  return Boolean(testUrl && testUrl !== process.env.DATABASE_URL);
}
