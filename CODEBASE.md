# Orion Codebase Reference

Quick-load orientation for Claude. Updated: May 2026. Verify before acting on any file:line citation.

---

## Stack

| Concern | Library | Version |
|---|---|---|
| Framework | Next.js App Router | 16.2.4 |
| Runtime | React | 19.2.4 |
| State (AI flow) | XState | 5.30 |
| State (board data) | Apollo Client | 4.1.9 |
| GQL server | graphql-yoga | 5.21 |
| Auth / multi-tenant | Clerk (orgs) | 7.2.7 |
| DB | MongoDB via Mongoose | inferred |
| Validation | Zod | 4.x |
| Animation | Framer Motion | 12.x |
| Styling | Tailwind CSS | 4.x |

Dev server: `npm run dev` → port **3001**. Build output in `.next/`.

---

## File Map

### `app/` — Next.js App Router pages

| File | Purpose |
|---|---|
| `page.tsx` | Root page → renders `ClientApp` |
| `layout.tsx` | Root layout: Clerk provider, ThemeProvider |
| `login/[[...rest]]/page.tsx` | Clerk sign-in |
| `onboarding/page.tsx` | Org onboarding |
| `tickets/[ticketNumber]/page.tsx` | Deep-link redirect → `/?board=X&modal=ticket&ticket=X` |
| `api/graphql/route.ts` | graphql-yoga endpoint |
| `api/internal/cleanup-deleted-boards/route.ts` | Cron: hard-delete soft-deleted boards after TTL |

### `src/domain/analyst/` — Domain layer (pure TS, no React/infra)

| File | Purpose |
|---|---|
| `types.ts` | ALL domain types — single source of truth for Board, Ticket, Sprint, etc. |
| `machines/aiOrchestrator.machine.ts` | XState machine: idle→researching→awaitingHumanApproval→approved\|rejected |
| `index.ts` | Re-exports |

### `src/infrastructure/graphql/`

| File | Purpose |
|---|---|
| `schema.ts` | graphql-yoga `typeDefs` — full GQL schema |
| `resolvers.ts` | Query + Mutation resolvers |
| `operations.ts` | Apollo client-side GQL documents (queries + mutations) |
| `ApolloClientProvider.tsx` | Apollo provider with Clerk auth headers |
| `loggerLink.ts` | Dev logging Apollo link |

### `src/infrastructure/persistence/`

| File | Purpose |
|---|---|
| `mongo.ts` | Mongoose connection singleton |
| `schemas.ts` | Mongoose model schemas (Board, Ticket, Sprint, Comment, etc.) |
| `repository.ts` | All DB read/write functions — always scoped by `orgId` |
| `indexes.ts` | Compound indexes (orgId-first) |
| `loaders.ts` | DataLoader instances — comment batching (no N+1) |

### `src/infrastructure/orchestrator/`

| File | Purpose |
|---|---|
| `driftDetection.ts` | Sprint drift + velocity calculation (uses `isDone` columns) |

### `src/infrastructure/observability/`

| File | Purpose |
|---|---|
| `logger.ts` | Structured pino logger, toggleable per env |

### `src/presentation/board/`

| File | Purpose |
|---|---|
| `BoardApp.tsx` | Root board component: Apollo provider, modal registration |
| `ClientApp.tsx` | Client boundary + AuthGuard/OrgGuard |
| `BoardContext.tsx` | **Split contexts**: `useBoardData()` / `useBoardActions()` — all Apollo queries + mutations here |
| `layout/MainLayout.tsx` | `[sidebar | content]` row; sidebar open/close via CSS `translateX` on the whole row |
| `layout/Sidebar.tsx` | Board list, nav |
| `layout/Topbar.tsx` | Board header — **must use `useBoardActions()` only**, never `useBoardData()` |
| `workspace/BoardWorkspaceView.tsx` | Columns + tickets, board or sprint view mode |
| `workspace/ColumnCard.tsx` | `memo()`'d column with drag+drop |
| `workspace/TicketCard.tsx` | `memo()`'d ticket card |
| `workspace/VersionPanel.tsx` | Release version panel |
| `workspace/useBoardDrag.ts` | Drag-and-drop logic |
| `workspace/ActiveSprintHeader.tsx` | Sprint goal, dates, progress bar [sprint arch] |
| `workspace/SprintViewSwitcher.tsx` | Toggle board/sprint view [sprint arch] |
| `modals/TicketModal.tsx` | Full ticket edit: fields, comments, history, conflict resolution UI |
| `modals/CreateTicketModal.tsx` | New ticket form |
| `modals/CreateSprintModal.tsx` | New sprint form [sprint arch] |
| `modals/OrchestratorModal.tsx` | AI orchestrator UI — **stub, not implemented** |
| `modals/SearchModal.tsx` | Fuzzy search |
| `modals/DeleteBoardModal.tsx` | Soft-delete confirmation |
| `modals/RestoreBoardModal.tsx` | Restore from trash |
| `shared/dropdowns/SprintMultiSelect.tsx` | Sprint picker dropdown [sprint arch] |
| `shared/dropdowns/LabelDropdown.tsx` | Label picker |
| `shared/hooks/useIsAdmin.ts` | Clerk org role check |

---

## Key Domain Types (from `src/domain/analyst/types.ts`)

```ts
interface BoardColumn {
  id: string; name: string; states: string[]; color: string; order: number;
  isDone: boolean;  // marks terminal column for velocity/drift/rollover
}

interface Board {
  id: string; orgId: string; name: string;
  columns: BoardColumn[]; members: BoardMember[];
  deletedAt?: string;  // soft-delete
}

interface Ticket {
  id: string; boardId: string; orgId: string; ticketNumber: number;
  title: string; description: string; storyPoints: number;
  status: string; priority: "low" | "medium" | "high";
  linkedTicketIds: string[]; assigneeIds: string[];
  sprintIds: string[];  // tickets can be in multiple sprints
  version: number;      // optimistic concurrency
}

interface Sprint {
  id: string; orgId: string; boardId: string;
  name: string;          // auto-generated "{boardName} N" if omitted on create
  description: string;   // free-form planning notes
  goal: string;          // one-line north-star deliverable
  startDate: string; endDate: string;
  capacityPoints: number;
  status: "planning" | "active" | "completed";
  completedPoints?: number;  // snapshot at completion, drives velocity
}

interface SprintAssignment { sprintId: string; memberId: string; allocatedPoints: number; }

// Optimistic concurrency
type UpdateTicketResult = Ticket | ConflictError;
interface ConflictError { currentState: Ticket; conflictedFields: string[]; message: string; }
```

---

## Architecture Patterns

### Multi-tenancy
Every repository function takes `orgId` as first argument. Every DB query filters by `orgId`. Every index is `orgId`-first.

### View modes
`BoardViewMode = "board" | "backlog"`.
- `"board"` — filtered kanban for the selected sprint + `ActiveSprintHeader`.
- `"backlog"` — `BacklogView`: expandable sections (one per sprint + Backlog at end), flat ticket list rows, drag between sections to reassign sprint via `setTicketSprints`.

### Context split
`BoardContext.tsx` exports two contexts:
- `useBoardData()` — board, tickets, sprints, columns, loading states
- `useBoardActions()` — mutations (createTicket, moveTicket, etc.)

**Rule:** Topbar, toolbars, layout shells → `useBoardActions()` only. Never `useBoardContext()` in hot-render components.

### Sidebar animation
CSS `transition-transform` on the `[sidebar | content]` row. Never Framer Motion `layout` on large containers.

### Optimistic concurrency
`Ticket.version` increments on every write. `updateTicket` returns `Ticket | ConflictError`. TicketModal has conflict resolution UI (amber banner, Overwrite/Discard).

### DataLoader
`loaders.ts` batches comment queries. Never N+1 in resolvers.

---

## What's Built vs Not

### Built
- Full board UI: columns, tickets, drag-and-drop
- Sprint architecture: CRUD, assignment, capacity, velocity, drift detection
- Ticket modal: edit, comments, history, conflict resolution
- Multi-tenant auth: Clerk orgs, AuthGuard, OrgGuard
- Dark/light theme, mobile layout
- Search modal, CreateTicket, CreateVersion, VersionPanel
- Deep links (`/tickets/[ticketNumber]`), URL param persistence
- Board soft-delete + restore
- Structured logging, orgId-scoped indexes

### Not Built
- **AI orchestrator wiring** — `aiOrchestrator.machine.ts` exists, `OrchestratorModal.tsx` is a stub
- **E2E tests** — Playwright required per AGENTS.md, none written
- **Conflict UI for drag-and-drop** — `moveTicketToColumn` can return `ConflictError` but no UI handles it
- **LangGraph backend integration**

---

## Reading Strategy for Claude

Before reading any file, ask: "Is this already in CODEBASE.md?"
- Types → check the types block above first
- File purpose → check the file map above first
- Patterns → check Architecture Patterns above first

Only read a source file when you need its **exact implementation detail** (specific function signature, resolver logic, mutation shape). Ask the user to paste the relevant section when possible.

`git diff --stat HEAD` → free, shows what changed recently.
`git diff HEAD -- <file>` → costs tokens, use only for files central to the current task.
