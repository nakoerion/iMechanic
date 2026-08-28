# AGENTS.md — standing rules for every session working on iMechanic

These rules are product and trust decisions, not styling preferences. They apply to
every change, every session, every contributor — human or agent. If a change would
violate one of them, the change is wrong, not the rule.

## Free tier is sacred

- Reading codes, clearing codes, plain-English code meaning and the **rules-based
  severity verdict are free forever.** Never gated, never blurred, never dimmed,
  never teased behind a paywall, never badged with a lock.
- `LockIcon` is reserved **exclusively** for genuine Pro features. It must never
  appear on free functionality, empty states for free features, or safety routing.
- When a repair is routed to a workshop for safety reasons, that card must not look
  anything like an upsell.
- No countdowns, no manufactured scarcity, no fake urgency.

## Pricing

- **No price is ever hardcoded in a component.** All prices, bands, currencies and
  market formatting come from `src/lib/market.ts`. Changing a price must never
  require touching a component.

## Honesty in data and diagnosis

- Never present simulated or demo data as real. Demo scans must be recorded as demo
  (the `scans.source` column distinguishes them) and shown as demo in the UI.
- When the AI is unavailable, say so and fall back to the deterministic rules
  engine. **Never fabricate a diagnosis.**
- Numbers reported to the owner come from Stripe or the database — never from
  projection.

## Database

- Every app table is user-scoped (`user_id` on the table, ownership enforced).
  `dtc_catalog` and `waitlist` are the **only** deliberate global exceptions.
- Migrations are **append-only** files in `db/migrations/`, applied via
  `bun run migrate`, and recorded in `schema_migrations`. Never edit or delete a
  migration that has been applied; add a new one.

## Workflow

- Branch from the up-to-date default branch, push feature branches, open a PR; the
  team lead reviews and merges (see the team's `WORKFLOW.md`).
- Secrets (`DATABASE_URL`, `ANTHROPIC_API_KEY`, any token) are never committed.
  Grep the tree before committing.
- `bun run build` and `bun run test` must pass before a PR is opened.
- Source assets that visitors must not download live in `design/`, not `public/`.
