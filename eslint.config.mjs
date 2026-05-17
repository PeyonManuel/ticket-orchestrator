import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Stricter-than-Next baseline.
 *
 * Type safety:
 *  - no-explicit-any: bans `any`. Use `unknown` + Zod or a narrower type instead.
 *  - consistent-type-imports: forces `import type { ... }` for types so the
 *    bundler can strip them without ambiguity.
 *  - no-unused-vars: error, allows `_prefix` for intentionally-ignored args.
 *
 * React:
 *  - exhaustive-deps: warn → error. Stale closures bite hard; if you really
 *    want to ignore a dep, do it with a per-line eslint-disable + a reason.
 *  - no-unescaped-entities: keep at error (default).
 *
 * Hygiene:
 *  - prefer-const, no-var, eqeqeq, no-console (warn so logs are intentional).
 */
const strictRules = {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/consistent-type-imports": [
    "error",
    { prefer: "type-imports", fixStyle: "inline-type-imports" },
  ],
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
  "react-hooks/exhaustive-deps": "error",
  "prefer-const": "error",
  "no-var": "error",
  eqeqeq: ["error", "always", { null: "ignore" }],
  "no-console": ["warn", { allow: ["warn", "error"] }],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: strictRules,
  },
]);

export default eslintConfig;
