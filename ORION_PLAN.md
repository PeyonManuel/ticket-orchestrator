# ORION_PLAN.md — AI Orchestrator Master Blueprint

> Source of truth for the 4-phase + post-commit Inspector orchestrator. Updated incrementally as slices land.
> Last updated: 2026-05-14.

---

## 1. Mission

Build a state-managed AI factory that turns a PO's high-level vision into a capacity-planned, technically detailed Epic. Five collaborating personas, one continuous workflow, durable across sessions, auditable, human-approved at every material decision.

---

## 2. Status quo (May 2026)

| Layer          | Built                                                                                                                                                                                                                                                                                                                                                            | Gap                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Domain machine | `phase1Brainstorming → … → committed` + Inspector machine. Phase 4 sub-states. Back-navigation (Slice H). REDRAFT_BACKLOG (Slice P). AI-as-actor mutation events + `aiTouchedTicketIds` ephemeral context (Slice Q). RETRY transitions fixed to invoke states (Slice R).                                                                                          | —                                                                                                                            |
| Domain types   | All above + rich `EpicSnapshot`, `TicketLink`, `InspectorTranscript`, `EpicMemory`, `TeamMemberCapacity`, `overflow`/`bufferRule` on `SprintPlan`, `ProposalLabel = "ux"\|"developer"\|"po"\|"qa"`, `ProposalDependency` (Slice N), `BlueprintMutation`/`RefinementMutation` discriminated unions (Slice Q).                                                  | —                                                                                                                            |
| Infrastructure | All actors (mock + real LangChain/Gemini, LM Studio fallback), `capacityProvider`, `inspectorMemoryStore`, `inspectorContextProvider`, `draftStore`, `llm.ts`, `realAi/` graphs, `rag/` (epic + ticket embeddings, cosine store), `tools/` (registry + `findSimilarEpics` + `findSimilarTickets`), `ai.ts` adapter. Chat graphs emit `mutations[]` (Slice Q) and splice correction notes on validation failure (Slice R). GQL `ChatReplyOutput` now carries `mutationsJson` (R wire-fix). | —                                                                                                                            |
| Presentation   | All 5 phase panes + `Phase5Inspector`, `DraftPicker`, `BackNavigationModal`, `useInspector`, `DependencyGraphView` (Slice N), chat textareas accept input during AI think (Slice P), AI mutation mode toggle + pulse + ChatGPT-style AI prose (Slice Q). PhaseHeader "← Back" replaces destructive Abandon (Slice R).                                                                                          | —                                                                                                                            |
| E2E            | Playwright bootstrapped; `orchestrator-commit.spec.ts` + `inspector.spec.ts` cover approve happy paths.                                                                                                                                                                                                                                                          | Over-capacity branch; Slice Q/R AI-mutation specs                                                                            |

---

## 3. Phase mapping (spec → code)

| Spec phase     | Persona              | Current state name     | Status                                                                                                                                                                                  |
| -------------- | -------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Analyst      | Strategic Consultant | `phase1Brainstorming`  | Built. RAG hook deferred to backend slice.                                                                                                                                              |
| 2 Drafter      | Technical Planner    | `phase2Structuring`    | Built. Add `discipline` tag to proposals.                                                                                                                                               |
| 3 Jira Master  | QA/Documentation     | `phase3Refining`       | Built. Add full typed dependency model.                                                                                                                                                 |
| 4 Scrum Master | Team Protector       | `phase4SprintPlanning` | **Built (basic).** Planner actor + chat exist, produce `SprintPlan`. **Augment** with capacity policy (80% buffer per discipline), overflow/slicing concept, dependency-aware ordering. |
| 5 Inspector    | Living Memory        | (new)                  | **New machine**, entered when opening a committed Epic.                                                                                                                                 |

Phase 5 is fully net-new. Phases 1–4 need targeted enrichments, not rewrites — Phase 4 in particular is built but capacity-naive.

---

## 4. Target architecture

### 4.1 Domain layer (`src/domain/orchestrator/`)

```
machines/
  orchestrator.machine.ts     [AUGMENT] feed capacity into existing planner actor input;
                                        no new states, just richer guards + actor I/O
  inspector.machine.ts        [NEW]     post-commit chat over snapshot + live ticket state
policies/
  capacityPolicy.ts           [NEW]     80% buffer rule, per-discipline availability
  slicingPolicy.ts            [NEW]     fit-first, slide-rest sprint allocation, overflow producer
  dependencyPolicy.ts         [NEW]     cycle detection on `blockedBy`, topological order
types.ts                      [EXTEND]  discipline + ProposalDependency on TicketProposal,
                                        overflow + bufferRule on SprintPlan,
                                        TicketLink, InspectorTranscript, EpicMemory,
                                        rich EpicSnapshot (refactored from analyst/types.ts in A.2)
```

### 4.2 Infrastructure layer (`src/infrastructure/orchestrator/`)

```
mockAi.ts                     [EXTEND] runScrumMasterPlanning, runInspectorTurn mocks — ✓ done
capacityProvider.ts           [DONE]   runtime per-discipline capacity from member velocity history
inspectorContextProvider.ts   [DONE]   bundles snapshot + live tickets + drift + transcript + memories
inspectorMemoryStore.ts       [DONE]   Apollo-backed InspectorStore boundary (transcript + memories)
llm.ts                        [DONE]   LangChain Gemini factory + bindOrionTools helper
realAi/                       [DONE]   per-actor LangChain graphs (analyst, architect, controller, etc.)
rag/                          [DONE]   embeddings + vector store (gemini-embedding-001, in-process cosine)
tools/                        [DONE]   OrionTool registry, toolsForPhase, findSimilarEpics
ai.ts                         [DONE]   public adapter routing mock ↔ real actors via NEXT_PUBLIC_MOCK_AI
(snapshotStore.ts / commitAdapter.ts — not created; commitEpicDraft in repository.ts handles atomic write)
```

### 4.3 Presentation layer (`src/presentation/orchestrator/`)

```
Phase4ScrumMaster.tsx         [NEW]    capacity panel, slice preview, approve/revise CTA
Phase5Inspector.tsx           [NEW]    chat over committed epic + ticket diff view
DraftPicker.tsx               [EDIT]   add committed-Epic list section; click → Inspector
OrchestratorRoot.tsx          [EDIT]   route to Inspector when opened on committed epic
```

### 4.4 GraphQL + persistence

```
schema.ts                     EpicSnapshot, EpicMemory, InspectorTranscript types
                              + queries (getSnapshot, listCommittedEpics, getInspectorThread)
                              + mutations (commitEpic, appendInspectorTurn, saveEpicMemory)
resolvers.ts                  CRUD scoped by orgId
schemas.ts                    EpicSnapshot, EpicMemory, InspectorTranscript Zod schemas (native driver — no Mongoose)
```

---

## 5. State machine evolution

### 5.1 Current

```
idle → phase1Brainstorming → phase2Structuring → phase3Refining → phase4SprintPlanning → committing → committed
                                                                                                    ↘ abandoned

phase4SprintPlanning sub-states: generatingPlan → reviewingPlan ↔ awaitingPlannerReply
```

### 5.2 Target enrichments

Phase 4 is augmented in place — the existing sub-machine stays; we add capacity-awareness as **guarded transitions** and **policy-driven actor inputs**, not new states:

```
idle
  → phase1Brainstorming               (unchanged)
  → phase2Structuring                 (unchanged + discipline tag on proposals)
  → phase3Refining                    (unchanged + dependencies on proposals)
  → phase4SprintPlanning              (existing — augmented)
       ├── generatingPlan             (planner actor input now includes per-discipline capacity from capacityPolicy)
       ├── reviewingPlan              (PO can approve, request revision, or override placements; reviews overflow explanation)
       └── awaitingPlannerReply       (chat with planner — same as today)
  → committing                        (existing — commitEpicDraft writes tickets + rich EpicSnapshot)
  → committed
       └── (separate) inspector machine — see 5.3
  → abandoned
```

### 5.3 Inspector machine (Phase 5, separate)

```
idle → loadingContext → ready
                          ├── chatting       (PO ↔ Inspector turn loop; transcript persisted)
                          └── reflecting     (Inspector calls saveInsight tool when something
                                              meaningful surfaces; writes EpicMemory record)
```

Inspector is **not** nested in the orchestrator machine — it's a sibling state owner. Lifecycle is decoupled: entered any time after commit, possibly months later. Read-only over tickets; the only writes are append-only `InspectorTranscript` turns and `EpicMemory` insights.

---

## 6. Data contracts (high-level — full TS in slice A)

> **`EpicDraft` (existing, unchanged):** mutable single doc per Epic, auto-saved every 1.5s during phases 1–4. After commit, transitions to `phase: "committed"` and becomes effectively read-only — the snapshot supersedes it as Phase 5's source of truth. Draft and snapshot coexist; the draft is the historical working state that produced the snapshot.

### 6.1 `EpicSnapshot` (REFACTOR existing — Slice A.2)

Existing shape (in `src/domain/analyst/types.ts`): `{ id, orgId, epicTicketId, createdAt, planJson: string }`. Used by `driftDetection.ts` and `commitEpicDraft`.

Target shape (one per Epic, immutable):

- `id`, `orgId`, `boardId` (NEW), `epicTicketId`, `draftId` (NEW)
- `createdAt`, `createdBy` (NEW)
- **Frozen 4-phase artifacts (NEW typed fields, replacing `planJson`):** `transcript`, `blueprintTranscript`, `brainstormSummary`, `backlog`, `plannerTranscript`, `sprintPlan`, `planningSprints`, `planningMembers`
- `ticketIds: string[]` (NEW) — back-refs to live `Ticket` records created from this Epic

No versioning, no parent lineage. One snapshot per Epic, written once at Phase 4 commit, never mutated. `driftDetection.ts` updated to read typed fields. `commitEpicDraft` resolver updated to populate typed fields instead of JSON-stringifying.

### 6.2 `TeamMemberCapacity` (computed at runtime, not stored)

- `memberId`, `fullName`
- `role: OrgMemberRole` — single discipline; capacity matching is direct equality
- `pointsPerSprint: number` — average completed SP across last N sprints; falls back to `DEFAULT_VELOCITY_BY_ROLE` when no history
- `isDefaultVelocity: boolean` — surfaces in planner reasoning so PO knows when estimate is a guess

Computed by `capacityProvider.ts`. Not PO-editable. Cold-start resolved (§12): fixed defaults `developer: 8 / ux: 5 / tester: 5 / po: 3`.

### 6.3 `SprintPlan` extension (existing type — additive Slice A.1)

Existing shape: `{ assignments: TicketAssignment[], reasoning: string }`.

Add **optional** fields (so existing instances still parse):

- `overflow?: TicketProposal[]` — couldn't fit in target sprints, sliding to later
- `bufferRule?: { percent: number, applied: boolean }` — records that the 80% rule was honored
- `reasoning` already covers narrative explanation — keep as-is

This avoids a new `SprintSlice` type; the existing planner UI already consumes `SprintPlan`.

### 6.4 Typed dependencies (NEW)

Two parallel types, same `LinkKind` enum:

- `LinkKind = "blockedBy" | "relatedTo" | "duplicates"`
- `TicketLink = { kind: LinkKind, targetTicketId: string }` — for live `Ticket` records (Slice A.2 migration: `Ticket.linkedTicketIds: string[]` → `Ticket.links: TicketLink[]`, existing entries default to `kind: "relatedTo"`)
- `ProposalDependency = { kind: LinkKind, targetProposalId: string }` — for `TicketProposal` (within-draft scope)

Validated by `dependencyPolicy.ts`: `blockedBy` cycles rejected; `relatedTo` / `duplicates` are documentation links. At commit time, `ProposalDependency.targetProposalId` is translated to `TicketLink.targetTicketId`.

### 6.5 `TicketProposal.discipline` (✓ built)

- `discipline?: OrgMemberRole` — optional; AI populates going forward. Slicing policy resolves via `t.discipline ?? ROLE_FOR_LABEL[t.label] ?? "developer"` so pre-discipline drafts (using the simplified `label`) degrade gracefully.
- `label` and `discipline` carry equivalent values post-Slice I — `label` is the user-facing display, `discipline` is the capacity-matching signal. Both exist; they're not redundant — `label` is what the PO sees, `discipline` is what the planner computes against.

### 6.6 `InspectorTranscript` (NEW — Phase 5)

- `id`, `epicSnapshotId`, `orgId`
- `turns: InspectorTurn[]` — append-only across all sessions
- `InspectorTurn`: `{ id, role: "user" | "inspector", text, createdAt }`
- One per Epic; persists indefinitely; PO picks up where they left off

### 6.7 `EpicMemory` (NEW — Phase 5 AI-curated insights)

- `id`, `epicSnapshotId`, `orgId`
- `content: string` — unstructured natural-language insight, written by the Inspector
- `tags: string[]` — for retrieval scoping
- `source: "chat" | "ticketEvolution"`
- `createdAt`
- Append-only; written by the Inspector via a `saveInsight` tool; read on each new Inspector turn to fold into context.

### 6.8 Ticket back-ref (extend existing `Ticket`)

- `epicSnapshotId?: string` — populated on commit; enables Phase 5 to reverse-look-up "what tickets came from this Epic"

---

## 7. Agent toolbox mapping

| Spec tool            | Lives in                                              | Notes                                                                   |
| -------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `memory_manager`     | `infrastructure/orchestrator/inspectorMemoryStore.ts` | Read/write `EpicMemory`. Real cross-Epic RAG deferred to backend slice. |
| `draft_engine`       | `infrastructure/orchestrator/draftStore.ts`           | ✓ exists                                                                |
| `org_browser`        | `infrastructure/orchestrator/capacityProvider.ts`     | NEW — uses Clerk org members                                            |
| `issue_lookup`       | `infrastructure/orchestrator/issueSearchAdapter.ts`   | Stub; full-text via existing search modal infra                         |
| `roadmap_fetcher`    | `infrastructure/orchestrator/capacityProvider.ts`     | Reads `Sprint` + completed `Ticket` history for velocity                |
| `capacity_validator` | `domain/orchestrator/policies/capacityPolicy.ts`      | Pure domain logic                                                       |
| `snapshot_tool`      | `infrastructure/orchestrator/snapshotStore.ts`        | NEW — single snapshot per Epic                                          |
| `jira_sync`          | `infrastructure/orchestrator/commitAdapter.ts`        | NEW — writes tickets + snapshot atomically                              |
| `save_insight`       | `infrastructure/orchestrator/inspectorMemoryStore.ts` | NEW — Inspector-only write tool                                         |

---

## 8. Phase-by-phase detail

### Phase 1 — Analyst

- ✓ Built. Persona/constraints honored ("zero technical jargon" guarded in mock prompt).
- Pending: prepend `memory_manager` call to fetch past-session context — deferred to backend slice.

### Phase 2 — Drafter

- ✓ Built (bulk list, reorder, label, delete, add).
- Refinement: add `discipline: "ux" | "dev" | "po-spike"` to each proposal. Display as small chip; no form complexity.

### Phase 3 — Jira Master

- ✓ Built (one-by-one wizard, story points, priority, AC, controller risks).
- Refinement: add `dependencies: TicketLink[]` per proposal + cycle-check on `blockedBy`. UI: small dependency chip selector with kind picker.

### Phase 4 — Scrum Master (NEW)

- Sub-machine in §5.2.
- Inputs: refined backlog (from Phase 3), `TeamMemberCapacity[]` (per-discipline), target start sprint.
- Outputs: `SprintSlice` + narrative explanation.
- Algorithm (slicingPolicy):
  1. Topologically sort by `blockedBy` graph.
  2. Greedy bin-pack into Sprint N first, respecting per-discipline 80% buffer + discipline match.
  3. Anything that doesn't fit → overflow into N+1, repeat.
  4. Emit explanation with concrete reasons ("Sprint 12: UX is at 100%, slide to 13").
- HITL: PO can approve, request revision (e.g. "ignore vacation"), or override individual placements.
- On commit: atomic write of **all** proposed tickets (fitted + overflow) + `EpicSnapshot`. Overflow tickets (`sprintId: null`) land in the backlog with no sprint assignment — they're real tickets, just unscheduled. `commitEpicDraft` guards `if (assignment?.sprintId)` so null is safe.

### Phase 5 — Inspector (NEW)

- Persona: a living-memory agent who knows the full Epic history + current ticket state.
- Entry: extended `DraftPicker` lists committed Epics; click one → boots Inspector machine for that snapshot.
- Capabilities:
  - Chat over snapshot context + live `Ticket` state + recent `EpicMemory` records (via `inspectorContextProvider`).
  - Show ticket evolution (what changed since commit — diff against snapshot's frozen `refinedTickets`).
  - On meaningful turns, AI calls `saveInsight` tool → appends `EpicMemory`.
- **Read-only over board state.** Only writes: append `InspectorTranscript` turns + append `EpicMemory` records.

---

## 9. Snapshots & memory model

- **`epicSnapshots`**: one immutable doc per Epic, written at Phase 4 commit.
- **`inspectorTranscripts`**: one doc per Epic, append-only `turns[]`, persists across Phase 5 sessions.
- **`epicMemories`**: append-only collection, one record per AI-curated insight, scoped by `epicSnapshotId`.
- All three are separate Mongoose collections, indexed `(orgId, epicSnapshotId)`.

---

## 10. Incremental delivery slices

| Slice     | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Gates                                                                                                        |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **A.1** ✓ | **Done** (absorbed into subsequent slices): `discipline?: OrgMemberRole` on `TicketProposal` (slicingPolicy uses `t.discipline ?? ROLE_FOR_LABEL[t.label]` — `label` is the fallback for pre-discipline drafts); `overflow`/`bufferRule` on `SprintPlan` (Slice B); Inspector types (`InspectorTurn`, `InspectorTranscript`, `EpicMemory`) (Slice E); `TicketLink` (Slice A.2). `ProposalDependency` type exists in domain; UI wiring deferred to Slice N.                                                                                                                                                                              | Type-check passes; existing flows untouched                                                                  |
| **A.2** ✓ | **Migrations done**: `Ticket.links: TicketLink[]` end-to-end (types/Zod/repo with on-read backcompat/GQL/UI). `EpicSnapshot` refactored to rich typed shape, moved to orchestrator domain. `driftDetection.ts` reads typed fields. `commitEpicDraft` populates typed snapshot. Dead `createEpicSnapshot` mutation removed.                                                                                                                                                                                                                                                                                                                                                                                                               | Type-check passes                                                                                            |
| **B** ✓   | **Done**: pure-domain `dependencyPolicy` (topo sort + cycle detection), `capacityPolicy` (80% buffer + cold-start defaults `developer: 8 / ux: 5 / tester: 5 / po: 3`), `slicingPolicy.produceSprintPlan` (fit-first, overflow, dep-aware). `runSprintPlanner` mock delegates to slicing policy. `capacityProvider.ts` derives velocity from last 5 completed sprints (done-column tickets per member) with default fallback. Seed-fixtures POST endpoint creates a fully-populated demo board (6 completed sprints + done tickets + role assignments).                                                                                                                                                                                  | Type-check passes; ready for manual smoke against seeded data                                                |
| **C** ✓   | **Done**: `capacityProvider` wired through orchestrator machine into `PlannerInput`. `OrchestratorSession` computes `initialCapacities` via `computeCapacities`, seeds machine on init, refreshes via `REFRESH_CAPACITIES` on board data changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Manual test in browser                                                                                       |
| **D** ✓   | **Done**: `DraftPicker` extended with committed-Epic list section (`onOpenCommittedEpic` prop); `OrchestratorRoot` routes to `Phase5Inspector` on committed Epic click.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | E2E commit happy path                                                                                        |
| **E** ✓   | **Done**: Inspector XState machine (`loadingContext → ready ↔ awaitingInspector`, `failed` w/ retry). `runInspectorTurn` mock returning `{ reply, insightsToSave[] }` (the `saveInsight` tool is modeled as the actor's output shape — the hook fires `store.saveMemory` per insight). `inspectorContextProvider.loadInspectorContext` bundles snapshot + live tickets + drift + transcript + memories. `inspectorMemoryStore` Apollo adapter implements the `InspectorStore` boundary. Server side: GQL queries (`inspectorTranscript`, `epicMemories`), mutations (`appendInspectorTurn`, `saveEpicMemory`), repository functions, Mongo indexes. Unit tests deferred — no test harness in the project yet (separate bootstrap slice). | Type-check passes; ready for Slice F UI                                                                      |
| **F** ✓   | **Done**: Phase 5 presentation. `useInspector` hook instantiates the Inspector machine with the real `loadInspectorContext` actor + `runInspectorTurn` mock; subscribes to context changes and pushes new turns / memories through the `InspectorStore` boundary (append-only, server IDs seeded on first ready to avoid double-writes). `Phase5Inspector` component renders the four machine states (`loadingContext` / `failed` / `ready` / `awaitingInspector`) with a chat pane (drift card pinned at top, transcript bubbles, thinking dots, error banner) and a memories sidebar. `OrchestratorRoot` routes committed-Epic clicks to it; `Phase5InspectorPlaceholder` removed.                                                     | Type-check passes; ready for manual smoke test                                                               |
| **G** ✓   | **Done (bootstrapped)**: Playwright installed + `playwright.config.ts` (serial, single worker, auto-boots `npm run dev`). `tests/e2e/auth.setup.ts` signs into Clerk once and persists `storageState` (gated on `E2E_CLERK_USER_USERNAME` / `E2E_CLERK_USER_PASSWORD`). Two specs cover the critical AI-decision paths: `orchestrator-commit.spec.ts` (Phases 1–4 happy path + commit, Phase 4 approve branch) and `inspector.spec.ts` (Phase 5 chat shell + memory persists across reload). `tests/e2e/helpers/seed.ts` calls the seed-fixtures endpoint. `tests/e2e/README.md` documents env setup + known gaps (over-capacity + back-to-refine specs). `npm run e2e` / `npm run e2e:ui`.                                              | Mandatory per AGENTS.md — covers approve branches; over-capacity + back-to-refine deferred to Slice H+I      |
| **H** ✓   | **Done**: Phase back-navigation. `BACK_TO_BRAINSTORM`, `BACK_TO_BULK`, `BACK_TO_REFINE` events on the orchestrator machine clear the stale artifact for the phase being exited (e.g. `sprintPlan` on leaving Phase 4) while preserving all transcripts. A synthetic analyst-role `BrainstormTurn` is appended to the relevant transcript so the AI gets context on re-entry. Styled in-app confirmation modal replaces browser `confirm()`. `REGENERATE_PLAN` / "Revise Plan" button removed (back-navigation supersedes it).                                                                                                                                                                                                            | Manual test all back paths                                                                                   |
| **I** ✓   | **Done**: Proposal label simplification. `ProposalLabel = "ux" \| "developer" \| "po" \| "qa"` — maps directly to `OrgMemberRole`. UI chip colors updated across Phase 2/3 panes. On-read backcompat collapses old granular labels (observability, security, devops, …) on next save.                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Type-check passes; existing drafts still load                                                                |
| **J** ✓   | **Done**: All 7 mock actors (analyst / architect / controller / blueprint chat / refinement chat / planner chat / inspector) swapped for real Gemini 2.5 Flash via **LangChain** (not LangGraph — see Decision §11.8). `src/infrastructure/orchestrator/llm.ts` factory + `realAi/*Graph.ts` per actor. GraphQL mutations route through `resolvers.ts` to keep `GOOGLE_API_KEY` server-side. Zod validation at every boundary. Controller's Fibonacci snap fixed for Gemini's lack of JSON Schema `const` support. `NEXT_PUBLIC_MOCK_AI=1` manual fallback for fast CI / demos.                                                                                                                                                          | Type-check passes; analyst + architect+controller smoke scripts pass                                         |
| **K** ✓   | **Done**: `tools/{index,registry}.ts` — `OrionTool` type, `toolsForPhase` selector, `registerTool` API. `bindOrionTools` in `llm.ts`. `findSimilarEpics` tool registered (Slice L). Agent loop guard in `controllerGraph.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Type-check passes; existing smokes pass; new smoke proves the model calls a registered tool                  |
| **L** ✓   | **Done**: RAG over committed Epics. `rag/embeddings.ts` — `gemini-embedding-001` factory (3072d, only embedding model available on the current v1beta endpoint; legacy `embedding-001`/`text-embedding-004` were removed). `rag/store.ts` — `composeEpicEmbeddingText(snapshot)` (pure: epic title + description + per-ticket inventory), `embedAndStoreEpic` (idempotent upsert keyed on `epicSnapshotId`), `searchSimilarEpics(orgId, query, topK)` (in-process cosine — Atlas Vector Search is overkill at <100 epics/org). `tools/findSimilarEpics.ts` — orgId-scoped tool factory; the orgId is captured in the closure, not passed as a tool arg, so the LLM cannot cross-tenant. `realAi/agentLoop.ts` — multi-round tool-calling helper that returns the augmented message list; called before `withStructuredOutput` because Gemini's structured output uses a forced function call that conflicts with generic tool calling. Wired through analyst (Phase 1) and architect (Phase 2) with optional `ctx?: { orgId? }`. Resolvers inject orgId from Clerk auth (`ctx.orgId`) — never trusted from client input. `commitEpicDraft` calls `embedAndStoreEpic` best-effort (logged failure, commit still succeeds). New `epicEmbeddings` indexes: `(orgId, epicSnapshotId)` unique + `(orgId, boardId, createdAt -1)`. | Type-check passes; embedding model verified in isolation (441ms/query, 3072d); Mongo collection bootstrapped |
| **M**     | **Skipped (low ROI)**. AC Linter would scan AC for vague markers ("should feel", "intuitive", "performant" without metric) and rewrite via controller agent loop. Deemed not worth the added complexity vs the prompt-level guidance already in `controllerGraph`. File `src/infrastructure/orchestrator/tools/acLinter.ts` never landed. Reopen if AC quality regresses in real use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | —                                                                                                            |
| **N** ✓   | **Done**: Dependency graph visualizer. `DependencyGraphView.tsx` (React Flow + BFS DAG layout: left-to-right level assignment, color-coded nodes by label, blockedBy as solid arrows, relatedTo/duplicates as dashed lines). Wired into `Phase2BulkList.tsx` via List/Graph toggle. TicketRow inline dependency picker (kind selector + target dropdown) with live cycle detection via `detectCycles`. Architect prompt extended to emit `dependencies[]` per ticket using `targetIndex` (0-based), resolved to real proposal ids post-generation. `@xyflow/react` style imported in `app/globals.css`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Type-check passes; backlog with deps renders correctly                                                       |
| **O** ✓   | **Done**: Semantic story-point estimator. `rag/store.ts` gains `embedAndStoreCommittedTickets` (batch via `embedDocuments`, idempotent upsert per `(orgId, ticketId)`), `countTicketEmbeddings`, `searchSimilarTickets` (cosine, orgId-scoped, in-process). `tools/findSimilarTickets.ts` — factory bound to orgId, returns hits with their committed `storyPoints` for anchor estimation. `controllerGraph.ts` wired through `agentLoop` (3 rounds, 30s timeout) with corpus-empty fast path; prompt updated with "search similar tickets first, then snap to Fibonacci". `commitEpicDraft` calls `embedAndStoreCommittedTickets` best-effort alongside `embedAndStoreEpic`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Type-check passes; first-time orgs skip agent loop (no corpus)                                               |
| **P** ✓   | **Done (partial)**: UI polish. `disabled` removed from chat textareas across Phase 1/2/3/4/5 (keep send button disabled — ChatGPT pattern); placeholders updated to invite typing during AI think. `REDRAFT_BACKLOG` event added (Phase 3→2 round-trip clears stale backlog + appends synthetic note; Architect re-runs with `hints` = `blueprintTranscript` user feedback). "Re-scope from Analyst" Phase-4→Phase-1 button deferred (low priority — back-nav already covers it).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Manual smoke: textarea accepts input during invoke; REDRAFT round-trip regenerates against feedback           |
| **Q** ✓   | **Done — AI-as-actor + chat polish**. Architect prompt: "minimize blockedBy". Chat actors (blueprint + refinement) extended with `mutations: (Blueprint\|Refinement)Mutation[]` channel — discriminated unions in `domain/orchestrator/types.ts` covering: addTicket / removeTicket / renameTicket / changeLabel / reorderTicket / editEpicTitle / editEpicDescription / addDependency / removeDependency (blueprint); setDescription / setStoryPoints / setLabel / setDiscipline / replaceAcceptanceCriteria / replaceRisks (refinement). LLM is instructed to DO changes when the PO asks, referencing existing ticket ids shown in the system prompt; the machine applies them via pure `applyBlueprintMutation` / `applyRefinementMutation` helpers. **Mode toggle** (Execute / Confirm) in chat panels: Execute applies immediately; Confirm stages in `pending(Blueprint\|Refinement)Mutations` for PO Accept/Reject. **Visual feedback**: `aiTouchedTicketIds` in ephemeral machine context; UI fires a 2s indigo pulse on touched tickets, then dispatches `CLEAR_AI_TOUCH`. **Chat styling**: AI replies render as ChatGPT-like prose (no bubble, paragraph splits on double-newline), user messages keep the indigo WhatsApp bubble. **Chat scroll**: panels now `h-full min-h-0` so long transcripts scroll internally instead of pushing the window. **Capability honesty**: chat prompts enumerate what the AI CAN do AND what it explicitly CANNOT (Phase 2 cannot edit description/AC/points; Phase 3 cannot restructure backlog or touch other tickets); the AI must emit the matching mutation if it claims to have done something. **AC format rule**: Controller draft + refinement chat now require each AC to be Given/When/Then (new behavior) or as-is vs to-be (change to existing behavior). Files: `domain/orchestrator/types.ts`, `domain/orchestrator/machines/orchestrator.machine.ts`, `infrastructure/orchestrator/realAi/{blueprintChatGraph,refinementChatGraph,controllerGraph,architectGraph}.ts`, `presentation/orchestrator/{Phase2BulkList,Phase3Wizard,OrchestratorSession}.tsx`. **NOTE**: Slice Q was structurally broken in production until Slice R landed — see below. |
| **R** ✓   | **Honest chat loop + infra hygiene**. Found that Slice Q never actually worked: `ChatReplyOutput` in GraphQL only declared `reply`, so `mutations` were silently stripped at the wire boundary; the client always saw an empty mutations array. **Six-part fix**: (1) **wire-fix** — added `mutationsJson: String!` to `ChatReplyOutput`, JSON-encoded discriminated unions because typed GraphQL unions would mean 9-variant duplication per chat; client Zod-parses on receive. (2) **server-side validation** (`realAi/mutationValidation.ts`) — pure validators check the AI's mutations against the live backlog (`validateBlueprintMutations`) or active ticket (`validateRefinementMutations`) for: ticket-id existence, dependency self-loops, rename with no payload, non-empty AC. (3) **reply-splice correction** — when validation rejects mutations, the chat graph splices a correction note into the AI's `reply` in the AI's own voice ("— Correction: I also attempted \`renameTicket(ticketId=foo)\` but the system rejected it. That change was NOT applied."). No retry round-trip; truth lands in chat history so the AI sees it next turn. Single LLM call per turn keeps latency low; user prefers AI-owned messaging over a separate red banner. (4) **prompt rewrite + trim** — graded resistance (cosmetic → comply, structural → max 2 pushbacks then comply with disagreement, out-of-scope → state plainly), strict id discipline ("use `prop-xxxxxxxx`, never `#N`"), live-state acknowledgment ("FIND ticket in CURRENT BACKLOG before saying you can't see it"). Verbose HONESTY/self-check section dropped now that validation enforces it; prompts ~40% smaller. (5) **infra cleanups** — `extractErrorMessage` helper handles ApolloError shapes so users see real messages instead of `undefined`; RETRY transitions fixed to target invoke states (`generatingBacklog`/`decideTicket`/`generatingPlan`) so retry actually re-invokes; PhaseHeader's destructive "Abandon" replaced with "← Back" (drafts auto-save); Architect timeout 45s → 120s for local Gemma. (6) **Apollo cache audit** — `draftStore.save` no longer carries `refetchQueries: [GET_EPIC_DRAFTS]`. Auto-save fires every ~1.5s during a session and the picker isn't visible then — that refetch was burning bandwidth. `create`/`remove` still refetch (picker is visible). Dead `list`/`listForCurrentBoard` helpers removed; `DraftStore` interface tightened. | Type-check passes; manual smoke pending |
| **S** → | **UX polish + session persistence**: (1) **ticket references** — blueprint + refinement chat prompts updated to instruct AI to refer to tickets by `#N Title` in narrative text (for human clarity) while using exact `prop-xxx` IDs in mutations. Prompts already show `#N \| id=...` so AI has both pieces. (2) **auto-scroll on navigate-back** — all 5 phase chat panels now scroll to bottom on mount via empty-deps `useEffect`, so returning to a paused session shows the tail of the conversation. (3) **restore last visited phase** — `useOrchestrator` now navigates to the correct phase on resume instead of always starting at Phase 1. Machine receives `STRUCTURE_REQUESTED` event if draft.phase is phase2+ and machine is at phase1, triggering phase navigation. (4) **ChatGPT-style formatting everywhere** — extracted `ProseTurn` component into `shared/ProseTurn.tsx` (paragraph-split prose, no bubbles). Applied to all 5 phases uniformly (was only in Phase 2/3). User messages stay in indigo bubble. Files: `blueprintChatGraph.ts`, `refinementChatGraph.ts` (prompt updates); `Phase1Brainstorm.tsx`, `Phase4SprintPlan.tsx`, `Phase5Inspector.tsx` (auto-scroll + ProseTurn); `useOrchestrator.ts` (phase restoration); `Phase2BulkList.tsx`, `Phase3Wizard.tsx` (ProseTurn consolidation); new `shared/ProseTurn.tsx`. | Type-check passes; manual user test on all 5 phases pending |
| **T** → | **On-demand context retrieval (critical design)** — RFD on chat loop architecture. Current state: each chat turn receives a fixed system prompt with full current scope (backlog listing, ticket details); RAG tools (`findSimilarEpics`, `findSimilarTickets`) pre-search before the structured response. **Problem**: AI cannot proactively request context when the PO mentions something out of scope — it either sends incomplete replies or wastes tokens on full backlog every turn. **Vision**: restructure chat graphs to include a tool-calling phase where the AI can decide to fetch context on demand. AI should know: what context it has NOW (current ticket, epic title/description), what context is AVAILABLE via tools (getFullBacklog, getTicketDetails, searchSimilarTickets, etc.), and when to use them (PO mentions a ticket not in scope → fetch it; AI thinks context would help → ask for it). This reduces token waste and makes the AI's reasoning transparent. **Constraint**: Gemini 2.5 Flash supports tool calling; local LM Studio may not. **Approach**: add context-fetching tools to the tool registry; update prompts to enumerate available tools; restructure agentLoop pattern (currently used for Architect/Analyst RAG) to apply to all chats; test with Gemini first, add LM Studio fallback. **Timing**: deferred to post-Session-R as it's a significant refactor with no user-facing immediate payoff; Phase 3 on-demand backlog (Slice S sub-item) can ship independently without full tool-calling loop. | Research + design spike needed |

Each slice ends in a working app — no half-finished states across slice boundaries.

---

## 11. Resolved decisions

| #   | Question                          | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Phase 2 discipline categorization | Add `discipline: "ux" \| "dev" \| "po-spike"` field on `TicketProposal`. Pure metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 2   | Phase 3 dependency model          | Full typed `TicketLink[]` with `kind: "blockedBy" \| "relatedTo" \| "duplicates"`. Migrate existing `Ticket.linkedTicketIds` to `Ticket.links`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3   | Phase 4 capacity granularity      | Per-discipline `{ ux, dev, poSpike }`. Computed at runtime by `capacityProvider`, not stored. SP/capacity is orchestrator-internal — not exposed in regular board UI (see §13 follow-up).                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4   | Snapshot model                    | One immutable `EpicSnapshot` per Epic at commit. No versioning, no rollback. Phase 5 chat history persists in separate `InspectorTranscript`; AI-curated insights persist in separate `EpicMemory` collection.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5   | Phase 5 entry point               | Extend `DraftPicker` with a committed-Epic list section; click → Inspector. No URL plumbing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6   | Back-navigation between phases    | PO can navigate back from any phase to the previous one. On back: **clear the stale artifact** for the phase being exited (e.g. `sprintPlan` cleared when leaving Phase 4, `refinementCursor` reset when leaving Phase 3) but **keep all transcripts** — they are the auditable conversation record. A `BrainstormTurn` with role `analyst` and a note like "PO returned to phase N to revise…" is appended to the relevant transcript so the AI has context on the next re-entry. No browser `confirm()` — use a styled app modal. Remove the `REGENERATE_PLAN` / "Revise plan" button from Phase 4 (back-navigation supersedes it). |
| 7   | Proposal label simplification     | `ProposalLabel` is too granular (observability, security, devops…) for Phase 2. POs shouldn't be categorizing at that level during discovery. Simplify to four discipline-aligned values: `"ux" \| "developer" \| "po" \| "qa"`. These map directly to `OrgMemberRole`. Old labels collapse on next save. Defer to a follow-up slice after Phase 2 UX review — but do NOT add new specific labels in the meantime.                                                                                                                                                                                                                    |
| 8   | LangChain over LangGraph          | Slice J uses **LangChain** (not LangGraph) for the real AI backend. LangGraph adds orchestration overhead not needed here — each actor is a single-turn structured-output call, not a multi-step graph. LangChain's `withStructuredOutput` + custom `agentLoop.ts` multi-round helper covers all current needs. LangGraph remains an option if actors grow into multi-step pipelines.                                                                                                                                                                                                                                                 |

---

## 12. Open questions parked for later slices

- **Slice B — cold-start velocity.** ✓ **Resolved**: `capacityPolicy.DEFAULT_VELOCITY_BY_ROLE` ships fixed defaults (`developer: 8`, `ux: 5`, `tester: 5`, `po: 3` pts/sprint) and each `TeamMemberCapacity` records `isDefaultVelocity: true` when no history exists, so the planner can disclose the guess in its reasoning. PO-confirmation UI is deferred — once the first sprint completes, measured velocity replaces the default automatically.
- **Slice E — memory retention.** Should `EpicMemory` records have a TTL or pruning strategy if they accumulate over months? Probably not — they're cheap and the AI can rank-order on read. Revisit if it becomes a problem.
- **Post-Slice C — large-board capacity caching (200+ tickets).** Slice C caches capacities in ephemeral machine context, recomputing fresh on session resume + on every `REFRESH_CAPACITIES` (board data change). For small boards (<100 tickets) this is negligible (pure client-side compute, no tokens). For large boards (200+), repeated recomputation during active Phase 4 could accumulate (CPU cycles, not tokens). Consider persisting `capacities` on `EpicDraft` with a TTL (e.g., refresh if >5min old) to amortize cost. Trade-off: adds Zod/GQL/Mongo plumbing; gain is avoiding redundant iteration on stable velocity. Defer unless profiling shows jank.

---

## 13. Follow-up cleanup (out of orchestrator scope)

Decision §11.3 implies SP/capacity is AI-internal. Existing board UI exposes these concepts to the PO (story points field on `TicketModal` / `CreateTicketModal`, capacity input on `CreateSprintModal`). This needs a separate cleanup slice **after** the orchestrator work lands:

- Hide `storyPoints` input from `TicketModal` / `CreateTicketModal` (data persists, AI populates).
- Hide `capacityPoints` input from `CreateSprintModal` (data persists, derived from velocity).
- Keep read-only display of these values where useful (e.g. sprint progress).

Tracked here so it doesn't get lost; **not** part of this orchestrator scope.

---

## 14. Non-goals (this scope)

- Multi-Epic Inspector view — one Epic at a time.
- Cross-board Epics — single board scope, same as drafts today.
- Snapshot versioning, time-travel-during-flow, rollback UI — explicitly removed (decision §11.4).

> Note: Real Gemini/LangChain wiring (Slice J) and RAG over committed Epics (Slice L) shipped ahead of original plan — removed from non-goals.
