/**
 * Public legal pages (slice S9b) — the ONE place the owner-fillable
 * placeholders and the cross-links live.
 *
 * Why a module and not strings inside the three routes: Google Play requires a
 * public account-deletion URL, and the same entity name / address / contact
 * address appears on all three pages. If a value is typed into three files it
 * will drift, and a legal page that contradicts another one is worse than no
 * page at all. Change a placeholder here and all three pages change together.
 *
 * The values are deliberately *VISIBLE placeholders*, never invented values.
 * We do not know the owner's legal entity, registered address or support
 * address, and guessing them would put a false statement on a page the public
 * (and Google) reads. They render through `Placeholder` in
 * `components/legal/legal-page.tsx`, so they are unmistakable in the page and
 * greppable in the repo: `grep -rn '{{' src/routes src/lib/legal.ts`.
 */

export const LEGAL_PLACEHOLDERS = {
  /** The registered company/sole-trader name operating iMechanic. */
  LEGAL_ENTITY_NAME: "{{LEGAL_ENTITY_NAME}}",
  /** The registered address of that entity. */
  LEGAL_ENTITY_ADDRESS: "{{LEGAL_ENTITY_ADDRESS}}",
  /** Support/privacy mailbox the public writes to for any request. */
  CONTACT_EMAIL: "{{CONTACT_EMAIL}}",
  /** Date the owner last revised the three pages (e.g. 2026-10-01). */
  LAST_UPDATED: "{{LAST_UPDATED}}",
  /** Country/state whose law governs the Terms of Use. */
  LEGAL_JURISDICTION: "{{LEGAL_JURISDICTION}}",
} as const;

export const CONTACT_EMAIL = LEGAL_PLACEHOLDERS.CONTACT_EMAIL;

/** `mailto:` for a subject-tagged request (deletion, access, correction…). */
export function contactMailto(subject: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}

/** Shown at the top of every page — "Last updated: {{LAST_UPDATED}}". */
export const LAST_UPDATED_LABEL = "Last updated";

/** The three pages, in the order they are linked everywhere. */
export const LEGAL_PAGES = [
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of use" },
  { href: "/delete-account", label: "Delete your account" },
] as const;
