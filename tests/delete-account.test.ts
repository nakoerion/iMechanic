/**
 * S9c — account deletion unit tests.
 *
 * Pure orchestration only: NO database, NO Stripe key, NO network. Every side
 * effect goes through the injected `DeleteAccountPorts` seam
 * (`src/server/auth-core.ts`), so these tests pin the decisions that must never
 * be guessed:
 *
 *  - the typed email is re-checked SERVER-SIDE against the session address;
 *  - a billable subscription is cancelled BEFORE anything is deleted, with the
 *    ids that belong to the SESSION user (never an id from the request);
 *  - a failed Stripe cancel aborts the whole thing and deletes NOTHING;
 *  - a free user (no subscription) needs no Stripe call at all;
 *  - the session cookie is cleared, and only on success.
 *
 * The database side (the real cascade, the two global tables) is exercised
 * separately against a real database; it cannot run here without
 * `TEST_DATABASE_URL`, and these tests must keep passing with no database.
 */
import { describe, expect, it, vi } from "vitest";
import {
  deleteAccountCore,
  type AuthUser,
  type DeleteAccountPorts,
  type DeleteAccountStripeRefs,
} from "../src/server/auth-core";

const USER: AuthUser = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "owner@example.com",
  country: "DE",
};

type Recorded = {
  refs: DeleteAccountStripeRefs[];
  purged: Array<{ userId: string; email: string }>;
  cookieCleared: number;
};

/** Ports with spies; `overrides` lets a test make one step fail. */
function ports(
  overrides: Partial<DeleteAccountPorts> = {},
): { ports: DeleteAccountPorts; recorded: Recorded } {
  const recorded: Recorded = { refs: [], purged: [], cookieCleared: 0 };
  const base: DeleteAccountPorts = {
    currentUser: async () => USER,
    stripeRefsFor: async () => ({
      stripeSubscriptionIds: [],
      stripeCustomerId: null,
    }),
    cancelStripeSubscription: async (refs) => {
      recorded.refs.push(refs);
    },
    purgeAccount: async (userId, email) => {
      recorded.purged.push({ userId, email });
      return { waitlistRows: 1, loginTokens: 2 };
    },
    clearSessionCookie: () => {
      recorded.cookieCleared += 1;
    },
  };
  return { ports: { ...base, ...overrides }, recorded };
}

const SUB_ID = "sub_1QaSandboxTestOnly";
const CUSTOMER_ID = "cus_1QaSandboxTestOnly";

/** Ports for a user with one billable subscription. */
function proPorts(overrides: Partial<DeleteAccountPorts> = {}) {
  return ports({
    stripeRefsFor: async (userId) => {
      // The refs are read from the DB, keyed by the USER ID — never by anything
      // the browser sent. Assert that here so the contract cannot drift.
      expect(userId).toBe(USER.id);
      return {
        stripeSubscriptionIds: [SUB_ID],
        stripeCustomerId: CUSTOMER_ID,
      };
    },
    ...overrides,
  });
}

describe("deleteAccountCore — happy path", () => {
  it("removes the account and clears the session cookie", async () => {
    const { ports: p, recorded } = ports();
    const result = await deleteAccountCore(USER.email, p);

    expect(recorded.purged).toEqual([
      { userId: USER.id, email: USER.email },
    ]);
    expect(recorded.cookieCleared).toBe(1);
    expect(result).toEqual({
      email: USER.email,
      stripeSubscriptionIds: [],
      waitlistRows: 1,
      loginTokens: 2,
    });
  });

  it("cancels the subscription first, with the ids read for the session user", async () => {
    const { ports: p, recorded } = proPorts();
    const result = await deleteAccountCore(USER.email, p);

    expect(recorded.refs).toEqual([
      { stripeSubscriptionIds: [SUB_ID], stripeCustomerId: CUSTOMER_ID },
    ]);
    expect(recorded.purged).toHaveLength(1);
    expect(recorded.cookieCleared).toBe(1);
    expect(result.stripeSubscriptionIds).toEqual([SUB_ID]);
  });

  it("cancels BEFORE deleting anything (order is the contract)", async () => {
    const order: string[] = [];
    const { ports: p } = proPorts({
      cancelStripeSubscription: async () => {
        order.push("stripe");
      },
      purgeAccount: async () => {
        order.push("purge");
        return { waitlistRows: 0, loginTokens: 0 };
      },
    });
    await deleteAccountCore(USER.email, p);
    expect(order).toEqual(["stripe", "purge"]);
  });

  it("needs no Stripe call at all for a free user", async () => {
    const cancel = vi.fn(async () => undefined);
    const { ports: p, recorded } = ports({ cancelStripeSubscription: cancel });
    await deleteAccountCore(USER.email, p);

    expect(cancel).not.toHaveBeenCalled();
    expect(recorded.purged).toHaveLength(1);
  });

  it("accepts a typed address differing only in case or surrounding space", async () => {
    const { ports: p, recorded } = ports();
    await deleteAccountCore("  Owner@Example.COM  ", p);
    expect(recorded.purged).toHaveLength(1);
  });
});

describe("deleteAccountCore — Stripe cancellation fails", () => {
  it("aborts with an honest error and deletes NOTHING", async () => {
    const { ports: p, recorded } = proPorts({
      cancelStripeSubscription: async () => {
        throw new Error("card declined while cancelling");
      },
    });

    await expect(deleteAccountCore(USER.email, p)).rejects.toThrow(
      /NOT deleted/,
    );
    expect(recorded.purged).toEqual([]);
    expect(recorded.cookieCleared).toBe(0);
  });

  it("still aborts when only a customer id is known (no subscription id)", async () => {
    const { ports: p, recorded } = ports({
      stripeRefsFor: async () => ({
        stripeSubscriptionIds: [],
        stripeCustomerId: CUSTOMER_ID,
      }),
      cancelStripeSubscription: async () => {
        throw new Error("Stripe is unreachable");
      },
    });

    await expect(deleteAccountCore(USER.email, p)).rejects.toThrow(
      /NOT deleted/,
    );
    expect(recorded.purged).toEqual([]);
  });

  it("reports the underlying reason so the error is actionable", async () => {
    const { ports: p } = proPorts({
      cancelStripeSubscription: async () => {
        throw new Error("No such subscription: sub_x");
      },
    });
    await expect(deleteAccountCore(USER.email, p)).rejects.toThrow(
      /No such subscription: sub_x/,
    );
  });
});

describe("deleteAccountCore — the server re-checks the typed email", () => {
  it("rejects a wrong address and touches nothing", async () => {
    const wrong = vi.fn(async () => undefined);
    const { ports: p, recorded } = proPorts({ cancelStripeSubscription: wrong });

    await expect(
      deleteAccountCore("someone-else@example.com", p),
    ).rejects.toThrow(/does not match/);
    expect(wrong).not.toHaveBeenCalled();
    expect(recorded.purged).toEqual([]);
    expect(recorded.cookieCleared).toBe(0);
  });

  it("rejects missing, malformed and empty confirmations", async () => {
    const { ports: p, recorded } = ports();
    for (const bad of [undefined, null, "", "   ", 42, "not-an-email", "a@b"]) {
      await expect(deleteAccountCore(bad, p)).rejects.toThrow(/does not match/);
    }
    expect(recorded.purged).toEqual([]);
  });

  it("does not accept a valid-looking address that is merely similar", async () => {
    const { ports: p, recorded } = ports();
    await expect(
      deleteAccountCore("owner+alias@example.com", p),
    ).rejects.toThrow(/does not match/);
    expect(recorded.purged).toEqual([]);
  });
});

describe("deleteAccountCore — no session", () => {
  it("rejects an unauthenticated caller and touches nothing", async () => {
    const stripe = vi.fn(async () => undefined);
    const { ports: p, recorded } = ports({
      currentUser: async () => null,
      cancelStripeSubscription: stripe,
    });

    await expect(deleteAccountCore(USER.email, p)).rejects.toThrow(
      /Sign in to delete your account/,
    );
    expect(stripe).not.toHaveBeenCalled();
    expect(recorded.purged).toEqual([]);
    expect(recorded.cookieCleared).toBe(0);
  });
});
