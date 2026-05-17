# REFACTORS.md — General Refactors & Improvements

App-wide refactors, cleanups, and quality improvements that aren't tied to a
specific feature slice. Distinct from `ORION_PLAN.md` (orchestrator scope) and
`AGENTS.md` (architecture contract).

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

## Parked

### Slice U — Unit-test coverage

User-requested: unit-test absolutely every functionality.

Likely scope:
- **Domain policies** (`capacityPolicy`, `slicingPolicy`, `dependencyPolicy`) — pure functions, easiest wins.
- **Orchestrator state machine** — transitions, guards, action context. `@xstate/test` or hand-rolled drivers.
- **AI graph adapters** — stub the LLM (canned structured outputs), assert reply + mutation parsing + Zod-validation correction loop.
- **Mutation validators + apply helpers** — pure, high-value.
- **Persistence layer** — integration tests against real Mongo via Testcontainers (don't mock the DB; prior incident).
- **React leaf components** — `TicketCard`, `TicketRow`, `ProseTurn`, `RichMarkdownEditor` toolbar via React Testing Library.

Open decisions to make at slice intro:
- Vitest vs Jest (lean Vitest — faster, modern, plays well with Next).
- Coverage threshold (suggest 80% on domain + infra, none on presentation).
- CI wiring — add `npm test` to the build pipeline.

### Slice V — `noUncheckedIndexedAccess`

The audit enabled most strict TS flags but stopped short of this one. Surfaces 76 errors at ~25 sites (each `arr[0]` becomes `T | undefined`).

Real safety improvement; tedious to apply. Most sites already have a length check earlier — TS just can't see it. A few are legitimately "did I forget to handle this case?"

Lower priority than Slice U.

### Stale eslint-disable annotations

A handful of `// eslint-disable-next-line react-hooks/exhaustive-deps` comments remain (BoardContext, useOrchestrator). Each one is justified inline but worth a sweep with fresh eyes — some may be removable now that strict rules are on.
