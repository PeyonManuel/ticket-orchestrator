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
| DB | MongoDB native driver (`mongodb` package) | 6.x |
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
| `types.ts` | ALL board domain types — Board, Ticket, Sprint, EpicSnapshot, etc. |
| `index.ts` | Re-exports |

### `src/domain/orchestrator/` — Orchestrator domain (pure TS)

| File | Purpose |
|---|---|
| `types.ts` | EpicDraft, BrainstormTurn/Summary, BacklogProposal, TicketProposal, SprintPlan, SprintSnapshot, MemberSnapshot, DraftStore boundary, Zod schemas. Phase 4 actor I/O contracts (`PlannerInput/Output`, `PlannerChatInput/Output`). |
| `machines/orchestrator.machine.ts` | Hierarchical XState machine: `phase1Brainstorming` → `phase2Structuring` → `phase3Refining` → `phase4SprintPlanning` → `committing`/`abandoned`. Actor stubs (`analystActor`, `architectActor`, `controllerActor`, `blueprintChatActor`, `refinementChatActor`, `plannerActor`, `plannerChatActor`) injected at runtime. |
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
| `mongo.ts` | `MongoClient` connection singleton (native driver, **not** Mongoose). |
| `schemas.ts` | **Zod** validation schemas (Board, Ticket, Sprint, Comment, EpicSnapshot, etc.) — used by `repository.ts` to parse Mongo docs at the boundary. |
| `repository.ts` | All DB read/write functions — always scoped by `orgId`. Includes `commitEpicDraft` flow that creates Epic ticket + child tickets + EpicSnapshot. |
| `indexes.ts` | Compound indexes (orgId-first) |
| `loaders.ts` | DataLoader instances — comment batching (no N+1) |

### `src/infrastructure/orchestrator/`

| File | Purpose |
|---|---|
| `driftDetection.ts` | Sprint drift + velocity calculation (uses `isDone` columns). Currently parses `EpicSnapshot.planJson` — will be refactored to typed fields in Slice A.2. |
| `mockAi.ts` | Mock implementations of all orchestrator actors (`runAnalystTurn`, `runArchitectBacklog`, `runControllerRefinement`, `runBlueprintChat`, `runRefinementChat`, `runSprintPlanner`, `runPlannerChat`). Same signatures the LangGraph backend will expose. 600–1400ms simulated latency. |
| `draftStore.ts` | Apollo-backed `DraftStore` adapter — list / load / save / remove / create EpicDrafts via GQL (server stores in Mongo `epicDrafts` collection). |

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
| `modals/OrchestratorModal.tsx` | Full-height sheet hosting the orchestrator — defers to `presentation/orchestrator/OrchestratorRoot` |
| `modals/SearchModal.tsx` | Fuzzy search |
| `modals/DeleteBoardModal.tsx` | Soft-delete confirmation |
| `modals/RestoreBoardModal.tsx` | Restore from trash |
| `shared/dropdowns/SprintMultiSelect.tsx` | Sprint picker dropdown [sprint arch] |
| `shared/dropdowns/LabelDropdown.tsx` | Label picker |
| `shared/hooks/useIsAdmin.ts` | Clerk org role check |

### `src/presentation/orchestrator/` — AI Orchestrator UI

| File | Purpose |
|---|---|
| `OrchestratorRoot.tsx` | Entry shell: switches between draft picker and active session |
| `DraftPicker.tsx` | "New Epic" + resumable in-progress drafts + history (uses `GET_EPIC_DRAFTS`) |
| `OrchestratorSession.tsx` | Hosts the running machine, swaps phase panes via `AnimatePresence` |
| `useOrchestrator.ts` | Hook: instantiates machine with mock actors, debounced save (1500ms), unmount flush |
| `PhaseHeader.tsx` | Top bar: 3-dot phase progress, save/discard/close, "Saving…" indicator |
| `Phase1Brainstorm.tsx` | Chat with Analyst — bubbles, typing dots, summary card, "Continue to backlog" CTA |
| `Phase2BulkList.tsx` | Bulk-edit backlog: inline title, label dropdown, ↑↓ reorder, ✕ delete, + add. Includes Phase 2 chat with the AI about backlog structure. |
| `Phase3Wizard.tsx` | One-by-one ticket refinement + Controller risks sidebar + per-ticket refinement chat |
| `Phase4SprintPlan.tsx` | Sprint planning view — capacity overview, ticket→sprint→assignee assignments, planner chat, "Commit Epic" CTA |

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

// Org member functional role — used by orchestrator planner + capacity policies.
type OrgMemberRole = "developer" | "ux" | "tester" | "po";

// EpicSnapshot — currently a thin "drift baseline" record. Slice A.2 will refactor this into
// the rich orchestrator commit record (typed frozen 4-phase artifacts + ticketIds + boardId).
interface EpicSnapshot {
  id: string; orgId: string; epicTicketId: string;
  createdAt: string; planJson: string;  // JSON-encoded plan (legacy shape)
}

// AI Orchestrator (full types in src/domain/orchestrator/types.ts)
type OrchestratorPhase =
  | "phase1Brainstorming" | "phase2Structuring" | "phase3Refining"
  | "phase4SprintPlanning" | "committing" | "committed" | "abandoned";

interface EpicDraft {
  id: string; orgId: string; boardId: string; authorId: string;
  createdAt: string; updatedAt: string; phase: OrchestratorPhase;
  transcript: BrainstormTurn[];               // Phase 1 chat with Analyst
  blueprintTranscript: BrainstormTurn[];      // Phase 2 chat about backlog structure
  brainstormSummary: BrainstormSummary | null;
  backlog: BacklogProposal | null;
  refinementCursor: number;                   // index into backlog.tickets (Phase 3)
  sprintPlan: SprintPlan | null;              // Phase 4 output
  plannerTranscript: BrainstormTurn[];        // Phase 4 chat with planner
  planningSprints: SprintSnapshot[];          // Phase 4 frozen sprint context
  planningMembers: MemberSnapshot[];          // Phase 4 frozen member context
  lastSeenAt: string;
}

interface BrainstormTurn { id: string; role: "user" | "analyst"; text: string; createdAt: string; }
interface BrainstormSummary { summary: string; goals: string[]; outOfScope: string[]; }
interface BacklogProposal { epicTitle: string; epicDescription: string; tickets: TicketProposal[]; }
interface TicketProposal {
  id: string; hierarchyType: "story" | "task";
  title: string; oneLiner: string; description: string;
  label: ProposalLabel; acceptanceCriteria: string[];
  storyPoints: 1 | 2 | 3 | 5 | 8 | 13 | null;
  risks: string[]; refined: boolean;
  transcript: BrainstormTurn[];               // Per-ticket Phase 3 refinement chat
  // Slice A.1 additions (optional): discipline, dependencies
}

// Phase 4 types
interface SprintSnapshot { id: string; name: string; startDate: string; endDate: string; capacityPoints: number; status: "planning" | "active" | "completed"; }
interface MemberSnapshot { userId: string; fullName: string; role: OrgMemberRole; }
interface TicketAssignment { ticketId: string; sprintId: string | null; assigneeUserId: string | null; }
interface SprintPlan { assignments: TicketAssignment[]; reasoning: string; /* Slice A.1: optional overflow + bufferRule */ }
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
- **AI Orchestrator (4 phases built)** — XState machine with `phase1Brainstorming → phase2Structuring → phase3Refining → phase4SprintPlanning → committing → committed`. Mock AI actors for all phases (analyst, architect, controller, blueprint chat, refinement chat, planner, planner chat). Durable Mongo-backed drafts (`epicDrafts` collection, GQL queries/mutations), debounced auto-save (1.5s), drafts picker.
- **Commit-to-board** — `commitEpicDraft` GQL mutation + repository function exist. Creates Epic-type ticket + child tickets + `EpicSnapshot` record (currently with JSON-encoded `planJson`). Slice A.2 will refactor the snapshot to typed fields.
- **Org member roles** — `OrgMemberRole = "developer" | "ux" | "tester" | "po"` set in org settings via `setMemberRole` mutation; consumed by Phase 4 planner.

### Not Built
- **LangGraph backend integration** — mock AI actors in `mockAi.ts` will be swapped for real adapters of the same shape
- **Phase 5 Inspector** — post-commit chat over committed Epics with persistent transcript + AI memory. Plan in `ORION_PLAN.md`.
- **Capacity-aware Phase 4 slicing** — current planner produces `SprintPlan` but doesn't enforce 80% buffer, doesn't model overflow, doesn't respect dependency ordering. Slice B work.
- **E2E tests** — Playwright required per AGENTS.md, none written (orchestrator approve/reject branches especially)
- **Conflict UI for drag-and-drop** — `moveTicketToColumn` can return `ConflictError` but no UI handles it

---

## Reading Strategy for Claude

Before reading any file, ask: "Is this already in CODEBASE.md?"
- Types → check the types block above first
- File purpose → check the file map above first
- Patterns → check Architecture Patterns above first

Only read a source file when you need its **exact implementation detail** (specific function signature, resolver logic, mutation shape). Ask the user to paste the relevant section when possible.

`git diff --stat HEAD` → free, shows what changed recently.
`git diff HEAD -- <file>` → costs tokens, use only for files central to the current task.
