/**
 * Migration runner tests (S1.1 — QA defect D3).
 *
 * Runs the real `scripts/migrate.ts` against the live database. Both
 * migrations are already applied there, so a correct runner must be a
 * clean no-op that exits 0 — that IS the re-runnability guarantee.
 */
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const siteDir = path.join(import.meta.dirname, "..");
/* Derived from the migrations dir, not hardcoded (S1.2): the ledger must
 * contain exactly the files on disk, whatever their current number. */
const migrationFiles = readdirSync(path.join(siteDir, "db", "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set to run migration tests.");
const db = neon(url);

function runMigrate() {
  return spawnSync("bun", ["run", "scripts/migrate.ts"], {
    cwd: siteDir,
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
