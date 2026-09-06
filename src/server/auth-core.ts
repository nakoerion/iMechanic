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

function siteOrigin(): string {
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
/* ------------------------------------------------------------------ */

/** Request a magic link. Honest `{ ok: true }` whether or not the address
 * exists. Idempotent: a still-valid unused token, or a token minted within
 * the rate window, mints and sends nothing new. */
export async function requestMagicLinkCore(
  email: string,
): Promise<{ ok: true }> {
  const existing = await db<{ token_hash: string }[]>`
    SELECT token_hash FROM login_tokens
    WHERE email = ${email}
      AND used_at IS NULL
      AND expires_at > now()
    LIMIT 1`;
  if (existing.length > 0) {
    // Earlier link still valid — do not mint, do not re-send (the raw token
    // is only stored hashed, so we cannot re-send the same link anyway).
    return { ok: true };
  }

  const recent = await db<{ n: string }[]>`
    SELECT count(*)::text AS n FROM login_tokens
    WHERE email = ${email}
      AND created_at > now() - interval '60 seconds'`;
  if (Number(recent[0]?.n ?? 0) > 0) {
    // Inside the anti-spam window — nothing new is minted or sent.
    return { ok: true };
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  // The verify surface is the /app/verify route (it is exempt from the /app
  // route guard alongside /app/signin — see app/route.tsx).
  const link = `${siteOrigin()}/app/verify?token=${encodeURIComponent(token)}`;

  await db`
    INSERT INTO login_tokens (token_hash, email, expires_at)
    VALUES (${tokenHash}, ${email}, now() + interval '15 minutes')`;

  await sendEmail({
    to: email,
    subject: "Your iMechanic sign-in link",
    html: buildMagicLinkEmail(link),
  });

  return { ok: true };
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