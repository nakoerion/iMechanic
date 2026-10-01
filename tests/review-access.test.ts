/**
 * S10-T2 — review-only access path (Google Play app access review).
 *
 * Pure orchestration, NO database, NO email, NO network: every side effect goes
 * through the injected `SignInPorts` seam in `src/server/auth-core.ts` — the same
 * pattern `tests/delete-account.test.ts` uses. That is what makes the two
 * properties that matter provable here:
 *
 *  1. OFF IS THE DEFAULT AND IS INVISIBLE. With no `REVIEW_ACCESS_CODE` the
 *     review branch cannot be entered at all: the reviewer address takes the
 *     ordinary magic-link path, the answer carries no `codeRequired` field, and
 *     an access-code submission writes NOTHING and signs nobody in.
 *  2. WHEN IT IS ON, A WRONG CODE REVEALS NOTHING. A wrong code, a wrong
 *     address and an off deployment all answer the byte-identical
 *     `{ ok: true, signedIn: false }` — no oracle, plus the anti-spam window is
 *     checked before the constant-time compare so guesses are throttled.
 *
 * The database side (the real `is_reviewer` row, the seeded `source='demo'`
 * scan, the cascade on deletion) is verified against the live database
 * separately — it cannot run here without `TEST_DATABASE_URL`, and these tests
 * must keep passing with no database at all.
 */
import { describe, expect, it } from "vitest";
import {
  REVIEWER_DEMO_VEHICLE,
  REVIEWER_EMAIL,
  isReviewerEmail,
  normaliseEmail,
  requestMagicLinkCore,
  reviewAccessCode,
  reviewAccessEnabled,
  submitReviewCodeCore,
  type AuthUser,
  type SignInPorts,
} from "../src/server/auth-core";
import { DEMO_DATASET } from "../src/obd/demo-simulator";
import { DEMO_VIN } from "../src/obd/driver";

/** A plausible review code — the tests never depend on its value being secret. */
const CODE = "s10-t2-test-access-code";
const REVIEWER: AuthUser = {
  id: "22222222-2222-4222-8222-222222222222",
  email: REVIEWER_EMAIL,
  country: "DE",
};
const OTHER_EMAIL = "driver@example.com";

type Recorded = {
  liveTokenChecks: string[];
  windowChecks: string[];
  issued: string[];
  attempts: string[];
  ensured: number;
  seeded: string[];
  sessions: string[];
  order: string[];
};

/** Ports that record every call, so "nothing happened" is assertable. */
function fakePorts(
  options: { code?: string | null; withinWindow?: boolean } = {},
): { ports: SignInPorts; recorded: Recorded } {
  const recorded: Recorded = {
    liveTokenChecks: [],
    windowChecks: [],
    issued: [],
    attempts: [],
    ensured: 0,
    seeded: [],
    sessions: [],
    order: [],
  };
  const ports: SignInPorts = {
    reviewCode: () => options.code ?? null,
    hasLiveToken: async (email) => {
      recorded.liveTokenChecks.push(email);
      return false;
    },
    withinRateWindow: async (email) => {
      recorded.windowChecks.push(email);
      return options.withinWindow ?? false;
    },
    issueMagicLink: async (email) => {
      recorded.issued.push(email);
    },
    recordAccessCodeAttempt: async (email) => {
      recorded.attempts.push(email);
    },
    ensureReviewerUser: async () => {
      recorded.ensured += 1;
      recorded.order.push("ensure");
      return REVIEWER;
    },
    seedReviewerContent: async (userId) => {
      recorded.seeded.push(userId);
      recorded.order.push("seed");
    },
    startSession: async (userId) => {
      recorded.sessions.push(userId);
      recorded.order.push("session");
    },
  };
  return { ports, recorded };
}

/* ------------------------------------------------------------------ */
/* 1. OFF BY DEFAULT — no REVIEW_ACCESS_CODE means no path at all       */
/* ------------------------------------------------------------------ */

describe("review access — OFF (REVIEW_ACCESS_CODE unset)", () => {
  it("reads null when the variable is unset, and null when it is blank", () => {
    const saved = process.env.REVIEW_ACCESS_CODE;
    try {
      delete process.env.REVIEW_ACCESS_CODE;
      expect(reviewAccessCode()).toBeNull();
      expect(reviewAccessEnabled()).toBe(false);

      // Whitespace is not a code — a stray space in Secrets is still OFF.
      process.env.REVIEW_ACCESS_CODE = "   ";
      expect(reviewAccessCode()).toBeNull();
      expect(reviewAccessEnabled()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.REVIEW_ACCESS_CODE;
      else process.env.REVIEW_ACCESS_CODE = saved;
    }
  });

  it("sends the reviewer address down the ordinary magic-link path", async () => {
    const { ports, recorded } = fakePorts({ code: null });
    const result = await requestMagicLinkCore(REVIEWER_EMAIL, ports);

    // A real link IS minted and emailed — the address is not special.
    expect(recorded.issued).toEqual([REVIEWER_EMAIL]);
    expect(result).toEqual({ ok: true });
    // The field is ABSENT, not false: the client has nothing to key on.
    expect("codeRequired" in result).toBe(false);
    // Nothing review-shaped happened.
    expect(recorded.attempts).toEqual([]);
    expect(recorded.ensured).toBe(0);
    expect(recorded.seeded).toEqual([]);
    expect(recorded.sessions).toEqual([]);
  });

  it("writes nothing and signs nobody in when a code is submitted", async () => {
    const { ports, recorded } = fakePorts({ code: null });
    const result = await submitReviewCodeCore(REVIEWER_EMAIL, CODE, ports);

    expect(result).toEqual({ ok: true, signedIn: false });
    expect(recorded.attempts).toEqual([]); // no rate-limit row either
    expect(recorded.liveTokenChecks).toEqual([]);
    expect(recorded.windowChecks).toEqual([]);
    expect(recorded.ensured).toBe(0);
    expect(recorded.seeded).toEqual([]);
    expect(recorded.sessions).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 2. ON — the code step itself                                         */
/* ------------------------------------------------------------------ */

describe("review access — ON: the access-code step", () => {
  it("asks the reviewer address for a code and mints nothing", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    const result = await requestMagicLinkCore(REVIEWER_EMAIL, ports);

    expect(result).toEqual({ ok: true, codeRequired: true });
    expect(recorded.issued).toEqual([]); // NO email, NO token row
    expect(recorded.liveTokenChecks).toEqual([]);
  });

  it("leaves every other address on the ordinary flow", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    const result = await requestMagicLinkCore(OTHER_EMAIL, ports);

    expect(result).toEqual({ ok: true });
    expect("codeRequired" in result).toBe(false);
    expect(recorded.issued).toEqual([OTHER_EMAIL]);
  });

  it("does not treat a look-alike address as the reviewer", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    for (const email of [
      "playreview@imechanic.app.evil.example",
      "playreview+1@imechanic.app",
      "notplayreview@imechanic.app",
      "",
    ]) {
      const result = await requestMagicLinkCore(email, ports);
      expect("codeRequired" in result).toBe(false);
    }
    // The reviewer address is the only one that skipped the email.
    expect(recorded.issued).toEqual([
      "playreview@imechanic.app.evil.example",
      "playreview+1@imechanic.app",
      "notplayreview@imechanic.app",
      "",
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* 3. ON — wrong codes are neutral (no oracle)                          */
/* ------------------------------------------------------------------ */

describe("review access — ON: a wrong code reveals nothing", () => {
  it("answers exactly as it answers a non-reviewer address", async () => {
    const wrong = await submitReviewCodeCore(
      REVIEWER_EMAIL,
      "not-the-code",
      fakePorts({ code: CODE }).ports,
    );
    const other = await submitReviewCodeCore(
      OTHER_EMAIL,
      "not-the-code",
      fakePorts({ code: CODE }).ports,
    );
    const off = await submitReviewCodeCore(
      REVIEWER_EMAIL,
      "not-the-code",
      fakePorts({ code: null }).ports,
    );

    expect(wrong).toEqual({ ok: true, signedIn: false });
    expect(other).toEqual(wrong);
    expect(off).toEqual(wrong);
    // Two fields, and nothing that could carry a reason.
    expect(Object.keys(wrong).sort()).toEqual(["ok", "signedIn"]);
  });

  it("does not create a user, seed content or start a session", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    await submitReviewCodeCore(REVIEWER_EMAIL, "nearly", ports);

    expect(recorded.ensured).toBe(0);
    expect(recorded.seeded).toEqual([]);
    expect(recorded.sessions).toEqual([]);
    // The attempt IS recorded (it counts against the anti-spam window) …
    expect(recorded.attempts).toEqual([REVIEWER_EMAIL]);
    // … but the wrong address did not even get that far.
    const second = fakePorts({ code: CODE });
    await submitReviewCodeCore(OTHER_EMAIL, "nearly", second.ports);
    expect(second.recorded.attempts).toEqual([]);
  });

  it("rejects empty, prefix, superset and case-shifted guesses", async () => {
    for (const guess of [
      "",
      " ",
      CODE.slice(0, 5),
      `${CODE}x`,
      CODE.toUpperCase(),
      CODE.replace(/-/g, "_"),
    ]) {
      const { ports, recorded } = fakePorts({ code: CODE });
      const result = await submitReviewCodeCore(REVIEWER_EMAIL, guess, ports);
      expect(result.signedIn).toBe(false);
      expect(recorded.sessions).toEqual([]);
    }
  });

  it("does not accept the correct code on the wrong address", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    const result = await submitReviewCodeCore(OTHER_EMAIL, CODE, ports);

    expect(result.signedIn).toBe(false);
    expect(recorded.ensured).toBe(0);
    expect(recorded.sessions).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 4. ON — the correct code signs the reviewer in                       */
/* ------------------------------------------------------------------ */

describe("review access — ON: the correct code", () => {
  it("ensures the user, seeds the demo content, then starts the session", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    const result = await submitReviewCodeCore(REVIEWER_EMAIL, CODE, ports);

    expect(result).toEqual({ ok: true, signedIn: true });
    expect(recorded.ensured).toBe(1);
    expect(recorded.seeded).toEqual([REVIEWER.id]);
    expect(recorded.sessions).toEqual([REVIEWER.id]);
    // Order is the contract: nothing is seeded or minted for a user that does
    // not exist yet, and no session outlives a failed seed.
    expect(recorded.order).toEqual(["ensure", "seed", "session"]);
    expect(recorded.attempts).toEqual([REVIEWER_EMAIL]);
  });

  it("only ever signs in the reviewer user the port returned", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    await submitReviewCodeCore(`  ${REVIEWER_EMAIL}  `, CODE, ports);

    // Leading/trailing space in the address is NOT forgiven here: the server
    // function normalises the address before this core ever sees it
    // (src/server/auth.ts), and normaliseEmail is what makes that true.
    expect(recorded.sessions).toEqual([]);
    expect(normaliseEmail(`  ${REVIEWER_EMAIL}  `)).toBe(REVIEWER_EMAIL);
  });

  it("returns nothing that echoes the configured code", async () => {
    const { ports } = fakePorts({ code: CODE });
    const result = await submitReviewCodeCore(REVIEWER_EMAIL, CODE, ports);
    expect(JSON.stringify(result)).not.toContain(CODE);
  });
});

/* ------------------------------------------------------------------ */
/* 5. ON — the existing anti-spam window throttles guesses              */
/* ------------------------------------------------------------------ */

describe("review access — ON: the anti-spam window", () => {
  it("refuses an attempt inside the window, correct code or not", async () => {
    for (const guess of [CODE, "wrong"]) {
      const { ports, recorded } = fakePorts({ code: CODE, withinWindow: true });
      const result = await submitReviewCodeCore(REVIEWER_EMAIL, guess, ports);

      expect(result).toEqual({ ok: true, signedIn: false });
      // The compare and the writes never ran — a guess flood is throttled, and
      // a throttled attempt does not extend the window.
      expect(recorded.attempts).toEqual([]);
      expect(recorded.ensured).toBe(0);
      expect(recorded.seeded).toEqual([]);
      expect(recorded.sessions).toEqual([]);
    }
  });

  it("checks the window before recording the attempt", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    await submitReviewCodeCore(REVIEWER_EMAIL, "first", ports);
    expect(recorded.windowChecks).toEqual([REVIEWER_EMAIL]);
    expect(recorded.attempts).toEqual([REVIEWER_EMAIL]);
  });
});

/* ------------------------------------------------------------------ */
/* 6. The seeded demo scan is the app's own demo car                    */
/* ------------------------------------------------------------------ */

describe("reviewer demo content", () => {
  it("uses exactly the demo simulator's dataset and VIN", () => {
    const simulator = DEMO_DATASET.map((row) => ({
      code: row.code,
      status: row.status,
    }));
    expect(REVIEWER_DEMO_VEHICLE.codes.map((row) => ({ ...row }))).toEqual(
      simulator,
    );
    expect(REVIEWER_DEMO_VEHICLE.vin).toBe(DEMO_VIN);
  });

  it("describes the demo car, never a real one", () => {
    // The demo dataset's own label is "a 2016 petrol hatchback"; the reviewer's
    // vehicle says the same thing in make/model/year rather than a real car.
    expect(REVIEWER_DEMO_VEHICLE.year).toBe(2016);
    expect(REVIEWER_DEMO_VEHICLE.make.toLowerCase()).toContain("demo");
    expect(REVIEWER_DEMO_VEHICLE.model.toLowerCase()).toContain("petrol");
  });
});

/* ------------------------------------------------------------------ */
/* 7. The ordinary magic-link flow is unchanged                         */
/* ------------------------------------------------------------------ */

describe("magic-link flow (unchanged by S10-T2)", () => {
  it("mints and sends a link exactly once for a normal address", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    const result = await requestMagicLinkCore(OTHER_EMAIL, ports);

    expect(result).toEqual({ ok: true });
    expect(recorded.issued).toEqual([OTHER_EMAIL]);
    expect(recorded.liveTokenChecks).toEqual([OTHER_EMAIL]);
    expect(recorded.windowChecks).toEqual([OTHER_EMAIL]);
  });

  it("mints nothing while an unused link is still valid", async () => {
    const { ports, recorded } = fakePorts({ code: CODE });
    const p: SignInPorts = { ...ports, hasLiveToken: async () => true };
    const result = await requestMagicLinkCore(OTHER_EMAIL, p);

    expect(result).toEqual({ ok: true });
    expect(recorded.issued).toEqual([]);
    expect(recorded.windowChecks).toEqual([]);
  });

  it("mints nothing inside the anti-spam window", async () => {
    const { ports, recorded } = fakePorts({ code: CODE, withinWindow: true });
    const result = await requestMagicLinkCore(OTHER_EMAIL, ports);

    expect(result).toEqual({ ok: true });
    expect(recorded.issued).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* 8. Address handling                                                  */
/* ------------------------------------------------------------------ */

describe("reviewer address", () => {
  it("is only itself", () => {
    expect(isReviewerEmail(REVIEWER_EMAIL)).toBe(true);
    for (const email of [
      "PlayReview@iMechanic.app",
      "playreview@imechanic.app.evil.example",
      "playreview@imechanic.co",
      "someone@imechanic.app",
      "",
    ]) {
      expect(isReviewerEmail(email)).toBe(false);
    }
  });

  it("is reached through the same normalisation as every other address", () => {
    // The client and the server function both normalise first, so the mixed
    // case a human types lands on the one stored form.
    expect(normaliseEmail("  PlayReview@IMechanic.App ")).toBe(REVIEWER_EMAIL);
  });
});
