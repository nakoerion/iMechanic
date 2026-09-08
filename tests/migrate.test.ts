/**
 * Migration runner tests (S1.1 — QA defect D3; S3-R2 test isolation).
 *
 * Runs the real `scripts/migrate.ts` against the ISOLATED test database
 * (via tests/test-db.ts) — never production. The test DB gets all migrations
 * applied there first, so a correct runner must be a clean no-op that exits
 * 0 — that IS the re-runnability guarantee.
 *
 * Guard placement: requireTestDbUrl() runs in beforeAll (not module scope),
 * so the unset-variable abort fails this suite's hooks instead of the whole
 * file — the pure unit suites in other files still run and pass.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { requireTestDbUrl, testDb } from "./test-db";

const siteDir = path.join(import.meta.dirname, "..");
/* Derived from the migrations dir, not hardcoded (S1.2): the ledger must
 * contain exactly the files on disk, whatever their current number. */
const migrationFiles = readdirSync(path.join(siteDir, "db", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

let url: string;
let db: ReturnType<typeof testDb>;

beforeAll(() => {
  url = requireTestDbUrl(); // throws the clear abort message when unset
  db = testDb();
});

function runMigrate() {
  return spawnSync("bun", ["run", "scripts/migrate.ts"], {
    cwd: siteDir,
    // MIGRATION_DATABASE_URL routes the runner at the test DB for this
    // test only; normal `bun run migrate` still uses production.
    env: { ...process.env, MIGRATION_DATABASE_URL: url },
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("D3 — migration runner", () => {
  it("is safely re-runnable: skips applied files and exits 0 (run twice)", () => {
    for (const run of [1, 2]) {
      const res = runMigrate();
      expect(res.status, `run ${run} stderr: ${res.stderr}`).toBe(0);
      for (const file of migrationFiles) {
        expect(res.stdout).toContain(`${file} already applied`);
      }
      expect(res.stdout).toContain(
        `0 applied, ${migrationFiles.length} already up to date`,
      );
    }
  });

  it("has recorded every migration file exactly once in schema_migrations", async () => {
    const rows = await db.query(
      "SELECT filename, count(*)::int AS n FROM schema_migrations GROUP BY filename ORDER BY filename",
    );
    expect(rows.map((r) => `${r.filename}:${r.n}`)).toEqual(
      migrationFiles.map((f) => `${f}:1`),
    );
  });
});
