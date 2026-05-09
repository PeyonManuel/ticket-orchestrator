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
| Domain machine | `phase1Brainstorming → phase2Structuring → phase3Refining → committing → committed` | `committing` is a stub; no Inspector machine |
| Domain types | `EpicDraft`, `BrainstormTurn`, `BacklogProposal`, `TicketProposal` | `EpicSnapshot`, `TeamMemberCapacity`, `SprintSlice`, typed `TicketLink`, discipline, `InspectorTranscript`, `EpicMemory` |
| Infrastructure | `mockAi.ts` (3 actors), `draftStore.ts`, GQL CRUD for drafts | `snapshotStore`, `capacityProvider`, `commitAdapter`, `inspectorMemoryStore`, Phase 4/5 mock actors |
| Presentation | `Phase1Brainstorm`, `Phase2BulkList`, `Phase3Wizard`, `DraftPicker` | `Phase4ScrumMaster`, `Phase5Inspector`; extend `DraftPicker` with committed-Epic list |
| Backend | All AI is mocked in-process | Real LangGraph + FastAPI + Gemini + RAG — explicitly deferred to a later slice |
| E2E | None | Mandatory per AGENTS.md for approve/reject branches |

---

## 3. Phase mapping (spec → code)

| Spec phase | Persona | Current state name | Status |
|---|---|---|---|
| 1 Analyst | Strategic Consultant | `phase1Brainstorming` | Built. RAG hook deferred to backend slice. |
| 2 Drafter | Technical Planner | `phase2Structuring` | Built. Add `discipline` tag to proposals. |
| 3 Jira Master | QA/Documentation | `phase3Refining` | Built. Add full typed dependency model. |
| 4 Scrum Master | Team Protector | `committing` (stub) | **Expand into capacity → slicing → approve → sync sub-machine.** |
| 5 Inspector | Living Memory | (new) | **New machine**, entered when opening a committed Epic. |

Phase 4 and 5 are this blueprint's net-new work; Phases 1–3 need targeted refinements, not rewrites.

---

## 4. Target architecture

### 4.1 Domain layer (`src/domain/orchestrator/`)

```
machines/
  orchestrator.machine.ts     [EXPAND] phase4 sub-machine replaces stub `committing`
  inspector.machine.ts        [NEW]    post-commit chat over snapshot + live ticket state
policies/
  capacityPolicy.ts           [NEW]    80% buffer rule, per-discipline availability
  slicingPolicy.ts            [NEW]    fit-first, slide-rest sprint allocation
  dependencyPolicy.ts         [NEW]    cycle detection on `blockedBy`, topological order
types.ts                      [EXTEND] EpicSnapshot, TeamMemberCapacity, SprintSlice, TicketLink,
                                       discipline, InspectorTranscript, EpicMemory
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
idle → phase1Brainstorming → phase2Structuring → phase3Refining → committing → committed
                                                                              ↘ abandoned
```

### 5.2 Target

```
idle
  → phase1Brainstorming               (Analyst chat, awaiting PO approval to advance)
  → phase2Structuring                 (Drafter backlog, bulk-edit + discipline, awaiting approval)
  → phase3Refining                    (Jira Master 1-by-1 wizard + deps, awaiting approval)
  → phase4ScrumMaster                 [NEW SUB-MACHINE]
       ├── gatheringCapacity          (capacityProvider derives per-discipline availability)
       ├── proposingSlice             (Scrum Master actor produces SprintSlice)
       ├── awaitingHumanApproval      (PO reviews fit / overflow + explanation)
       │     ├── HUMAN_APPROVED → committingToBoard
       │     └── REVISION_REQUESTED → proposingSlice
       └── committingToBoard          (commitAdapter: write tickets + EpicSnapshot atomically)
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

### 6.1 `EpicSnapshot` (NEW, immutable, **one per Epic**)

- `id`, `orgId`, `boardId`, `draftId`
- `createdAt`, `createdBy`
- **Frozen 4-phase artifacts:** `transcript`, `brainstormSummary`, `backlog`, `refinedTickets`, `sprintSlice`, `capacityPlanAtCommit`
- `ticketIds: string[]` — back-refs to live `Ticket` records created from this Epic

No versioning, no parent lineage, no mid-flow save points — one snapshot per Epic, written once at Phase 4 commit, never mutated.

### 6.2 `TeamMemberCapacity` (NEW, computed at runtime, not stored)

- `memberId`
- `byDiscipline: { ux: number, dev: number, poSpike: number }` — per-sprint points per discipline, derived from historical velocity of completed sprints
- `committedByDiscipline` — already-allocated points for a given target sprint
- `availableByDiscipline` — derived: `byDiscipline × 0.8 − committed` (80% buffer rule)

Computed by `capacityProvider.ts`. Not PO-editable. Cold-start strategy (when no completed sprints exist) is an open question parked for slice B.

### 6.3 `SprintSlice` (NEW — Phase 4 output, frozen into snapshot at commit)

- `proposedAt`, `assignments: Array<{ ticketId, sprintId, memberIds[] }>`
- `overflow: TicketProposal[]` — couldn't fit, sliding to N+1/N+2
- `explanation: string` — Scrum Master's narrative for the PO ("Sprint 12 UX is 100% allocated, ticket #5 slides to Sprint 13")
- `bufferRule: { percent: 80, applied: true }`

### 6.4 `TicketLink` (NEW — replaces existing `Ticket.linkedTicketIds`)

- `kind: "blockedBy" | "relatedTo" | "duplicates"`
- `targetTicketId: string`
- Validated by `dependencyPolicy.ts`: `blockedBy` cycles rejected; `relatedTo` and `duplicates` are documentation links.
- **Migration:** `Ticket.linkedTicketIds: string[]` → `Ticket.links: TicketLink[]`. Existing entries default to `kind: "relatedTo"`. Same shape on `TicketProposal.dependencies` so the commit step is a clean copy, not a shape-shift.

### 6.5 `TicketProposal.discipline` (extend existing)

- `discipline: "ux" | "dev" | "po-spike"` — drives Phase 4 assignment + capacity matching
- Pure metadata; minimal UI chrome (small chip in Phase 2 list)

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
| **A** | Data contracts (TS + Zod) for `EpicSnapshot`, `TeamMemberCapacity`, `SprintSlice`, `TicketLink`, discipline, `InspectorTranscript`, `EpicMemory`; Mongoose models; GQL schema additions; `Ticket.linkedTicketIds → links` migration | Type-check passes; no UI yet |
| **B** | Phase 4 domain: capacity policy, slicing policy, machine expansion, mock `runScrumMasterPlanning`. Resolve cold-start velocity question. | Domain unit tests |
| **C** | Phase 4 presentation: capacity panel, slice preview, approve/revise UI | Manual test in browser |
| **D** | Commit pipeline: `commitAdapter` writes tickets + snapshot atomically; `epicSnapshotId` back-refs populated; `DraftPicker` shows committed Epics | E2E commit happy path |
| **E** | Phase 5 domain: inspector machine, mock `runInspectorTurn` + `saveInsight` tool, `inspectorContextProvider`, `inspectorMemoryStore` | Domain unit tests |
| **F** | Phase 5 presentation: chat pane, ticket diff view, transcript persistence | Manual test |
| **G** | E2E: Phase 4 approve/revise/over-capacity, Phase 5 chat + memory persistence | Mandatory per AGENTS.md |
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

---

## 12. Open questions parked for later slices

- **Slice B — cold-start velocity.** If a board has no completed sprints, capacity history is empty. Likely answer: AI proposes a default per-discipline starting capacity (e.g. ~5pt UX + 8pt Dev per member), PO confirms once. Resolve in slice B.
- **Slice E — memory retention.** Should `EpicMemory` records have a TTL or pruning strategy if they accumulate over months? Probably not — they're cheap and the AI can rank-order on read. Revisit if it becomes a problem.

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
