/**
 * Live-database schema constraint tests (S1.1 — QA defects D4, D5, D11).
 *
 * These run against the real Neon database in DATABASE_URL. All rows they
 * create carry a unique @test.invalid email and are deleted in afterAll via
 * the users cascade — the same path GDPR erasure uses.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set to run schema tests.");
const db = neon(url);

const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
let userA: string; // owns the vehicle/scan/diagnosis
let userB: string; // the attacker in cross-user tests
let vehicleA: string;
let scanA: string;
let diagnosisA: string;

/** Awaits `p` and returns the Postgres error code it rejects with. */
async function pgErrorCode(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

const FK_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
const NOT_NULL_VIOLATION = "23502";

beforeAll(async () => {
  const [a] = await db.query(
    "INSERT INTO users (email, country) VALUES ($1, 'DE') RETURNING id",
    [`schema-test-a-${tag}@test.invalid`],
  );
  const [b] = await db.query(
    "INSERT INTO users (email, country) VALUES ($1, 'GB') RETURNING id",
    [`schema-test-b-${tag}@test.invalid`],
  );
  userA = a.id;
  userB = b.id;
  const [v] = await db.query(
    "INSERT INTO vehicles (user_id, make, model) VALUES ($1, 'VW', 'Golf') RETURNING id",
    [userA],
  );
  vehicleA = v.id;
  const [s] = await db.query(
    "INSERT INTO scans (user_id, vehicle_id, source) VALUES ($1, $2, 'demo') RETURNING id",
    [userA, vehicleA],
  );
  scanA = s.id;
  const [d] = await db.query(
    `INSERT INTO diagnoses (scan_id, user_id, verdict, source)
     VALUES ($1, $2, 'drive_on', 'rules') RETURNING id`,
    [scanA, userA],
  );
  diagnosisA = d.id;
});

afterAll(async () => {
  // The users cascade must clean up everything the tests created.
  await db.query("DELETE FROM users WHERE email LIKE $1", [
    `schema-test-%-${tag}@test.invalid`,
  ]);
});

describe("D4/D5 — cross-user attach is physically rejected", () => {
  it("rejects a scan pointing at another user's vehicle", async () => {
    const code = await pgErrorCode(
      db.query(
        "INSERT INTO scans (user_id, vehicle_id, source) VALUES ($1, $2, 'manual')",
        [userB, vehicleA],
      ),
    );
    expect(code).toBe(FK_VIOLATION);
  });

  it("rejects a scan_code pointing at another user's scan", async () => {
    const code = await pgErrorCode(
      db.query(
        "INSERT INTO scan_codes (scan_id, user_id, code, status) VALUES ($1, $2, 'P0300', 'stored')",
        [scanA, userB],
      ),
    );
    expect(code).toBe(FK_VIOLATION);
  });

  it("rejects a diagnosis pointing at another user's scan", async () => {
    const code = await pgErrorCode(
      db.query(
        `INSERT INTO diagnoses (scan_id, user_id, verdict, source)
         VALUES ($1, $2, 'drive_on', 'rules')`,
        [scanA, userB],
      ),
    );
    expect(code).toBe(FK_VIOLATION);
  });

  it("rejects a repair_job pointing at another user's diagnosis", async () => {
    const code = await pgErrorCode(
      db.query(
        "INSERT INTO repair_jobs (user_id, diagnosis_id, state) VALUES ($1, $2, 'planned')",
        [userB, diagnosisA],
      ),
    );
    expect(code).toBe(FK_VIOLATION);
  });

  it("still accepts a same-user attach (the constraint is not over-tight)", async () => {
    const rows = await db.query(
      "INSERT INTO scans (user_id, vehicle_id, source) VALUES ($1, $2, 'manual') RETURNING id",
      [userA, vehicleA],
    );
    expect(rows[0].id).toBeTruthy();
  });
});

describe("D11 — CHECK constraints reject bad values", () => {
  it("rejects an unknown country on users", async () => {
    const code = await pgErrorCode(
      db.query("INSERT INTO users (email, country) VALUES ($1, 'XX')", [
        `schema-test-xx-${tag}@test.invalid`,
      ]),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  it("rejects an unknown severity_default on dtc_catalog", async () => {
    const code = await pgErrorCode(
      db.query(
        "INSERT INTO dtc_catalog (code, title, severity_default) VALUES ('X9999', 'test', 'catastrophic')",
      ),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  it("rejects a confidence above 100 on diagnoses", async () => {
    const code = await pgErrorCode(
      db.query(
        `INSERT INTO diagnoses (scan_id, user_id, verdict, source, confidence)
         VALUES ($1, $2, 'drive_on', 'rules', 150)`,
        [scanA, userA],
      ),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });

  it("rejects an unknown currency on diagnoses", async () => {
    const code = await pgErrorCode(
      db.query(
        `INSERT INTO diagnoses (scan_id, user_id, verdict, source, currency)
         VALUES ($1, $2, 'drive_on', 'rules', 'USD')`,
        [scanA, userA],
      ),
    );
    expect(code).toBe(CHECK_VIOLATION);
  });
});

describe("D11 — dropped defaults force every caller to state the value", () => {
  it("rejects a scan that does not state its source", async () => {
    const code = await pgErrorCode(
      db.query("INSERT INTO scans (user_id) VALUES ($1)", [userA]),
    );
    expect(code).toBe(NOT_NULL_VIOLATION);
  });

  it("rejects a diagnosis that does not state verdict/source", async () => {
    const code = await pgErrorCode(
      db.query("INSERT INTO diagnoses (scan_id, user_id) VALUES ($1, $2)", [
        scanA,
        userA,
      ]),
    );
    expect(code).toBe(NOT_NULL_VIOLATION);
  });
});
