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
 * exists — no enumeration. */
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