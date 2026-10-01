/**
 * Auth server functions — Slice S2. Thin RPC stubs.
 *
 * Bundle-boundary rules (this is what keeps the client build green):
 *  - Only `createServerFn` and the pure `normaliseEmail` are imported
 *    statically here.
 *  - The implementation (`auth-core.ts`, which imports node:crypto and the
 *    server cookie helpers) is loaded with DYNAMIC imports inside each
 *    handler. The client bundle never links it.
 */
import { createServerFn } from "@tanstack/react-start";
import { normaliseEmail } from "./email-validate";

export type AuthUser = {
  id: string;
  email: string;
  country: "DE" | "GB" | "AL" | null;
};

/** Request a magic link. Honest `{ ok: true }` whether or not the address
 * exists — no enumeration.
 *
 * S10-T2: when REVIEW_ACCESS_CODE is configured AND the address is the
 * store-review address (`playreview@imechanic.app`), the answer is
 * `{ ok: true, codeRequired: true }` and no link is minted or emailed — the
 * form then shows the access-code step. With the variable unset that field is
 * never present and this behaves exactly as it did before the slice. */
export const requestMagicLink = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const email = normaliseEmail(input);
    if (!email) throw new Error("Enter a valid email address.");
    return email;
  })
  .handler(async ({ data: email }) => {
    const { requestMagicLinkCore } = await import("./auth-core");
    return requestMagicLinkCore(email);
  });

/**
 * Submit the review-only access code (S10-T2 — Google Play app access review).
 *
 * Reached only from the access-code step of /app/signin, which the browser
 * shows only after `requestMagicLink` answered `{ codeRequired: true }`.
 *
 * The answer is exactly `{ ok: true, signedIn: boolean }`. `signedIn` is true
 * only for a correct code on the reviewer address while REVIEW_ACCESS_CODE is
 * set; wrong code, wrong address, path off and rate-limited all answer `false`
 * with the same shape, and the client then renders the SAME neutral "check your
 * email" screen any other address gets. No distinct error, no status
 * difference — there is no oracle.
 *
 * The validator is deliberately lenient for the same reason: a malformed
 * address or missing code is normalised to empty input that fails neutrally,
 * rather than throwing a message only this route could produce. Real work
 * (anti-spam window, constant-time compare, reviewer user, demo seed, session)
 * all lives in `submitReviewCodeCore`.
 */
export const submitReviewCode = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { email?: unknown; code?: unknown };
    return {
      email: normaliseEmail(raw.email) ?? "",
      code: typeof raw.code === "string" ? raw.code.trim().slice(0, 256) : "",
    };
  })
  .handler(async ({ data: { email, code } }) => {
    const { submitReviewCodeCore } = await import("./auth-core");
    return submitReviewCodeCore(email, code);
  });

/** Verify a magic-link token (atomic single-use), upsert the user, create a
 * session, set the session cookie. Returns the signed-in user. */
export const verifyMagicLink = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    if (typeof input !== "object" || input === null) {
      throw new Error("This sign-in link is invalid or has expired.");
    }
    const token = (input as { token?: unknown }).token;
    if (typeof token !== "string" || token.length < 32) {
      throw new Error("This sign-in link is invalid or has expired.");
    }
    return { token };
  })
  .handler(async ({ data: { token } }) => {
    const { verifyMagicLinkCore } = await import("./auth-core");
    return verifyMagicLinkCore(token);
  });

/** Current user, or null. Callable from route guards (beforeLoad) and the
 * client. */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getCurrentUserCore } = await import("./auth-core");
    return getCurrentUserCore();
  },
);

/** Update the user's country (DE/GB/AL). Requires a valid session. */
export const updateCountry = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const country = (input as { country?: unknown }).country;
    if (country !== "DE" && country !== "GB" && country !== "AL") {
      throw new Error("Choose a supported country.");
    }
    return { country: country as "DE" | "GB" | "AL" };
  })
  .handler(async ({ data: { country } }) => {
    const { updateCountryCore } = await import("./auth-core");
    return updateCountryCore(country);
  });

/** Sign out: delete the session row and clear the cookie. The service-worker
 * cache wipe happens client-side (see src/lib/session.ts). */
export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const { signOutCore } = await import("./auth-core");
  return signOutCore();
});

/**
 * Delete the signed-in user's account and everything stored against it — slice
 * S9c (a Google Play requirement).
 *
 * The typed email arrives from the danger zone on the account screen and is
 * re-checked server-side against the session's own address inside
 * `deleteAccountCore` — the browser's comparison is convenience only. The
 * typed value is not a credential, so nothing here is trusted as one.
 *
 * Throws (and deletes nothing) when: there is no session, the typed address
 * does not match, or the Stripe cancellation of an active Pro subscription
 * fails. On success the session cookie is cleared and the client navigates to
 * /app/account-deleted.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const typedEmail = (input as { email?: unknown } | null)?.email;
    if (typeof typedEmail !== "string" || typedEmail.length === 0) {
      throw new Error("Type your email address to confirm.");
    }
    return { email: typedEmail };
  })
  .handler(async ({ data: { email } }) => {
    const { deleteAccountCore } = await import("./auth-core");
    return deleteAccountCore(email);
  });