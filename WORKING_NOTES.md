# Working Notes for AI Assistants

Operational context accumulated during development. Read this alongside `AGENTS.md` before touching any code.

---

## How the owner works

- **Defers deliberately.** If something is marked "last" (e.g. AI orchestrator wiring), it stays last. Don't build it early or suggest building it early.
- **Wants implementation, not suggestions.** Default to writing code. Ask only when there is genuine ambiguity about direction.
- **Commits are checkpoints, not milestones.** Owner commits when a self-contained batch is stable and type-checked. Don't batch commits across unrelated concerns.
- **Reasons through architecture decisions quickly.** Present options with honest tradeoffs. When the reasoning lands, they'll switch course (e.g. Option B: Apollo data + useState UI over XState-as-data-layer).
- **Monitors warnings, not just errors.** Console warnings from Clerk, React, Apollo are taken seriously — fix them, don't dismiss them.

---

## Current architecture decisions (as of May 2026)

### Data layer
- **Apollo Client cache** is the source of truth for all board data (tickets, columns, boards, versions, labels, comments, history).
- **`useState`** owns UI state: `activeBoardId`, `selectedTicketId`, `activeModal`, `createTicketLinkSourceId`, `conflictError`.
- **XState v5** is reserved exclusively for `aiOrchestratorMachine` — the AI agent lifecycle (Analyst → Architect → Controller). Do not use XState for data operations.
- `analystWorkspaceMachine` was deliberately deleted. Do not recreate it.

### Auth + session
- Clerk `auth()` reads the session cookie server-side in the Route Handler context.
- **Session race condition**: Apollo queries must be skipped until Clerk's `orgId` is present client-side. `BoardProvider` uses `useAuth()` and `skip: !sessionReady` on `GET_BOARDS` and `GET_LABELS`. Without this, queries fire before `setActive` propagates and the server sees `orgId: null`.
- `useOrganizationList` must **only** be called when the user is confirmed signed-in. It will never resolve for unauthenticated users — always mount it in a child component that renders after `isSignedIn` is confirmed (see `OrgGuard` in `AuthGuard.tsx`).

### GraphQL
- All mutations touching tickets use optimistic concurrency: `expectedVersion` is required on `UpdateTicketInput`.
- `updateTicket` returns `UpdateTicketResult = Ticket | ConflictError`. Always inspect `__typename`.
- `ConflictError` contains `currentState` (server's Ticket), `conflictedFields`, and `message`.
- Conflict UI lives in `TicketModal` — amber banner with Overwrite / Discard buttons. `resolveConflict(strategy)` action is on `BoardActions`.
- Pagination: `tickets(boardId)` returns `TicketConnection { edges { cursor, node } }` — always extract `.edges.map(e => e.node)`.

### MongoDB
- All compound indexes lead with `orgId` — these are also valid shard keys.
- `ensureIndexes()` runs on first request and is idempotent. No migration scripts needed.
- `MONGODB_URI` must be set in `.env.local` with the real Atlas connection string. The codebase has `cluster.mongodb.net` as a placeholder.

### Deep links
- `/tickets/[ticketNumber]` is a server component that resolves the ticket and redirects to `/?board=<boardId>&modal=ticket&ticket=<ticketNumber>`.
- `selectBoard` persists the board ID to the URL via `router.replace` with `?board=`.
- `BoardProvider` honors `?board=X` as higher priority than the default first-board selection.

---

## File layout for new features

Follow the blueprint in `AGENTS.md`:
```
src/domain/<feature>/machine/*
src/domain/<feature>/types/*
src/domain/<feature>/policies/*
src/infrastructure/<feature>/*
src/presentation/<feature>/*
tests/e2e/<feature>/*.spec.ts
```

Legacy localStorage implementations are preserved in `src/_legacy/` (excluded from `tsconfig.json`). Do not import from there.

---

## Known gotchas

- **Next.js 16 `params` are Promises.** In server components, always `await params` before reading route params.
- **Apollo `result.data` is typed as `{}`** when using `useMutation` without a typed document node. Cast through `(result.data as Record<string, unknown>)?.fieldName` rather than accessing directly.
- **Clerk structural CSS warning**: avoid selectors like `[class*="cl-X"] td:nth-child(n)` — they target Clerk's internal DOM and break on Clerk updates. Use stable Clerk class names (`cl-memberCreatedAt`, etc.) only.
- **`useOrganizationList` with `infinite: true`** never sets `isLoaded: true` for unauthenticated users. Always guard before calling.
- **Turbopack (dev)**: if the dev server gets into a broken compile state, `rm -rf .next && npm run dev` fixes it.

---

## What's not built yet (as of May 2026)

- **AI orchestrator wiring** — `aiOrchestratorMachine` exists in domain but `OrchestratorModal` is a placeholder stub. This is intentionally last.
- **E2E tests** — Playwright specs are required per AGENTS.md for conflict resolution and AI approval flows but not yet written.
- **Conflict UI in non-modal flows** — `resolveConflict` is wired but only surfaced via `TicketModal`. Board drag-and-drop (`moveTicketToColumn`) can also produce a `ConflictError` which currently has no UI feedback.
