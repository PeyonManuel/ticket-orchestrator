# REFACTORS.md — General Refactors & Improvements

App-wide refactors, cleanups, and quality improvements that aren't tied to a
specific feature slice. Distinct from `ORION_PLAN.md` (orchestrator scope, uses
Slice A/B/C…) and `AGENTS.md` (architecture contract).

Items here are numbered **Refactor A/B/C…** to keep the namespaces separate.

---

## Completed

### Codebase audit — type safety, perf, dead code (May 2026)

- Closed AI-boundary Zod validation gap on `runPlannerChat` + `runInspectorTurn`.
- Eliminated `state.value as Record<string, unknown>` casts in `OrchestratorSession` (use `state.matches()` instead).
- `memo()` on `TicketRow` so editing one row doesn't re-render the whole backlog.
- setTimeout leaks fixed in `TicketModal`, `Phase4SprintPlan`.
- `useIsMobile` rewritten with `useSyncExternalStore` (React 19 idiom).
- Unused imports + dead code cleanup in 5 files.
- Modal form-init refactored: outer wrapper switches on open/closed, inner mounts fresh — eliminates "sync on open" setState-in-effect across `CreateSprintModal`, `CreateTicketModal`, `EditSprintModal`.

### Stricter TypeScript + ESLint (May 2026)

TypeScript flags enabled in addition to `strict: true`:
- `noUnusedLocals`, `noUnusedParameters`
- `noFallthroughCasesInSwitch`
- `noImplicitOverride`, `noImplicitReturns`
- `forceConsistentCasingInFileNames`

ESLint additions on top of `eslint-config-next/typescript`:
- `@typescript-eslint/no-explicit-any: error`
- `@typescript-eslint/consistent-type-imports: error` (inline-type-imports)
- `@typescript-eslint/no-unused-vars: error` (with `_` prefix escape)
- `react-hooks/exhaustive-deps: error`
- `prefer-const`, `no-var`, `eqeqeq`, `no-console: warn`

Result: 0 ESLint errors, 2 intentional warnings.

---

## In progress

### Refactor A — Unit-test coverage

User-requested: unit-test absolutely every functionality.

**A.1 — Pure-function baseline (shipped).** Vitest runner, coverage thresholds enforced on scoped files. 116 tests across 8 spec files. Each tested file at ≥94% statement coverage:

| File | Tests | Stmts |
|---|---|---|
| `domain/orchestrator/policies/dependencyPolicy.ts` | 13 | 97.5% |
| `domain/orchestrator/policies/capacityPolicy.ts` | 19 | 100% |
| `domain/orchestrator/policies/slicingPolicy.ts` | 16 | 98.1% |
| `domain/orchestrator/machines/orchestrator.machine.ts` (apply helpers) | 29 | n/a (file-level coverage tracked separately) |
| `infrastructure/orchestrator/realAi/mutationValidation.ts` | 14 | 94.7% |
| `infrastructure/orchestrator/driftDetection.ts` | 11 | 100% |
| `infrastructure/orchestrator/stripTypename.ts` | 9 | 100% |
| `infrastructure/orchestrator/tools/registry.ts` | 5 | 100% |

Runner: **Vitest** (`npm test`, `npm run test:watch`, `npm run test:coverage`).
Conventions: `*.test.ts` colocated with source, fixture factories at top of each spec, tests assert behavior — not implementation.

**A.2 — Wiring tests (parked).** Targets that need integration scaffolding before they're worth writing:

- **AI graph adapters** (`realAi/*.ts`) — need a `BaseChatModel` stub that returns canned tool-calls + structured outputs. Worth doing because the agent-loop + structured-output split is the most subtle code path. ~1 day.
- **Orchestrator XState machine** (transitions, guards, action context) — `@xstate/test` or hand-rolled drivers. The pure helpers (`applyBlueprintMutation` etc.) are already tested; this would cover phase transitions and event handling.
- **Persistence layer** (`infrastructure/persistence/repository.ts`) — Testcontainers-Mongo, real driver. ~half day to wire, then mostly straightforward CRUD coverage.
- **GraphQL resolvers** — once the persistence harness exists, resolvers test as `repo + auth + zod` happy paths.
- **React leaf components** (`TicketCard`, `TicketRow`, `ProseTurn`, `RichMarkdownEditor` toolbar) — React Testing Library. Lower-value than the layers above; defer until logic coverage is complete.

CI: `npm test` is plain `vitest run`; ready to add to a CI pipeline once one exists.

## Parked

### Refactor B — `noUncheckedIndexedAccess`

The audit enabled most strict TS flags but stopped short of this one. Surfaces 76 errors at ~25 sites (each `arr[0]` becomes `T | undefined`).

Real safety improvement; tedious to apply. Most sites already have a length check earlier — TS just can't see it. A few are legitimately "did I forget to handle this case?"

Lower priority than Refactor A.

### Stale eslint-disable annotations

A handful of `// eslint-disable-next-line react-hooks/exhaustive-deps` comments remain (BoardContext, useOrchestrator). Each one is justified inline but worth a sweep with fresh eyes — some may be removable now that strict rules are on.
