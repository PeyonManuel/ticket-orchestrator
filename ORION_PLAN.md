# ORION_PLAN.md — AI Orchestrator Master Blueprint

> Source of truth for the 4-phase + post-commit Inspector orchestrator. Updated incrementally as slices land.
> Last updated: 2026-05-09.

---

## 1. Mission

Build a state-managed AI factory that turns a PO's high-level vision into a capacity-planned, technically detailed Epic. Five collaborating personas, one continuous workflow, durable across sessions, auditable, human-approved at every material decision.

---

## 2. Status quo (May 2026)

| Layer | Built | Gap |
|---|---|---|
| Domain machine | `phase1Brainstorming → phase2Structuring → phase3Refining → phase4SprintPlanning → committing → committed`, with planner sub-states (`generatingPlan / reviewingPlan / awaitingPlannerReply`) | No Inspector (Phase 5) machine; Phase 4 has no capacity policy, no overflow, no dependency-aware ordering |
| Domain types | `EpicDraft`, `BrainstormTurn`, `BacklogProposal`, `TicketProposal`, `SprintPlan`, `SprintSnapshot`, `MemberSnapshot`, `TicketAssignment`, `OrgMemberRole`. Existing thin `EpicSnapshot` (`{ id, orgId, epicTicketId, createdAt, planJson }`) used by drift detection. | `discipline` on proposals, typed dependencies, capacity-aware extensions on `SprintPlan` (overflow + bufferRule), Inspector types (`InspectorTranscript`, `EpicMemory`), refactored rich `EpicSnapshot` |
| Infrastructure | `mockAi.ts` (7 actors: analyst / architect / controller / blueprint chat / refinement chat / planner / planner chat), `draftStore.ts`, GQL CRUD for drafts, `commitEpicDraft` repository + resolver, `driftDetection.ts` | `capacityProvider`, `inspectorMemoryStore`, Phase 5 mock actor + memory tool |
| Presentation | `Phase1Brainstorm`, `Phase2BulkList`, `Phase3Wizard`, `Phase4SprintPlan`, `DraftPicker`, `OrchestratorRoot`, `OrchestratorSession`, `useOrchestrator` | `Phase5Inspector`; extend `DraftPicker` with committed-Epic list; capacity panel + slice preview enrichments on `Phase4SprintPlan` |
| Backend | All AI is mocked in-process | Real LangGraph + FastAPI + Gemini + RAG — explicitly deferred to slice H |
| E2E | None | Mandatory per AGENTS.md for approve/reject branches |

---

## 3. Phase mapping (spec → code)

| Spec phase | Persona | Current state name | Status |
|---|---|---|---|
| 1 Analyst | Strategic Consultant | `phase1Brainstorming` | Built. RAG hook deferred to backend slice. |
| 2 Drafter | Technical Planner | `phase2Structuring` | Built. Add `discipline` tag to proposals. |
| 3 Jira Master | QA/Documentation | `phase3Refining` | Built. Add full typed dependency model. |
| 4 Scrum Master | Team Protector | `phase4SprintPlanning` | **Built (basic).** Planner actor + chat exist, produce `SprintPlan`. **Augment** with capacity policy (80% buffer per discipline), overflow/slicing concept, dependency-aware ordering. |
| 5 Inspector | Living Memory | (new) | **New machine**, entered when opening a committed Epic. |

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
mockAi.ts                     [EXTEND] runScrumMasterPlanning, runInspectorTurn mocks
snapshotStore.ts              [NEW]    Apollo-backed CRUD for EpicSnapshot
capacityProvider.ts           [NEW]    runtime per-discipline capacity from member velocity history
inspectorContextProvider.ts   [NEW]    bundles snapshot + current ticket state + recent memories
inspectorMemoryStore.ts       [NEW]    Apollo-backed CRUD for EpicMemory + InspectorTranscript
commitAdapter.ts              [NEW]    atomic write: tickets + EpicSnapshot
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
schemas.ts                    EpicSnapshot, EpicMemory, InspectorTranscript Mongoose models
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

### 6.2 `TeamMemberCapacity` (NEW, computed at runtime, not stored)

- `memberId`
- `byDiscipline: { ux: number, dev: number, poSpike: number }` — per-sprint points per discipline, derived from historical velocity of completed sprints
- `committedByDiscipline` — already-allocated points for a given target sprint
- `availableByDiscipline` — derived: `byDiscipline × 0.8 − committed` (80% buffer rule)

Computed by `capacityProvider.ts`. Not PO-editable. Cold-start strategy (when no completed sprints exist) is an open question parked for slice B.

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

### 6.5 `TicketProposal.discipline` (NEW — Slice A.1)

- `discipline?: OrgMemberRole` — reuses existing `OrgMemberRole = "developer" | "ux" | "tester" | "po"` (defined in `src/domain/analyst/types.ts`). Same enum as `MemberSnapshot.role` so capacity matching is direct equality.
- Optional in Slice A.1 to avoid breaking existing draft data; AI populates going forward. Pure metadata; minimal UI chrome.

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

| Spec tool | Lives in | Notes |
|---|---|---|
| `memory_manager` | `infrastructure/orchestrator/inspectorMemoryStore.ts` | Read/write `EpicMemory`. Real cross-Epic RAG deferred to backend slice. |
| `draft_engine` | `infrastructure/orchestrator/draftStore.ts` | ✓ exists |
| `org_browser` | `infrastructure/orchestrator/capacityProvider.ts` | NEW — uses Clerk org members |
| `issue_lookup` | `infrastructure/orchestrator/issueSearchAdapter.ts` | Stub; full-text via existing search modal infra |
| `roadmap_fetcher` | `infrastructure/orchestrator/capacityProvider.ts` | Reads `Sprint` + completed `Ticket` history for velocity |
| `capacity_validator` | `domain/orchestrator/policies/capacityPolicy.ts` | Pure domain logic |
| `snapshot_tool` | `infrastructure/orchestrator/snapshotStore.ts` | NEW — single snapshot per Epic |
| `jira_sync` | `infrastructure/orchestrator/commitAdapter.ts` | NEW — writes tickets + snapshot atomically |
| `save_insight` | `infrastructure/orchestrator/inspectorMemoryStore.ts` | NEW — Inspector-only write tool |

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
- On commit (`commitAdapter`): atomic write of `Ticket` records (with `sprintIds` from slice + `epicSnapshotId` back-ref) + the single `EpicSnapshot`.

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

| Slice | Scope | Gates |
|---|---|---|
| **A.1** | **Additive** new types only (no migrations): `discipline`, `ProposalDependency` on `TicketProposal`; `overflow` + `bufferRule` on `SprintPlan`; new `TicketLink` (typed but not yet wired to `Ticket`); new Inspector types (`InspectorTurn`, `InspectorTranscript`, `EpicMemory`). Zod schemas + GQL schema additions (types only). Doc updates. | Type-check passes; existing flows untouched |
| **A.2** ✓ | **Migrations done**: `Ticket.links: TicketLink[]` end-to-end (types/Zod/repo with on-read backcompat/GQL/UI). `EpicSnapshot` refactored to rich typed shape, moved to orchestrator domain. `driftDetection.ts` reads typed fields. `commitEpicDraft` populates typed snapshot. Dead `createEpicSnapshot` mutation removed. | Type-check passes |
| **B** ✓ | **Done**: pure-domain `dependencyPolicy` (topo sort + cycle detection), `capacityPolicy` (80% buffer + cold-start defaults `developer: 8 / ux: 5 / tester: 5 / po: 3`), `slicingPolicy.produceSprintPlan` (fit-first, overflow, dep-aware). `runSprintPlanner` mock delegates to slicing policy. `capacityProvider.ts` derives velocity from last 5 completed sprints (done-column tickets per member) with default fallback. Seed-fixtures POST endpoint creates a fully-populated demo board (6 completed sprints + done tickets + role assignments). | Type-check passes; ready for manual smoke against seeded data |
| **C** | Wire `capacityProvider` through the orchestrator machine into `PlannerInput` so the planner uses real velocity. Phase 4 presentation enrichments: capacity panel, overflow callouts, approve/revise UI on existing `Phase4SprintPlan`. | Manual test in browser |
| **D** | Inspector hooks into commit: rich snapshot already populated (Slice A.2); `DraftPicker` extended with committed-Epic list; click → routes to Phase 5 | E2E commit happy path |
| **E** ✓ | **Done**: Inspector XState machine (`loadingContext → ready ↔ awaitingInspector`, `failed` w/ retry). `runInspectorTurn` mock returning `{ reply, insightsToSave[] }` (the `saveInsight` tool is modeled as the actor's output shape — the hook fires `store.saveMemory` per insight). `inspectorContextProvider.loadInspectorContext` bundles snapshot + live tickets + drift + transcript + memories. `inspectorMemoryStore` Apollo adapter implements the `InspectorStore` boundary. Server side: GQL queries (`inspectorTranscript`, `epicMemories`), mutations (`appendInspectorTurn`, `saveEpicMemory`), repository functions, Mongo indexes. Unit tests deferred — no test harness in the project yet (separate bootstrap slice). | Type-check passes; ready for Slice F UI |
| **F** ✓ | **Done**: Phase 5 presentation. `useInspector` hook instantiates the Inspector machine with the real `loadInspectorContext` actor + `runInspectorTurn` mock; subscribes to context changes and pushes new turns / memories through the `InspectorStore` boundary (append-only, server IDs seeded on first ready to avoid double-writes). `Phase5Inspector` component renders the four machine states (`loadingContext` / `failed` / `ready` / `awaitingInspector`) with a chat pane (drift card pinned at top, transcript bubbles, thinking dots, error banner) and a memories sidebar. `OrchestratorRoot` routes committed-Epic clicks to it; `Phase5InspectorPlaceholder` removed. | Type-check passes; ready for manual smoke test |
| **G** | E2E: Phase 4 approve/revise/over-capacity, Phase 5 chat + memory persistence | Mandatory per AGENTS.md |
| **I** | Phase back-navigation: back-transitions in the XState machine, styled "going back" confirmation modal, artifact-clear + transcript-append pattern, remove REGENERATE_PLAN / Revise Plan button | Manual test all back paths |
| **J** | Proposal label simplification: `ProposalLabel` → `"ux" \| "developer" \| "po" \| "qa"`, UI chip updates, on-read backcompat for old draft data | Type-check; existing drafts still load |
| **H** *(later)* | Swap mock actors for real LangGraph adapters; same signatures | Integration tests |

Each slice ends in a working app — no half-finished states across slice boundaries.

---

## 11. Resolved decisions

| # | Question | Decision |
|---|---|---|
| 1 | Phase 2 discipline categorization | Add `discipline: "ux" \| "dev" \| "po-spike"` field on `TicketProposal`. Pure metadata. |
| 2 | Phase 3 dependency model | Full typed `TicketLink[]` with `kind: "blockedBy" \| "relatedTo" \| "duplicates"`. Migrate existing `Ticket.linkedTicketIds` to `Ticket.links`. |
| 3 | Phase 4 capacity granularity | Per-discipline `{ ux, dev, poSpike }`. Computed at runtime by `capacityProvider`, not stored. SP/capacity is orchestrator-internal — not exposed in regular board UI (see §13 follow-up). |
| 4 | Snapshot model | One immutable `EpicSnapshot` per Epic at commit. No versioning, no rollback. Phase 5 chat history persists in separate `InspectorTranscript`; AI-curated insights persist in separate `EpicMemory` collection. |
| 5 | Phase 5 entry point | Extend `DraftPicker` with a committed-Epic list section; click → Inspector. No URL plumbing. |
| 6 | Back-navigation between phases | PO can navigate back from any phase to the previous one. On back: **clear the stale artifact** for the phase being exited (e.g. `sprintPlan` cleared when leaving Phase 4, `refinementCursor` reset when leaving Phase 3) but **keep all transcripts** — they are the auditable conversation record. A `BrainstormTurn` with role `analyst` and a note like "PO returned to phase N to revise…" is appended to the relevant transcript so the AI has context on the next re-entry. No browser `confirm()` — use a styled app modal. Remove the `REGENERATE_PLAN` / "Revise plan" button from Phase 4 (back-navigation supersedes it). |
| 7 | Proposal label simplification | `ProposalLabel` is too granular (observability, security, devops…) for Phase 2. POs shouldn't be categorizing at that level during discovery. Simplify to four discipline-aligned values: `"ux" \| "developer" \| "po" \| "qa"`. These map directly to `OrgMemberRole`. Old labels collapse on next save. Defer to a follow-up slice after Phase 2 UX review — but do NOT add new specific labels in the meantime. |

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

- Real LangGraph / FastAPI / Gemini wiring — slice H, separate effort.
- Real RAG vector retrieval across Epics — single-Epic memory only for now.
- Multi-Epic Inspector view — one Epic at a time.
- Cross-board Epics — single board scope, same as drafts today.
- Snapshot versioning, time-travel-during-flow, rollback UI — explicitly removed (decision §11.4).
