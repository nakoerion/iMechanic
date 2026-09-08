/**
 * DB migration runner for iMechanic (rewritten in S1.1 — QA defect D3).
 *
 * Run with: `bun run migrate`
 *
 * How it works:
 *  - A `schema_migrations` ledger records every applied filename. Files already
 *    in the ledger are skipped, so migrations run exactly once and the runner
 *    is always safe to re-run.
 *  - Each file is sent to Postgres as ONE multi-statement string over the
 *    WebSocket `Client` (full pg protocol, simple-query mode). We deliberately
 *    do NOT split on `;` — a naive splitter would chop string literals that
 *    contain semicolons (e.g. DTC catalog titles seeded in S4) and `DO $$`
 *    blocks. Note the HTTP driver (`neon()`) cannot do this: it rejects
 *    multi-statement strings, which is why this script uses `Client`.
 *  - Each file runs inside a transaction together with its ledger INSERT, so a
 *    failure mid-file rolls back cleanly and the ledger never lies.
 *
 * Consequence: migration files are applied exactly once, so they do NOT need
 * to be idempotent. Never edit an already-applied file — add a new one.
 *
 * URL override (S3-R2 test isolation): the runner uses MIGRATION_DATABASE_URL
 * when set, falling back to DATABASE_URL for normal operation. The migration
 * test points the override at the isolated test database; real `bun run
 * migrate` uses DATABASE_URL unchanged.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@neondatabase/serverless";

const url = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set — connect a database before running migrations.",
  );
  process.exit(1);
}

const migrationsDir = path.join(import.meta.dirname, "..", "db", "migrations");
const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`No .sql migrations found in ${migrationsDir}`);
  process.exit(1);
}

const db = new Client(url);
await db.connect();

try {
  // The ledger itself must exist before we can consult it.
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const { rows } = await db.query("SELECT filename FROM schema_migrations");
  const applied = new Set(rows.map((r: { filename: string }) => r.filename));

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`= ${file} already applied — skipping`);
      continue;
    }
    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    console.log(`→ applying ${file}`);
    await db.query("BEGIN");
    try {
      await db.query(sql); // whole file as one multi-statement query
      await db.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [
        file,
      ]);
      await db.query("COMMIT");
    } catch (err) {
      await db.query("ROLLBACK");
      console.error(`  ✗ ${file} failed — rolled back, ledger untouched`);
      throw err;
    }
    console.log(`  ✓ ${file} applied and recorded`);
    ran++;
  }

  console.log(
    `Migration complete: ${ran} applied, ${files.length - ran} already up to date.`,
  );
} finally {
  await db.end();
}
