import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

/**
 * Vitest config — unit-test runner separate from Playwright E2E (`tests/e2e/`).
 *
 * Conventions:
 *  - Test files live next to the code as `*.test.ts` / `*.test.tsx`.
 *  - Domain + infrastructure layers carry an 80% coverage threshold; the
 *    presentation layer is excluded for now (component tests are tracked as
 *    follow-up in REFACTORS.md).
 */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "tests/e2e/**", "build/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Initial pass covers pure domain + mutation validation. Adapter layers
      // (AI graphs, persistence, Apollo store) need LLM/Mongo stubs to test
      // meaningfully — tracked as follow-up in REFACTORS.md.
      include: [
        "src/domain/orchestrator/policies/**",
        "src/infrastructure/orchestrator/realAi/mutationValidation.ts",
        "src/infrastructure/orchestrator/driftDetection.ts",
        "src/infrastructure/orchestrator/stripTypename.ts",
        "src/infrastructure/orchestrator/tools/registry.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/index.ts"],
      thresholds: {
        // Scoped to files we actively cover. Adapter layers + the XState
        // machine itself are tested via their pure helpers; the wiring tests
        // are tracked as follow-up work in REFACTORS.md (Refactor A.2).
        statements: 90,
        branches: 80,
        functions: 90,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
