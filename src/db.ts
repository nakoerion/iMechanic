import { neon } from "@neondatabase/serverless";

/**
 * Server-only handle to the team's database (Neon serverless Postgres over HTTP).
 * The connection string comes from `DATABASE_URL`, which the owner connects via
 * the database card and which is injected into the sandbox and passed to the live
 * host on publish. Resolved lazily (per call, not at module load) so the site
 * still builds and serves before a database is connected — the error only
 * surfaces if a query actually runs without `DATABASE_URL`.
 *
 * Use it only inside a `createServerFn()` handler or an `src/routes/api/*` route
 * (never client code):
 *
 *   const getPosts = createServerFn().handler(async () => {
 *     const rows = await sql()`select id, title, created_at from posts`;
 *     // Coerce non-primitive columns (timestamps are JS Dates) to strings before
 *     // returning to the client, or React will refuse to render them:
 *     return rows.map((r) => ({ ...r, created_at: String(r.created_at) }));
 *   });
 */
/**
 * A tagged-template query function whose row shape is chosen by the caller:
 *
 *   const rows = await db<{ id: string }[]>`SELECT id FROM scans`;
 *
 * The Neon handle's own tagged-template signature carries no type parameter,
 * so without this wrapper every `db<RowType[]>` above fails to compile
 * (TS2558) and the rows collapse to `Record<string, any>`. The wrapper only
 * types the call — it forwards the tags and parameters to Neon untouched.
 * `T` still defaults to `any`, so an untyped `db\`...\`` behaves exactly as
 * before. Neon's other members (`.query`, `.unsafe`, `.transaction`) are not
 * part of this shape; nothing in the codebase used them through `sql()`.
 */
export type Sql = <T = any>(
  strings: TemplateStringsArray,
  ...params: unknown[]
) => Promise<T>;

export const sql = (): Sql => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set — connect a database (via the database card) before running queries."
    );
  }
  const query = neon(url);
  return <T = any>(strings: TemplateStringsArray, ...params: unknown[]) =>
    query(strings, ...params) as unknown as Promise<T>;
};
