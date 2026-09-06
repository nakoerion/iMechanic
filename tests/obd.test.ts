/**
 * ELM327 parsing, DTC validation, demo dataset, and scan-validator tests
 * (Slice S3). The first two suites are pure unit tests (no database); the
 * third exercises the server-side scan validation against the live database
 * and deletes every row it creates.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon } from "@neondatabase/serverless";
import {
  decodeDtcPair,
  encodeDtcPair,
  normaliseDtc,
  ObdError,
  parseDtcResponseText,
  parseVinResponseText,
} from "../src/lib/dtc";
import {
  DEMO_DATASET,
  DemoDriver,
  demoDatasetAsElmResponse,
} from "../src/obd/demo-simulator";

describe("normaliseDtc — user-typed code validation", () => {
  it("accepts canonical codes", () => {
    expect(normaliseDtc("P0420")).toBe("P0420");
    expect(normaliseDtc("C1234")).toBe("C1234");
    expect(normaliseDtc("B0001")).toBe("B0001");
    expect(normaliseDtc("U0100")).toBe("U0100");
  });

  it("tolerates lowercase, spaces and dashes", () => {
    expect(normaliseDtc("p0420")).toBe("P0420");
    expect(normaliseDtc("P 0420")).toBe("P0420");
    expect(normaliseDtc("P-0420")).toBe("P0420");
  });

  it("rejects anything that is not shaped like a DTC", () => {
    expect(normaliseDtc("")).toBeNull();
    expect(normaliseDtc("hello")).toBeNull();
    expect(normaliseDtc("P420")).toBeNull();
    expect(normaliseDtc("P0420X")).toBeNull();
    expect(normaliseDtc("X0420")).toBeNull();
    expect(normaliseDtc("P04G0")).toBeNull();
    expect(normaliseDtc(null)).toBeNull();
    expect(normaliseDtc(42)).toBeNull();
  });
});

describe("ELM327 byte-pair codec", () => {
  it("round-trips known codes", () => {
    // P0420: 0x04 0x20 — the classic catalyst code.
    expect(encodeDtcPair("P0420")).toEqual([0x04, 0x20]);
    expect(decodeDtcPair(0x04, 0x20)).toBe("P0420");
    for (const code of ["P0301", "C1234", "B0001", "U0100", "P0442"]) {
      const [a, b] = encodeDtcPair(code);
      expect(decodeDtcPair(a, b)).toBe(code);
    }
  });

  it("decodes the type letter from the top two bits", () => {
    expect(decodeDtcPair(0x40, 0x00)).toBe("C0000");
    expect(decodeDtcPair(0x80, 0x00)).toBe("B0000");
    expect(decodeDtcPair(0xc0, 0x00)).toBe("U0000");
  });

  it("refuses to encode a non-code", () => {
    expect(() => encodeDtcPair("NOPE")).toThrow();
    expect(() => encodeDtcPair("X0420")).toThrow();
  });
});

describe("parseDtcResponseText — mode 03/07/0A replies", () => {
  it("parses a stored-codes reply with echo + prompt", () => {
    // "43 02 04 20 03 01" = P0420 + P0301.
    const codes = parseDtcResponseText("03\r43 02 04 20 03 01\r\r>", "03");
    expect(codes).toEqual(["P0420", "P0301"]);
  });

  it("reads the response header, not the echo", () => {
    // Echo "03" must not be mistaken for mode-response byte 0x43.
    const codes = parseDtcResponseText("07\r47 01 04 42\r\r>", "07");
    expect(codes).toEqual(["P0442"]);
  });

  it("treats NO DATA as an empty result, not an error", () => {
    expect(parseDtcResponseText("0A\rNO DATA\r\r>", "0A")).toEqual([]);
  });

  it("skips 00 00 padding pairs", () => {
    const codes = parseDtcResponseText("03\r43 02 04 20 00 00\r\r>", "03");
    expect(codes).toEqual(["P0420"]);
  });

  it("throws a user-safe ObdError when the car cannot be reached", () => {
    expect(() => parseDtcResponseText("UNABLE TO CONNECT\r\r>", "03")).toThrow(
      ObdError,
    );
    expect(() => parseDtcResponseText("?\r\r>", "03")).toThrow(ObdError);
  });
});

describe("parseVinResponseText — mode 0902 reply", () => {
  it("decodes a 17-character VIN from a multi-frame reply", () => {
    // 49 02 01 + ASCII of a 17-char VIN.
    const vin = "WVWZZZ1KZ6W000001";
    const hex = [...vin]
      .map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"))
      .join(" ");
    const parsed = parseVinResponseText(`0902\r49 02 01 ${hex}\r\r>`);
    expect(parsed).toBe(vin);
  });

  it("returns null when the car reports nothing", () => {
    expect(parseVinResponseText("0902\rNO DATA\r\r>")).toBeNull();
    expect(parseVinResponseText("garbage\r\r>")).toBeNull();
  });
});

describe("demo simulator", () => {
  it("ships a small, clearly-demo dataset across all three statuses", async () => {
    expect(DEMO_DATASET.length).toBeGreaterThanOrEqual(3);
    const statuses = new Set(DEMO_DATASET.map((r) => r.status));
    expect(statuses).toEqual(new Set(["stored", "pending", "permanent"]));
    for (const row of DEMO_DATASET) {
      expect(normaliseDtc(row.code)).toBe(row.code);
    }
    const driver = new DemoDriver();
    await driver.connect();
    const result = await driver.readCodes();
    expect(result.vin).toBeTruthy();
    expect(result.codes).toHaveLength(DEMO_DATASET.length);
    await driver.disconnect();
  });

  it("clears its simulated list and restores it on reset", async () => {
    const driver = new DemoDriver();
    await driver.connect();
    await driver.clearCodes();
    expect((await driver.readCodes()).codes).toEqual([]);
    driver.reset();
    expect((await driver.readCodes()).codes).toHaveLength(DEMO_DATASET.length);
    await driver.disconnect();
  });

  it("requires connect() before reading", async () => {
    const driver = new DemoDriver();
    await expect(driver.readCodes()).rejects.toThrow();
  });

  it("renders ELM-shaped responses the parser reads back", () => {
    for (const mode of ["03", "07", "0A"] as const) {
      const expected = DEMO_DATASET.filter((r) =>
        mode === "03"
          ? r.status === "stored"
          : mode === "07"
            ? r.status === "pending"
            : r.status === "permanent",
      ).map((r) => r.code);
      expect(parseDtcResponseText(demoDatasetAsElmResponse(mode), mode)).toEqual(
        expected,
      );
    }
  });
});

describe("scan persistence validation (live database)", () => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set to run scan tests.");
  const db = neon(url);
  const tag = `s3val-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const email = `s3-validation-${tag}@test.invalid`;
  let userId: string;

  beforeAll(async () => {
    const [u] = await db.query("INSERT INTO users (email) VALUES ($1) RETURNING id", [
      email,
    ]);
    userId = u.id as string;
  });

  afterAll(async () => {
    await db.query("DELETE FROM users WHERE email = $1", [email]);
  });

  it("rejects a scan_code row whose status is outside the CHECK", async () => {
    const [s] = await db.query(
      "INSERT INTO scans (user_id, source) VALUES ($1, 'demo') RETURNING id",
      [userId],
    );
    let code: string | undefined;
    try {
      await db.query(
        "INSERT INTO scan_codes (scan_id, user_id, code, status) VALUES ($1, $2, 'P0420', 'bogus')",
        [s.id, userId],
      );
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe("23514");
    await db.query("DELETE FROM scans WHERE id = $1", [s.id]);
  });

  it("rejects a scan whose source is outside the CHECK", async () => {
    let code: string | undefined;
    try {
      await db.query("INSERT INTO scans (user_id, source) VALUES ($1, 'simulated')", [
        userId,
      ]);
    } catch (err) {
      code = (err as { code?: string }).code;
    }
    expect(code).toBe("23514");
  });

  it("accepts a vehicle-less demo scan and deletes cleanly", async () => {
    const [s] = await db.query(
      "INSERT INTO scans (user_id, vehicle_id, source) VALUES ($1, NULL, 'demo') RETURNING id",
      [userId],
    );
    expect(s.id).toBeTruthy();
    await db.query(
      "INSERT INTO scan_codes (scan_id, user_id, code, status) VALUES ($1, $2, 'P0420', 'stored')",
      [s.id, userId],
    );
    await db.query("DELETE FROM scans WHERE id = $1", [s.id]);
    const leftover = await db.query("SELECT count(*)::int AS n FROM scan_codes WHERE scan_id = $1", [
      s.id,
    ]);
    expect(Number(leftover[0].n)).toBe(0);
  });
});
