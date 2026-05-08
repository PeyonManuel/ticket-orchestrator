# Orion AI Orchestrator — Architecture

> Status: **Frontend-first scaffold.** XState theater + mock actors. LangGraph backend wires in later.
> Last updated: 2026-05-07

---

## 1. Mission

Orion is an Automated Project Lead. Given a raw product idea, it produces a fully structured technical Epic — stories, tasks, acceptance criteria, story points — ready to commit to the board.

The orchestrator runs **three sequential phases** with explicit human approval at every boundary. Drafts are persistent: a user can leave at any point and resume where they left off, and nothing reaches the board until they hit **Commit Epic**.

---

## 2. The Three Phases

| # | Name | Goal | Agent | UX |
|---|---|---|---|---|
| 1 | **Brainstorming** ("Discovery") | Establish the *why* and high-level shape of the Epic | Analyst | Focused chat |
| 2 | **Structuring** ("Blueprint") | Generate the full backlog (stories + tasks) with labels | Architect / PO | Bulk list — approve, edit, reorder, delete |
| 3 | **Refining** ("Deep Dive") | Finalize each ticket: AC, story points, risk | Controller | One-by-one wizard |

After phase 3 the user reviews a final summary and commits → real tickets are written to the board, an `EpicSnapshot` is minted as the immutable baseline (drives drift detection later).

---

## 3. State Machine

Hierarchical, with a **parallel `persistence` region** that snapshots `workflow` state to storage on every transition. Persistence is a side-effect, not a state — never add a `paused` state.

```
orchestrator (parallel)
├── workflow
│   ├── phase1Brainstorming
│   │   ├── awaitingUser           (user types)
│   │   ├── awaitingAnalyst        (mock/AI is responding)
│   │   └── readyToStructure       (Analyst has produced a summary; user can advance)
│   ├── phase2Structuring
│   │   ├── generatingBacklog      (Architect actor running)
│   │   ├── reviewingBulk          (user editing the list)
│   │   └── readyToRefine          (user advances)
│   ├── phase3Refining
│   │   ├── refiningTicket         (Controller actor running for current ticket)
│   │   ├── awaitingTicketApproval (user reviews / edits AC + points)
│   │   └── readyToCommit          (last ticket approved; ready for final review)
│   ├── committing                 (writing tickets to the board)
│   ├── committed (final)
│   ├── abandoned (final)
│   └── error                      (recoverable — RETRY allowed)
└── persistence
    └── ready (always; listens for context changes via invoked actor)
```

### Key transitions

| From | Event | To | Guard | Action |
|---|---|---|---|---|
| `awaitingUser` | `USER_MESSAGE` | `awaitingAnalyst` | non-empty | append message, invoke Analyst |
| `awaitingAnalyst` | `ANALYST_REPLY` | `awaitingUser` (or `readyToStructure` if Analyst marks summary complete) | — | append reply, store summary if final |
| `readyToStructure` | `STRUCTURE_REQUESTED` | `phase2Structuring.generatingBacklog` | `hasBrainstormSummary` | snapshot phase1, invoke Architect |
| `reviewingBulk` | `ADVANCE_TO_REFINE` | `readyToRefine` | `backlogNonEmpty` | — |
| `readyToRefine` | `BEGIN_REFINEMENT` | `phase3Refining.refiningTicket` (cursor=0) | — | invoke Controller for ticket[0] |
| `awaitingTicketApproval` | `APPROVE_TICKET` | `refiningTicket` (cursor++) **or** `readyToCommit` if last | — | persist refined ticket |
| `readyToCommit` | `COMMIT_EPIC` | `committing` | `allTicketsApproved` | invoke commit actor |
| `committing` | `COMMIT_DONE` | `committed` | — | clear draft from storage |
| any | `ABANDON_DRAFT` | `abandoned` | confirmed | clear draft from storage |
| `phase2.reviewingBulk` | `BACK_TO_BRAINSTORM` | `phase1Brainstorming.awaitingUser` | — | preserve transcript |
| `phase3.*` | `BACK_TO_BULK` | `phase2.reviewingBulk` | confirmed (loses some refinement) | — |

### Invariants

1. Tickets only ever leave the orchestrator on `committing` → `committed`. No partial commits.
2. `EpicDraft.id` is stable for the entire lifecycle and is the persistence key.
3. Brainstorm transcript is append-only; edits not allowed.
4. `BacklogProposal` is mutable until `BEGIN_REFINEMENT`. After that, structural changes (add/remove/reorder) require `BACK_TO_BULK`.
5. Refinement is monotonic: a ticket reaches `approved` and is not revisited unless the user goes back.
6. Any externally-sourced AI payload passes Zod validation before entering machine context.

---

## 4. Data Contracts

These types are the JSON shape the Python/LangGraph backend will eventually emit. They live in `src/domain/orchestrator/types.ts` and must stay in sync with the Pydantic models on the backend.

```ts
type DraftId = string;
type ProposalId = string;

type OrchestratorPhase =
  | "phase1Brainstorming"
  | "phase2Structuring"
  | "phase3Refining"
  | "committing"
  | "committed"
  | "abandoned";

interface BrainstormTurn {
  id: string;
  role: "user" | "analyst";
  text: string;
  createdAt: string; // ISO
}

interface BrainstormSummary {
  /** One-paragraph "why and what" produced by the Analyst when ready. */
  summary: string;
  /** Bulleted goals / success criteria the user agreed to. */
  goals: string[];
  /** Out-of-scope notes (helps the Architect not over-build). */
  outOfScope: string[];
}

interface TicketProposal {
  id: ProposalId; // local-only; replaced with real Ticket id at commit
  hierarchyType: "story" | "task";
  title: string;
  /** One-line summary; full description gets filled in phase 3. */
  oneLiner: string;
  description: string;          // refined in phase 3
  label: string;                // e.g. "frontend", "backend"
  acceptanceCriteria: string[]; // refined in phase 3
  storyPoints: 1 | 2 | 3 | 5 | 8 | 13 | null; // null until refined
  risks: string[];              // surfaced by Controller in phase 3
  refined: boolean;             // flips true after APPROVE_TICKET
}

interface BacklogProposal {
  /** Title for the parent Epic ticket that will be created. */
  epicTitle: string;
  epicDescription: string;
  tickets: TicketProposal[];
}

interface EpicDraft {
  id: DraftId;
  orgId: string;
  boardId: string;
  /** Author who started the draft. */
  authorId: string;
  createdAt: string;
  updatedAt: string;
  phase: OrchestratorPhase;
  /** Phase 1 state. */
  transcript: BrainstormTurn[];
  brainstormSummary: BrainstormSummary | null;
  /** Phase 2/3 state. */
  backlog: BacklogProposal | null;
  /** Phase 3 cursor — index into backlog.tickets. */
  refinementCursor: number;
  /** Set when the user explicitly leaves; lets the dashboard list "resume" entries. */
  lastSeenAt: string;
}
```

### `EpicDraft` vs `EpicSnapshot`

|  | `EpicDraft` | `EpicSnapshot` |
|---|---|---|
| Mutable | Yes, until commit | **No, ever** |
| Lifetime | Until commit or abandon | Forever (drives drift detection) |
| Phase | Any pre-commit | Created at the moment of commit |
| Storage | Drafts collection (per-org), keyed by `id` | Existing `EpicSnapshot` collection |
| Schema | Phased, structured | Frozen JSON of the committed plan |

At commit time we (a) write tickets to the board, (b) mint an `EpicSnapshot` from the committed backlog, (c) delete or archive the draft.

---

## 5. Mock AI

`src/infrastructure/orchestrator/mockAi.ts` exposes three actor functions matching the future LangGraph contract:

```ts
runAnalystTurn(input: { transcript: BrainstormTurn[]; userMessage: string }):
  Promise<{ reply: string; summary: BrainstormSummary | null }>

runArchitectBacklog(input: { summary: BrainstormSummary }):
  Promise<BacklogProposal>

runControllerRefinement(input: { ticket: TicketProposal; backlog: BacklogProposal }):
  Promise<{ description: string; acceptanceCriteria: string[]; storyPoints: 1|2|3|5|8|13; risks: string[] }>
```

Mock characteristics:
- 600–1400ms simulated latency (so loading states render)
- Pre-canned responses with light templating against the user input
- Marks the brainstorm summary as ready after the third user message (or when the user types "ready" / "let's structure")
- Generates 5–8 ticket proposals across `frontend`/`backend`/`qa`/`infra` labels

When the Python backend lands, the same module exports the same three function signatures — only the implementation swaps out.

---

## 6. Persistence

Drafts are **first-class durable entities** in Mongo, not local browser state. A draft is a chat that the PO can pick up at any time, on any device, until they explicitly commit or delete it.

- **Where:** Mongo collection `epic_drafts`, scoped by `orgId` (multi-tenancy rule), exposed via GraphQL.
- **What's stored:** the full `EpicDraft` document. The XState machine is reconstructed from this on resume — the machine itself is never serialized.
- **Listing:** `Query.epicDrafts(boardId)` returns drafts for the current board. The Orchestrator modal opens to a draft picker if any are in progress (with a "New draft" CTA).
- **Save cadence:**
  - On every phase boundary (deterministic, cheap).
  - On any user-driven mutation, debounced 1.5s (covers chat messages, list edits, refinement edits).
  - On modal close (best-effort).
- **Lifecycle:**
  - `phase1Brainstorming` → `phase2Structuring` → `phase3Refining` → `committing` → `committed`, persisted at every boundary.
  - `abandoned` drafts are soft-deleted (kept with `deletedAt` for restore/audit; same pattern as `Board`).
  - On commit: real tickets + an `EpicSnapshot` are written; the draft is updated to `phase: "committed"` and remains as historical context (the chat that produced the Epic).
- **Multi-tenancy:** every query filters by `orgId`; primary index is `(orgId, boardId, updatedAt desc)`.

The persistence boundary is the `DraftStore` interface in `domain/orchestrator/types.ts`. The default implementation in `infrastructure/orchestrator/draftStore.ts` is Apollo-backed; tests can substitute an in-memory fake.

---

## 7. UI Layout

`OrchestratorModal` is a full-screen sheet (not a centered card) — the workflow has too much content for a small modal.

```
┌─────────────────────────────────────────────────┐
│  ◐ New Epic Draft                  [Save] [×]   │
│  ●─────●─────○   Phase 2 of 3: Structuring      │
├─────────────────────────────────────────────────┤
│                                                 │
│   <PhaseN component renders here>               │
│                                                 │
└─────────────────────────────────────────────────┘
```

- Top bar: phase indicator (3 dots), title (editable in phase 2+), Save & exit, Close.
- Body: phase-specific. Each phase mounts/unmounts via `AnimatePresence` with mode="sync" and 160ms fade+slide.
- Bottom bar (per phase): primary CTA (advance), secondary (back), tertiary (abandon).

### Phase 1 (Brainstorm)
- Chat list with user/analyst bubbles (color-coded).
- Loading dots while `awaitingAnalyst`.
- Sticky composer at the bottom.
- "Continue to backlog →" CTA enables only when `readyToStructure`.

### Phase 2 (Bulk list)
- Sticky summary card (collapsible) with the `BrainstormSummary`.
- Vertical list of ticket rows. Inline-editable `title`. Hover shows: ↑ ↓ ✕.
- "+ Add ticket" row at end.
- "Refine each ticket →" CTA.

### Phase 3 (Wizard)
- Header: "Ticket 3 of 8" + thin progress bar.
- Two columns: form (title, description, AC list, story points, risks) | Controller analysis (read-only AI commentary).
- Buttons: "Approve & Next →" / "Skip" / "← Previous".
- After last ticket: full-page summary with "Commit Epic" CTA.

### Animation
Strict per `CLAUDE.md` Animation Contract:
- Modal entrance: backdrop 150ms linear, panel 160ms `[0.16,1,0.3,1]` with `y: 12 → 0` and `scale: 0.97 → 1`.
- Phase transitions: 160ms cross-fade with 8px y-shift.
- Loading: pulse animation on placeholders, no spinners.
- Close = instant.

---

## 8. Implementation Order

1. ~~Architecture doc~~ ← *this file*
2. Domain types (`src/domain/orchestrator/types.ts`)
3. Machine (`src/domain/orchestrator/machines/orchestrator.machine.ts`)
4. Mock AI actors (`src/infrastructure/orchestrator/mockAi.ts`)
5. Mongo schema + repository for `EpicDraft`
6. GraphQL schema + resolvers + Apollo operations
7. Apollo `DraftStore` adapter
8. UI (`src/presentation/orchestrator/`) — drafts picker, phase 1/2/3 panels
9. Wire into `BoardContext` (already has `activeModal: "orchestrator"`)
10. *Later:* real LangGraph backend, commit-to-board action, drift hookup to `EpicSnapshot`.
