/**
 * Auth unit tests (Slice S2) — pure helpers only, no database, no browser.
 * The DB-backed flows (verify atomics, expiry) are covered end-to-end in the
 * browser flow documented in APP_NOTES.md; these pin the cryptographic and
 * validation invariants that the DB layer depends on.
 */
import { describe, expect, it } from "vitest";
import {
  generateToken,
  hashToken,
  normaliseEmail,
  tokensEqual,
} from "../src/server/auth-core";

describe("generateToken", () => {
  it("produces 64 hex chars (32 random bytes), unique per call", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("hashToken round-trip", () => {
  it("hashes stably and never equals the raw token", () => {
    const token = generateToken();
    const h1 = hashToken(token);
    const h2 = hashToken(token);
    expect(h1).toBe(h2);
    expect(h1).not.toBe(token);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different tokens hash differently", () => {
    expect(hashToken(generateToken())).not.toBe(hashToken(generateToken()));
  });
});

describe("tokensEqual", () => {
  it("is true for identical raw tokens and false otherwise", () => {
    const token = generateToken();
    expect(tokensEqual(token, token)).toBe(true);
    expect(tokensEqual(token, generateToken())).toBe(false);
    expect(tokensEqual(token, token.slice(0, -1) + "0")).toBe(false);
  });
});

describe("normaliseEmail", () => {
  it("trims, lowercases and accepts a normal address", () => {
    expect(normaliseEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("rejects malformed input", () => {
    expect(normaliseEmail(null)).toBeNull();
    expect(normaliseEmail(undefined)).toBeNull();
    expect(normaliseEmail(42)).toBeNull();
    expect(normaliseEmail("")).toBeNull();
    expect(normaliseEmail("not-an-email")).toBeNull();
    expect(normaliseEmail("a@b")).toBeNull();
    expect(normaliseEmail("a@b.")).toBeNull();
  });
});