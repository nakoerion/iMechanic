/**
 * Auth server implementation — Slice S2.
 *
 * IMPORTANT — module-boundary contract: this module is side-effect-free and
 * must ONLY be imported from inside `createServerFn` handler/validator bodies
 * (or unit tests). It carries Node builtins (`node:crypto`) and server-only
 * cookie helpers (`@tanstack/react-start/server`), so if it ever ends up in
 * the client bundle the build breaks. Keep every import of it inside a
 * server function's `.handler()` — TanStack Start tree-shakes handler
 * dependencies out of the client build (proven by `db.ts`/neon).
 *
 * Security posture:
 *  - Tokens are 32 random bytes; we persist SHA-256(token) and hand the raw
 *    token to the user exactly once. The DB never holds a usable credential.
 *  - Magic-link reuse is defeated atomically: `UPDATE ... WHERE used_at IS
 *    NULL AND expires_at > now()` and the row count decides.
 *  - Sessions live 30 days with the same token-hash storage; the HttpOnly/
 *    Secure/SameSite=Lax cookie carries the raw session token.
 *  - Sign-in never reveals whether an address exists, and re-requesting a
 *    link within the token TTL or the rate window mints/sends nothing new.
 */

import {
  deleteCookie,
  getCookie,
  getRequestUrl,
  setCookie,
} from "@tanstack/react-start/server";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "../db";
import { sendEmail } from "./email";

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export const SESSION_COOKIE = "imechanic.session";
export const LOGIN_TOKEN_TTL_MINUTES = 15;
export const SESSION_TTL_DAYS = 30;
export const RATE_LIMIT_SECONDS = 60;

/**
 * The store-review account's address (slice S10-T2) — the human-readable
 * marker of the review-only path. Nothing else in the app is allowed to be
 * special-cased on an address.
 */
export const REVIEWER_EMAIL = "playreview@imechanic.app";

/* ------------------------------------------------------------------ */
/* Pure helpers (exported for unit tests)                              */
/* ------------------------------------------------------------------ */

/** 32 random bytes → hex. */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hex of a raw token — the only form that ever touches storage. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time comparison of two raw tokens. */
export function tokensEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Trim + lowercase + shape check. Returns null when invalid. */
export function normaliseEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return null;
  return email;
}

/* ------------------------------------------------------------------ */
/* Review-only access path — slice S10-T2 (Google Play app review)     */
/* ------------------------------------------------------------------ */

/**
 * The review access code, or null when the review-only path is OFF.
 *
 * OFF is the normal operating state and the default: with `REVIEW_ACCESS_CODE`
 * unset (or blank) no sign-in request can take the review branch, no reviewer
 * user can be created, no access-code attempt is ever recorded, and
 * /app/signin never renders an "Access code" field — the server's answer
 * carries no field for the client to key on. A clean checkout behaves exactly
 * as it did before this slice existed.
 *
 * `REVIEW_ACCESS_CODE` must be ROTATED OR UNSET whenever a store review is not
 * in progress (see APP_NOTES.md).
 */
export function reviewAccessCode(): string | null {
  const code = process.env.REVIEW_ACCESS_CODE?.trim();
  return code ? code : null;
}

/** Is the review-only path configured in this process? */
export function reviewAccessEnabled(): boolean {
  return reviewAccessCode() !== null;
}

/** Is this (already normalised) address the store-review address? */
export function isReviewerEmail(email: string): boolean {
  return email === REVIEWER_EMAIL;
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

const db = sql();

export type AuthUser = {
  id: string;
  email: string;
  country: "DE" | "GB" | "AL" | null;
};

/**
 * The public origin for magic-link URLs.
 *
 * Priority (QA defect D2 — an internal preview host must never reach an email):
 *  1. PUBLIC_ORIGIN env override, when set (explicit domain, wins over everything).
 *  2. PUBLIC_SITE_DOMAIN env override — same intent, host-only, from the owning
 *     environment which sets it. "localhost" is treated as unset.
 *  3. The incoming request URL *without* x-forwarded-host: the reverse proxy
 *     masks the Host header, so the real value here is that a ctonew.app host
 *     (sandbox / published label domains) proves the public host.
 *  4. Fallback to the two known environment domains — and this is also the
 *     safety net for the live deployment in case the platform stops passing a
 *     usable host.
 * Deliberately NEVER used: getRequestUrl x-forwarded-host, which the platform
 * sets to an internal `*.preview.bl.run` sandbox host that must not appear in
 * any email.
 */
function publicOriginFallbacks(): string[] {
  return [
    "https://6e1923cb2eb061d84c9c1a0cc9cbfefb-dev.ctonew.app",
    "https://6e1923cb2eb061d84c9c1a0cc9cbfefb.ctonew.app",
  ];
}

export function siteOrigin(): string {
  const override = process.env.PUBLIC_ORIGIN?.trim().replace(/\/+$/, "");
  if (override) return override.startsWith("http") ? override : `https://${override}`;

  const domain = process.env.PUBLIC_SITE_DOMAIN?.trim().replace(/\/+$/, "");
  if (domain && domain !== "localhost" && !domain.includes(":")) {
    return `https://${domain}`;
  }

  if (publicOriginFallbacks().some((fb) => fb.includes("ctonew.app"))) {
    try {
      // No x-forwarded-host: only the true proxy-facing host survives, so a
      // public ctonew.app host is authoritative. Internal `*.preview.bl.run`
      // hosts never pass this filter.
      const url = getRequestUrl({ xForwardedHost: false }).origin;
      if (
        /^https:\/\/([a-z0-9-]+\.)?ctonew\.app$/.test(url) ||
        url.includes("ctonew.app")
      ) {
        return url;
      }
    } catch {
      /* fall through to the known-good list below */
    }
  }

  return publicOriginFallbacks()[0];
}

function buildMagicLinkEmail(link: string): string {
  const escaped = link.replaceAll("&", "&amp;").replaceAll("<", "&lt;");
  return (
    `<p>Sign in to iMechanic with this link. It is valid for 15 minutes:</p>` +
    `<p><a href="${escaped}">${escaped}</a></p>` +
    `<p>If you didn't ask for this, you can safely ignore this email.</p>`
  );
}

function rowToUser(row: {
  id: string;
  email: string;
  country: string | null;
}): AuthUser {
  const country =
    row.country === "DE" || row.country === "GB" || row.country === "AL"
      ? row.country
      : null;
  return { id: row.id, email: row.email, country };
}

function currentSessionToken(): string | undefined {
  return getCookie(SESSION_COOKIE);
}

function setSessionCookie(rawToken: string): void {
  setCookie(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

function clearSessionCookie(): void {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}

/** Resolve the user behind the session cookie, or null. */
async function resolveCurrentUser(): Promise<AuthUser | null> {
  const rawToken = currentSessionToken();
  if (!rawToken) return null;
  const tokenHash = hashToken(rawToken);
  const rows = await db<{ id: string; email: string; country: string | null }[]>`
    SELECT u.id, u.email, u.country
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.expires_at > now()`;
  if (rows.length === 0) return null;
  return rowToUser(rows[0]);
}

/* ------------------------------------------------------------------ */
/* Core operations (validated inputs only)                             */
/* Sign-in (S10-T2): the magic-link request and the review-only         */
/* access-code submission, both behind the SignInPorts seam below.      */
/* ------------------------------------------------------------------ */

/**
 * Every side effect a sign-in needs, as an explicit seam — the injection
 * pattern `DeleteAccountPorts` already uses for account deletion. The real
 * ones are built by `defaultSignInPorts()`; unit tests pass their own, so both
 * the untouched magic-link flow and the review-only branch are provable with
 * no database, no mail provider and no network.
 */
export type SignInPorts = {
  /** The configured review access code, or null when the path is OFF. */
  reviewCode: () => string | null;
  /** A still-valid, unused magic link already exists for this address. */
  hasLiveToken: (email: string) => Promise<boolean>;
  /** A login_tokens row was written inside the anti-spam window. */
  withinRateWindow: (email: string) => Promise<boolean>;
  /** Mint a magic link: persist its hash and send the email. */
  issueMagicLink: (email: string) => Promise<void>;
  /** Record one access-code attempt into the SAME anti-spam window. */
  recordAccessCodeAttempt: (email: string) => Promise<void>;
  /** Create the reviewer user if absent; enforce country + is_reviewer. */
  ensureReviewerUser: () => Promise<AuthUser>;
  /** Seed the reviewer's demo vehicle + demo scan (idempotent). */
  seedReviewerContent: (userId: string) => Promise<void>;
  /** Create a session row for the user and set the session cookie. */
  startSession: (userId: string) => Promise<void>;
};

/** The answer /app/signin keys on. `codeRequired` is ABSENT — never `false` —
 * in every other case, so an off-state deployment reveals nothing extra. */
export type MagicLinkRequest = { ok: true; codeRequired?: true };

/**
 * Request a sign-in. Honest `{ ok: true }` whether or not the address exists,
 * and idempotent: a still-valid unused token, or a row minted within the rate
 * window, mints and sends nothing new.
 *
 * S10-T2 — review-only branch: when (and only when) `REVIEW_ACCESS_CODE` is
 * configured AND the address is the store-review address, the answer is
 * `{ ok: true, codeRequired: true }` and NOTHING is minted or emailed. With
 * the code unset this branch cannot be entered at all and the behaviour is
 * byte-for-byte the pre-S10-T2 behaviour.
 */
export async function requestMagicLinkCore(
  email: string,
  ports: SignInPorts = defaultSignInPorts(),
): Promise<MagicLinkRequest> {
  if (ports.reviewCode() !== null && isReviewerEmail(email)) {
    return { ok: true, codeRequired: true };
  }

  if (await ports.hasLiveToken(email)) {
    // Earlier link still valid — do not mint, do not re-send (the raw token
    // is only stored hashed, so we cannot re-send the same link anyway).
    return { ok: true };
  }

  if (await ports.withinRateWindow(email)) {
    // Inside the anti-spam window — nothing new is minted or sent.
    return { ok: true };
  }

  await ports.issueMagicLink(email);
  return { ok: true };
}

/** What the access-code form gets back. Deliberately two fields and no more:
 * the answer for a wrong code is byte-identical to the answer for a
 * non-reviewer address or an off deployment — there is no oracle. */
export type ReviewCodeResult = { ok: true; signedIn: boolean };

/**
 * Submit the review-only access code (S10-T2 — Google Play app access review).
 *
 * The write path, in order, and why it is this order:
 *  1. review access OFF, or the address is not the reviewer address → the same
 *     neutral answer, no session, and NOTHING is written or recorded. This is
 *     what keeps "this address is special" unlearnable from a failed attempt.
 *  2. the SAME anti-spam window `requestMagicLinkCore` uses
 *     (`RATE_LIMIT_SECONDS`) → at most one attempt per minute. Checked BEFORE
 *     the comparison, so a guess flood is throttled rather than answered.
 *  3. the attempt is recorded (still before the comparison), so every guess
 *     counts against the window — successful or not.
 *  4. constant-time compare against the configured code (`tokensEqual`).
 *     A wrong code returns the neutral answer; the caller renders exactly the
 *     copy it would render for any other address.
 *  5. only then: the reviewer user (country DE, `is_reviewer`) and its demo
 *     content are ensured, and a real session is minted.
 */
export async function submitReviewCodeCore(
  email: string,
  code: string,
  ports: SignInPorts = defaultSignInPorts(),
): Promise<ReviewCodeResult> {
  const expected = ports.reviewCode();
  if (expected === null || !isReviewerEmail(email)) {
    return { ok: true, signedIn: false };
  }

  if (await ports.withinRateWindow(email)) {
    return { ok: true, signedIn: false };
  }
  await ports.recordAccessCodeAttempt(email);

  if (!tokensEqual(code, expected)) {
    return { ok: true, signedIn: false };
  }

  const user = await ports.ensureReviewerUser();
  await ports.seedReviewerContent(user.id);
  await ports.startSession(user.id);
  return { ok: true, signedIn: true };
}

/**
 * The reviewer's demo car — a deliberate MIRROR of the app's own demo dataset
 * (`DEMO_DATASET` in `src/obd/demo-simulator.ts`, `DEMO_VIN` in
 * `src/obd/driver.ts`).
 *
 * Those two modules are client-side only by contract (the driver touches
 * browser APIs), so a server module may not import them. The values are copied
 * here rather than invented, and `tests/review-access.test.ts` fails the build
 * if they ever drift apart — so the reviewer sees the same demo car the app's
 * own "Run demo scan" button produces, and the seeded scan is stored with
 * `source: 'demo'` and badged as demo everywhere (AGENTS.md).
 */
export const REVIEWER_DEMO_VEHICLE = {
  make: "Demo",
  model: "Petrol hatchback",
  year: 2016,
  vin: "IMD3M0HATCH16X0001",
  codes: [
    { code: "P0420", status: "stored" },
    { code: "P0171", status: "stored" },
    { code: "P0301", status: "pending" },
    { code: "P0442", status: "permanent" },
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Default sign-in ports — real database, real email, real cookie       */
/* ------------------------------------------------------------------ */

/** `RATE_LIMIT_SECONDS` as a Postgres interval literal. */
function rateWindowInterval(): string {
  return `${RATE_LIMIT_SECONDS} seconds`;
}

/** A still-valid, unused magic link for this address? */
async function hasLiveLoginToken(email: string): Promise<boolean> {
  const rows = await db<{ token_hash: string }[]>`
    SELECT token_hash FROM login_tokens
    WHERE email = ${email}
      AND used_at IS NULL
      AND expires_at > now()
    LIMIT 1`;
  return rows.length > 0;
}

/** Any login_tokens row for this address inside the anti-spam window? */
async function withinLoginRateWindow(email: string): Promise<boolean> {
  const rows = await db<{ n: string }[]>`
    SELECT count(*)::text AS n FROM login_tokens
    WHERE email = ${email}
      AND created_at > now() - ${rateWindowInterval()}::interval`;
  return Number(rows[0]?.n ?? 0) > 0;
}

/** Mint a magic link: persist the hash, email the raw token. */
async function issueMagicLinkFor(email: string): Promise<void> {
  const token = generateToken();
  // The verify surface is the /app/verify route (it is exempt from the /app
  // route guard alongside /app/signin — see app/route.tsx).
  const link = `${siteOrigin()}/app/verify?token=${encodeURIComponent(token)}`;

  await db`
    INSERT INTO login_tokens (token_hash, email, expires_at)
    VALUES (${hashToken(token)}, ${email}, now() + ${`${LOGIN_TOKEN_TTL_MINUTES} minutes`}::interval)`;

  await sendEmail({
    to: email,
    subject: "Your iMechanic sign-in link",
    html: buildMagicLinkEmail(link),
  });
}

/**
 * Record one access-code attempt. It is written into `login_tokens` — the very
 * table the magic-link anti-spam window counts — so both sign-in paths share
 * ONE limiter instead of two that can drift apart.
 *
 * The row can never be redeemed as a sign-in link: its `expires_at` is already
 * past (so `verifyMagicLinkCore`, which requires `expires_at > now()`, refuses
 * it) and it hashes a token that is thrown away.
 */
async function recordAccessCodeAttemptFor(email: string): Promise<void> {
  await db`
    INSERT INTO login_tokens (token_hash, email, expires_at)
    VALUES (${hashToken(generateToken())}, ${email}, now())`;
}

/**
 * The reviewer user: created on first use, repaired on every later use.
 *
 * `ON CONFLICT DO UPDATE` (not `DO NOTHING`) so the row is guaranteed to end
 * up with `country = 'DE'` and `is_reviewer = true` even if a stray account for
 * that address was created some other way. No email, no subscription row, no
 * Pro entitlement is ever invented for this account.
 */
async function ensureReviewerUserRow(): Promise<AuthUser> {
  const rows = await db<{ id: string; email: string; country: string | null }[]>`
    INSERT INTO users (email, country, is_reviewer)
    VALUES (${REVIEWER_EMAIL}, 'DE', true)
    ON CONFLICT (email) DO UPDATE
      SET country = 'DE', is_reviewer = true
    RETURNING id, email, country`;
  return rowToUser(rows[0]!);
}

/**
 * The reviewer's demo content: ONE vehicle and ONE demo scan.
 *
 * Idempotent by content, not by attempt: it seeds only while the reviewer holds
 * no scan at all, so signing in again never duplicates anything — and a
 * reviewer who cleared or deleted their only scan gets it back rather than
 * landing on an empty app.
 *
 * The scan goes through `saveScanCore` with `source: 'demo'` — the same path the
 * app's own demo button takes — so it is persisted as demo, gets the normal
 * rules verdict and cost bands, and is badge-labelled demo in every screen.
 * (`scans-core` is imported dynamically, the established server→server pattern
 * that keeps this module's static graph unchanged.)
 */
async function seedReviewerContent(userId: string): Promise<void> {
  const scans = await db<{ n: string }[]>`
    SELECT count(*)::text AS n FROM scans WHERE user_id = ${userId}`;
  if (Number(scans[0]?.n ?? 0) > 0) return;

  const { createVehicleCore, saveScanCore } = await import("./scans-core");

  const vehicles = await db<{ id: string }[]>`
    SELECT id FROM vehicles
    WHERE user_id = ${userId}
    ORDER BY created_at ASC
    LIMIT 1`;
  const vehicleId =
    vehicles[0]?.id ??
    (
      await createVehicleCore(userId, {
        make: REVIEWER_DEMO_VEHICLE.make,
        model: REVIEWER_DEMO_VEHICLE.model,
        year: REVIEWER_DEMO_VEHICLE.year,
      })
    ).id;

  await saveScanCore(userId, {
    source: "demo",
    vehicleId,
    vin: REVIEWER_DEMO_VEHICLE.vin,
    codes: REVIEWER_DEMO_VEHICLE.codes.map((entry) => ({ ...entry })),
  });
}

/** Mint a session for a known user id and set the session cookie. */
async function startSessionFor(userId: string): Promise<void> {
  const sessionToken = generateToken();
  await db`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(sessionToken)}, ${userId}, now() + ${`${SESSION_TTL_DAYS} days`}::interval)`;
  setSessionCookie(sessionToken);
}

/** The production ports: real database, real email, real cookie. */
export function defaultSignInPorts(): SignInPorts {
  return {
    reviewCode: reviewAccessCode,
    hasLiveToken: hasLiveLoginToken,
    withinRateWindow: withinLoginRateWindow,
    issueMagicLink: issueMagicLinkFor,
    recordAccessCodeAttempt: recordAccessCodeAttemptFor,
    ensureReviewerUser: ensureReviewerUserRow,
    seedReviewerContent,
    startSession: startSessionFor,
  };
}

/** Verify a magic-link token (atomic single-use), upsert the user, create a
 * session, set the session cookie. Returns the signed-in user. */
export async function verifyMagicLinkCore(token: string): Promise<{
  user: AuthUser;
}> {
  const tokenHash = hashToken(token);

  const updated = await db<{ email: string }[]>`
    UPDATE login_tokens SET used_at = now()
    WHERE token_hash = ${tokenHash}
      AND used_at IS NULL
      AND expires_at > now()
    RETURNING email`;
  if (updated.length === 0) {
    throw new Error("This sign-in link is invalid or has expired.");
  }
  const email = updated[0].email;

  await db`
    INSERT INTO users (email) VALUES (${email})
    ON CONFLICT (email) DO NOTHING`;
  const users = await db<{ id: string; email: string; country: string | null }[]>`
    SELECT id, email, country FROM users WHERE email = ${email}`;
  const user = users[0];

  const sessionToken = generateToken();
  await db`
    INSERT INTO sessions (token_hash, user_id, expires_at)
    VALUES (${hashToken(sessionToken)}, ${user.id}, now() + interval '30 days')`;

  setSessionCookie(sessionToken);

  return { user: rowToUser(user) };
}

/** Current user, or null. Never throws for a missing/invalid session. */
export async function getCurrentUserCore(): Promise<AuthUser | null> {
  return resolveCurrentUser();
}

/** Update the user's country. Requires a valid session. */
export async function updateCountryCore(
  country: "DE" | "GB" | "AL",
): Promise<{ country: "DE" | "GB" | "AL" }> {
  const user = await resolveCurrentUser();
  if (!user) throw new Error("Sign in to change your country.");
  await db`UPDATE users SET country = ${country} WHERE id = ${user.id}`;
  return { country };
}

/** Sign out: delete the session row and clear the cookie. */
export async function signOutCore(): Promise<{ ok: true }> {
  const rawToken = currentSessionToken();
  if (rawToken) {
    await db`DELETE FROM sessions WHERE token_hash = ${hashToken(rawToken)}`;
  }
  clearSessionCookie();
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Account deletion — slice S9c (Google Play requirement)              */
/* ------------------------------------------------------------------ */

/**
 * Everything in Stripe a deletion has to act on before any row is removed.
 *
 * `stripeSubscriptionIds` holds only subscriptions that can still bill
 * (the terminal statuses `canceled` / `incomplete_expired` are filtered out by
 * the reader, because cancelling them again would be a no-op against Stripe).
 * `stripeCustomerId` is kept even when no subscription id is known: Stripe may
 * hold a subscription our webhook never wrote down, and the customer id is the
 * only way to find it. Either field may be null.
 */
export type DeleteAccountStripeRefs = {
  stripeSubscriptionIds: string[];
  stripeCustomerId: string | null;
};

/** What a completed deletion removed. Counts only, never a row's content. */
export type DeleteAccountSummary = {
  email: string;
  stripeSubscriptionIds: string[];
  waitlistRows: number;
  loginTokens: number;
};

/**
 * The side effects of a deletion, as an explicit seam. The real ones are built
 * by `defaultDeleteAccountPorts()`; unit tests pass their own so the
 * orchestration (order, aborts, re-check) is provable with no database, no
 * Stripe key and no network — the same injection pattern `runAiDiagnosis`
 * uses for `fetchImpl`.
 *
 * Order is the contract, not an implementation detail: Stripe first, the
 * user row LAST. Every step before the user-row delete is reversible or empty;
 * the cascade is the point of no return.
 */
export type DeleteAccountPorts = {
  /** The signed-in user, or null. */
  currentUser: () => Promise<AuthUser | null>;
  /** Stripe handles on the user's rows (subscriptions + customer id). */
  stripeRefsFor: (userId: string) => Promise<DeleteAccountStripeRefs>;
  /**
   * Cancel every billable Stripe subscription for these refs, IMMEDIATELY
   * (not at period end). Must THROW when any cancellation genuinely failed —
   * the caller then deletes nothing.
   */
  cancelStripeSubscription: (refs: DeleteAccountStripeRefs) => Promise<void>;
  /** Remove the user's global rows (waitlist, login_tokens) and the user row. */
  purgeAccount: (
    userId: string,
    email: string,
  ) => Promise<{ waitlistRows: number; loginTokens: number }>;
  /** Clear the session cookie on the response. */
  clearSessionCookie: () => void;
};

/** Statuses where Stripe can still charge. Everything else is terminal. */
const BILLABLE_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "incomplete",
] as const;

/** A Stripe object that is already gone cannot be charged and is not a failure. */
function isMissingStripeResource(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: unknown }).code === "resource_missing"
  );
}

/**
 * Cancel every billable subscription for the user, immediately.
 *
 * Real Stripe implementation of the `cancelStripeSubscription` port. The SDK is
 * imported DYNAMICALLY so `auth-core.ts` keeps its static graph (node:crypto +
 * the cookie helpers) and stays importable from a plain unit test.
 *
 * Three honest failure modes, all of which must abort the deletion rather than
 * let the row disappear while a subscription keeps charging:
 *  - no Stripe key configured while a subscription exists → `stripeClient()`
 *    throws;
 *  - the network/API call fails → rethrown;
 *  - an unknown code → rethrown.
 * A `resource_missing` error is NOT a failure: Stripe has already forgotten the
 * subscription, so there is nothing left to charge.
 */
async function cancelStripeForAccount(
  refs: DeleteAccountStripeRefs,
): Promise<void> {
  const { stripeClient } = await import("./stripe");
  const stripe = stripeClient();

  const ids = new Set(refs.stripeSubscriptionIds);

  // The customer is the belt-and-braces route: a subscription that exists in
  // Stripe but never reached our table would otherwise keep billing.
  if (refs.stripeCustomerId) {
    const list = await stripe.subscriptions.list({
      customer: refs.stripeCustomerId,
      status: "all",
      limit: 100,
    });
    for (const sub of list.data) {
      if ((BILLABLE_SUBSCRIPTION_STATUSES as readonly string[]).includes(sub.status)) {
        ids.add(sub.id);
      }
    }
  }

  for (const id of ids) {
    try {
      // `cancel` (immediate) — never `update({ cancel_at_period_end: true })`,
      // which would leave a charge pending after the account is gone.
      await stripe.subscriptions.cancel(id);
    } catch (error) {
      if (isMissingStripeResource(error)) continue;
      throw error;
    }
  }
}

/**
 * Remove the user's rows: the two GLOBAL tables that hold the email address,
 * then the `users` row itself, whose ON DELETE CASCADE removes sessions,
 * vehicles, scans, scan_codes, diagnoses, repair_steps, repair_jobs,
 * repair_job_steps and subscriptions (verified against db/migrations/001_init
 * and 002_s1_1_integrity).
 *
 * `login_tokens` is the one table the cascade does NOT reach: it is keyed by
 * email and has no `user_id` column at all, so it must be deleted explicitly —
 * otherwise a magic-link row holding the deleted address would survive forever.
 * `waitlist` is the other deliberate global exception (marketing signups).
 * `stripe_events` is deliberately untouched: it stores only Stripe's own event
 * ids and a timestamp, no personal data.
 *
 * The user row goes last so that a failure in either global-table delete leaves
 * the account intact and retryable rather than half-erased.
 */
async function purgeAccountData(
  userId: string,
  email: string,
): Promise<{ waitlistRows: number; loginTokens: number }> {
  const loginTokens = await db<{ token_hash: string }[]>`
    DELETE FROM login_tokens WHERE email = ${email} RETURNING token_hash`;
  const waitlistRows = await db<{ email: string }[]>`
    DELETE FROM waitlist WHERE email = ${email} RETURNING email`;
  await db`DELETE FROM users WHERE id = ${userId}`;
  return { waitlistRows: waitlistRows.length, loginTokens: loginTokens.length };
}

/** Read the Stripe handles worth cancelling for this user. Never guesses. */
async function stripeRefsForUser(
  userId: string,
): Promise<DeleteAccountStripeRefs> {
  const rows = await db<{ stripe_customer_id: string | null }[]>`
    SELECT stripe_customer_id FROM users WHERE id = ${userId} LIMIT 1`;
  const subs = await db<{ stripe_subscription_id: string | null }[]>`
    SELECT stripe_subscription_id FROM subscriptions
    WHERE user_id = ${userId}
      AND stripe_subscription_id IS NOT NULL
      AND status IN ('trialing','active','past_due','incomplete')`;
  return {
    stripeSubscriptionIds: subs
      .map((row) => row.stripe_subscription_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
    stripeCustomerId: rows[0]?.stripe_customer_id ?? null,
  };
}

/** The production ports: real database, real Stripe, real cookie. */
export function defaultDeleteAccountPorts(): DeleteAccountPorts {
  return {
    currentUser: () => resolveCurrentUser(),
    stripeRefsFor: stripeRefsForUser,
    cancelStripeSubscription: cancelStripeForAccount,
    purgeAccount: purgeAccountData,
    clearSessionCookie,
  };
}

/**
 * Delete the signed-in user's account and everything stored against it.
 *
 * The typed email is re-checked HERE, against the session's own address, no
 * matter what the client already validated — the browser's check is a
 * convenience, this one is the rule.
 *
 * Sequence, and why it is this sequence:
 *  1. require a session, and require the typed address to match it exactly
 *     (after the same trim+lowercase normalisation every other email path uses;
 *     addresses are stored lowercase, so a typed "User@Example.com" must not
 *     behave differently from "user@example.com");
 *  2. cancel every billable Stripe subscription IMMEDIATELY. A failure here
 *     ABORTS the whole thing with an honest error and deletes NOTHING — a user
 *     must never end up with no account and a subscription still charging;
 *  3. remove the waitlist row and the magic-link rows for that address;
 *  4. delete the `users` row and let the ON DELETE CASCADE take the rest;
 *  5. clear the session cookie.
 */
export async function deleteAccountCore(
  typedEmail: unknown,
  ports: DeleteAccountPorts = defaultDeleteAccountPorts(),
): Promise<DeleteAccountSummary> {
  const user = await ports.currentUser();
  if (!user) throw new Error("Sign in to delete your account.");

  const typed = normaliseEmail(typedEmail);
  if (!typed || typed !== normaliseEmail(user.email)) {
    throw new Error(
      "That email address does not match the account you are signed in with. Nothing was deleted.",
    );
  }

  const refs = await ports.stripeRefsFor(user.id);
  if (refs.stripeSubscriptionIds.length > 0 || refs.stripeCustomerId) {
    try {
      await ports.cancelStripeSubscription(refs);
    } catch (error) {
      const detail =
        error instanceof Error && error.message
          ? ` Stripe reported: ${error.message.slice(0, 200)}`
          : "";
      throw new Error(
        "Your Pro subscription could not be cancelled, so your account was NOT deleted and nothing has been removed." +
          detail,
      );
    }
  }

  const removed = await ports.purgeAccount(user.id, user.email);
  ports.clearSessionCookie();

  return {
    email: user.email,
    stripeSubscriptionIds: refs.stripeSubscriptionIds,
    waitlistRows: removed.waitlistRows,
    loginTokens: removed.loginTokens,
  };
}