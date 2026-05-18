# E2E tests

Playwright specs covering the critical AI-decision paths required by `AGENTS.md`:

- `orchestrator-commit.spec.ts` — full happy path: new draft → Phases 1-4 → commit to board.
- `inspector.spec.ts` — Phase 5 chat + memory persistence over a committed Epic.
- `phase4-visualization.spec.ts` — Phase 4 CapacityPanel + per-discipline chips render; OverflowBanner asserted when triggered.
- `ai-mutation.spec.ts` — Slice Q/R: Execute / Confirm mode toggle (interactive + persistent). Full validation-splice and pending-mutation Accept/Reject flows are `test.fixme` until mock AI gains a mutation channel (or real AI is gated in via `E2E_REAL_AI=1`).
- `tool-calls.spec.ts` — Slice T tool-call smoke. Skipped by default; runs only when `E2E_REAL_AI=1` is set (requires `GOOGLE_API_KEY` and dev server started without `NEXT_PUBLIC_MOCK_AI=1`).

## One-time setup

The specs assume a Clerk-authenticated session. Auth state is persisted to
`tests/e2e/.auth/user.json` by the `setup` project and reused across spec runs.

1. Create a **test Clerk development instance** with at least one user and one
   organisation that user belongs to.
2. Export env vars before running:

   ```sh
   export E2E_CLERK_USER_USERNAME=...     # email or username of test user
   export E2E_CLERK_USER_PASSWORD=...
   export SEED_SECRET=...                 # must match server's SEED_SECRET
   ```

   Without `E2E_CLERK_USER_USERNAME` / `E2E_CLERK_USER_PASSWORD` the setup
   project skips itself; spec projects then fail fast on a missing
   `storageState` file, which is the intended signal.

3. (Optional) `E2E_BASE_URL` overrides the dev server URL (defaults to
   `http://localhost:3001`). `E2E_PORT` overrides just the port.

## Running

```sh
npm run e2e               # headless
npm run e2e:ui            # Playwright UI mode (recommended for first run)
npm run e2e -- --debug    # step-through debugger
```

Playwright will boot `npm run dev` automatically and tear it down after.

## Known gaps

- **Phase 4 "over-capacity" branch** is partially covered: `phase4-visualization.spec.ts` asserts the OverflowBanner / footer rendering when overflow occurs naturally, but the mock backlog doesn't always overflow. A `seed?forceOverflow=1` knob (one-developer team or zero upcoming sprints) would tighten the assertion from conditional to required.
- **Mock AI mutation channel.** `mockAi.runBlueprintChat` / `runRefinementChat` return `{ reply }` only — they never emit `mutations[]`. That makes the validation-splice path and the Confirm-mode Accept/Reject UI invisible to E2E. Either enhance the mocks to emit deterministic mutations on keyword triggers ("rename ticket 1 to X") or rely on real AI (`E2E_REAL_AI=1`).
- **Phase 4 back-to-refine** flow lands in Slice H+I (back-navigation modal). Add a spec there.
- **Auth setup selectors** target Clerk's default sign-in form; if the hosted UI has been heavily themed, `auth.setup.ts` may need adjustment.

## Architecture notes

- `playwright.config.ts` runs specs serially (`workers: 1`, `fullyParallel: false`)
  because the dev server shares one MongoDB and concurrent tests would race
  on board / ticket state.
- The `setup` project produces the storage state; spec projects depend on it
  via `dependencies: ["setup"]` so a missing auth file fails loudly at the
  setup boundary rather than mid-test.
