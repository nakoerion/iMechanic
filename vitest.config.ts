import { defineConfig } from "vitest/config";

/**
 * Standalone vitest config — deliberately NOT sharing vite.config.ts, whose
 * TanStack Start plugins are irrelevant (and heavy) for tests.
 *
 * Keep concurrency low: this machine has modest memory, and the schema tests
 * talk to the live Neon database. `bun run test` also passes --maxWorkers=2.
 */
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Neon round-trips from CI-ish environments can be slow; be generous.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Schema tests share created rows within a file; run files serially.
    fileParallelism: false,
  },
});
