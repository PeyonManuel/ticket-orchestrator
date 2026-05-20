/**
 * Orchestrator domain types — the JSON shape the LangGraph backend will eventually emit.
 * Keep in sync with the Pydantic models in the Python service.
 *
 * Architecture overview: docs/orchestrator/architecture.md
 */

import { z } from "zod";
import type { BoardColumn, DriftReport, OrgMemberRole, Ticket } from "../analyst/types";
import type { TeamMemberCapacity } from "./policies/capacityPolicy";

export type { TeamMemberCapacity } from "./policies/capacityPolicy";

export type DraftId = string;
export type ProposalId = string;

export type OrchestratorPhase =
  | "phase1Brainstorming"
  | "phase2Structuring"
  | "phase3Refining"
  | "phase4SprintPlanning"
  | "committing"
  | "committed"
  | "abandoned";

// ── Phase 1 ──────────────────────────────────────────────────────────

export type BrainstormRole = "user" | "analyst";

export interface BrainstormTurn {
  id: string;
  role: BrainstormRole;
  text: string;
  createdAt: string;
  /** Clerk user id of the human who sent this turn — null for AI turns or legacy data. */
  authorId?: string | null;
  /** Display name resolved server-side at write time so the UI can render without a member lookup. */
  authorName?: string | null;
}

export interface BrainstormSummary {
  /** One-paragraph "why and what" produced by the Analyst. */
  summary: string;
  /** Goals / success criteria the user agreed to. */
  goals: string[];
}

// ── Phase 2/3 ────────────────────────────────────────────────────────

export type ProposalLabel = "developer" | "ux" | "qa" | "po";

export type ProposalStoryPoints = 1 | 2 | 3 | 5 | 8 | 13;

/**
 * A single acceptance criterion on a ticket. The AI picks `kind` per AC:
 *
 *  - `gherkin`: structured Given/When/Then. Optional one-line `and` only after `when`
 *    (per `feedback_ac_format_rule.md`). Used for verifiable behavior changes.
 *  - `narrative`: free-form sentence. Used when Gherkin doesn't fit (spike tickets,
 *    pure-backend infrastructure work, copy changes).
 *
 * Schema enforcement makes the format deterministic — if the AI commits to `gherkin`,
 * Zod rejects payloads missing `given`/`when`/`then`. This was a regression from a
 * prior `string[]` shape where the AI was free to write non-Gherkin AC inline in
 * `description` and there was nothing to reject it.
 */
export type AcceptanceCriterion =
  | {
      kind: "gherkin";
      /** Optional short scenario label, e.g. "Happy path" or "Empty cart". */
      title?: string;
      given: string;
      when: string;
      /**
       * The Gherkin "THEN" clause — the observable outcome. Named `outcome`
       * (not `then`) so the object cannot be mistaken for a Promise thenable
       * by any code path that uses duck-typed Promise detection.
       */
      outcome: string;
      /** Optional single `and` clause — strictly post-`when`. */
      and?: string;
    }
  | {
      kind: "narrative";
      text: string;
    };

/**
 * Typed link between two tickets / proposals. Same enum drives both
 * `Ticket.links` (post-commit, see analyst/types.ts) and
 * `TicketProposal.dependencies` (pre-commit, within-draft scope).
 */
export type LinkKind = "blockedBy" | "relatedTo" | "duplicates";

/**
 * Pre-commit dependency between two proposals in the same draft.
 * `blockedBy` participates in topological sort + cycle check during Phase 4 slicing;
 * `relatedTo` and `duplicates` are documentation-only links.
 */
export interface ProposalDependency {
  kind: LinkKind;
  targetProposalId: ProposalId;
}

export interface TicketProposal {
  id: ProposalId;
  hierarchyType: "story" | "task";
  title: string;
  /** Single-line summary set in phase 2; full description filled in phase 3. */
  oneLiner: string;
  /** "What & why" prose only. Acceptance criteria live on `acceptanceCriteria`. */
  description: string;
  /**
   * Structured acceptance criteria. Optional during rollout — drafts created before
   * this field landed have AC embedded in `description` instead. Empty/absent means
   * "no structured AC yet"; the refinement flow populates it.
   */
  acceptanceCriteria?: AcceptanceCriterion[];
  label: ProposalLabel;
  storyPoints: ProposalStoryPoints | null;
  risks: string[];
  refined: boolean;
  /** Phase 3 per-ticket chat with the AI for refinement discussion. */
  transcript: BrainstormTurn[];
  /**
   * Functional discipline — drives Phase 4 capacity matching and assignment.
   * Same enum as `MemberSnapshot.role` so capacity comparison is direct equality.
   * Optional during the A.1 rollout; AI populates going forward.
   */
  discipline?: OrgMemberRole;
  /**
   * Within-draft dependency edges. Empty/absent means "no declared dependencies".
   * `blockedBy` cycles are rejected by `dependencyPolicy.ts` (Slice B).
   */
  dependencies?: ProposalDependency[];
}

export interface BacklogProposal {
  epicTitle: string;
  epicDescription: string;
  tickets: TicketProposal[];
}

/**
 * Dependency inference actor input — infers blockedBy relationships from ticket
 * titles + descriptions after the architect has generated the backlog. Deterministic
 * (temperature 0, structured output).
 */
export interface DependencyInferenceInput {
  /** Tickets from the backlog, complete with titles and descriptions. */
  tickets: TicketProposal[];
  /** Existing dependencies from architect, used as a baseline. */
  currentDependencies: ProposalDependency[];
  /** Epic summary for context (optional). */
  epicSummary?: BrainstormSummary;
}

/**
 * Dependency inference output — refined list of dependencies to apply to backlog.
 * Each ticket appears once in this list with its inferred dependencies.
 */
export interface DependencyInferenceOutput {
  ticketId: ProposalId;
  dependencies: ProposalDependency[];
}

// ── Draft ────────────────────────────────────────────────────────────

export interface EpicDraft {
  id: DraftId;
  orgId: string;
  boardId: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  phase: OrchestratorPhase;
  transcript: BrainstormTurn[];
  /** Phase 2 chat history — PO refines the backlog structure with AI. */
  blueprintTranscript: BrainstormTurn[];
  brainstormSummary: BrainstormSummary | null;
  backlog: BacklogProposal | null;
  refinementCursor: number;
  sprintPlan: SprintPlan | null;
  plannerTranscript: BrainstormTurn[];
  planningSprints: SprintSnapshot[];
  planningMembers: MemberSnapshot[];
  lastSeenAt: string;
}

/** Lightweight summary used by the "Resume planning" list. */
export interface EpicDraftIndexEntry {
  id: DraftId;
  title: string;
  phase: OrchestratorPhase;
  updatedAt: string;
}

// ── Actor contracts (mock today, LangGraph tomorrow) ─────────────────

export interface AnalystTurnInput {
  transcript: BrainstormTurn[];
  userMessage: string;
}

export interface AnalystTurnOutput {
  reply: string;
  /** Non-null once the Analyst is satisfied that brainstorming is complete. */
  summary: BrainstormSummary | null;
}

export interface ArchitectInput {
  summary: BrainstormSummary;
  /**
   * Optional Phase 2 blueprint chat turns — passed on REDRAFT_BACKLOG so the
   * Architect can react to the PO's feedback on the prior draft rather than
   * regenerating the same backlog from the same summary.
   */
  hints?: BrainstormTurn[];
}

export type ArchitectOutput = BacklogProposal;

export interface ControllerInput {
  ticket: TicketProposal;
  backlog: BacklogProposal;
}

export interface ControllerOutput {
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  storyPoints: ProposalStoryPoints;
  risks: string[];
}

export interface BlueprintChatInput {
  transcript: BrainstormTurn[];
  currentBacklog: BacklogProposal;
  userMessage: string;
}

/**
 * Mutations the Architect can propose against the current backlog in Phase 2.
 * Each variant is keyed by `kind` so the machine can dispatch a typed event.
 * Tickets are referenced by id (LLM gets the ids in the system prompt).
 * `addTicket.afterTicketId === null` means "insert at the top".
 */
export type BlueprintMutation =
  | {
      kind: "addTicket";
      title: string;
      oneLiner: string;
      label: ProposalLabel;
      hierarchyType: "story" | "task";
      /** Insert immediately after this ticket. Absent → append at the end. */
      afterTicketId?: string;
    }
  | { kind: "removeTicket"; ticketId: ProposalId }
  | {
      kind: "renameTicket";
      ticketId: ProposalId;
      title?: string;
      oneLiner?: string;
    }
  | { kind: "changeLabel"; ticketId: ProposalId; label: ProposalLabel }
  | { kind: "reorderTicket"; ticketId: ProposalId; newIndex: number }
  | { kind: "editEpicTitle"; title: string }
  | { kind: "editEpicDescription"; description: string }
  | {
      kind: "addDependency";
      sourceTicketId: ProposalId;
      targetTicketId: ProposalId;
      linkKind: LinkKind;
    }
  | {
      kind: "removeDependency";
      sourceTicketId: ProposalId;
      targetTicketId: ProposalId;
      linkKind: LinkKind;
    };

export interface BlueprintChatOutput {
  reply: string;
  /** Backlog edits the Architect proposes that passed server-side validation. Failed mutations are spliced into `reply` as a correction note in the AI's voice. */
  mutations?: BlueprintMutation[];
}

export interface RefinementChatInput {
  transcript: BrainstormTurn[];
  ticket: TicketProposal;
  backlog: BacklogProposal;
  userMessage: string;
}

/**
 * Single-ticket mutations the Controller can propose in Phase 3.
 * Arrays use replace semantics (LLM emits the full new list) since the
 * Controller's job is to refine the ticket as a whole.
 */
export type RefinementMutation =
  | { kind: "setDescription"; description: string }
  | { kind: "setAcceptanceCriteria"; acceptanceCriteria: AcceptanceCriterion[] }
  | { kind: "setStoryPoints"; storyPoints: ProposalStoryPoints }
  | { kind: "setLabel"; label: ProposalLabel }
  | { kind: "setDiscipline"; discipline: OrgMemberRole }
  | { kind: "replaceRisks"; risks: string[] };

export interface RefinementChatOutput {
  reply: string;
  /** Field edits the Controller proposes that passed server-side validation. Failed mutations are spliced into `reply` as a correction note in the AI's voice. */
  mutations?: RefinementMutation[];
}

// ── Phase 4 Sprint Planning ──────────────────────────────────────────

export interface SprintSnapshot {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  capacityPoints: number;
  status: "planning" | "active" | "completed";
  /** Story points already consumed by existing board tickets (not from this epic). */
  usedPoints?: number;
}

/** Pre-existing allocation entry for a sprint slot, derived from board tickets at plan time. */
export interface SprintPreAllocation {
  sprintId: string;
  memberId: string;
  discipline: OrgMemberRole;
  points: number;
}

export interface MemberSnapshot {
  userId: string;
  fullName: string;
  role: "developer" | "ux" | "tester" | "po";
}

export interface TicketAssignment {
  ticketId: ProposalId;
  sprintId: string | null;
  assigneeUserId: string | null;
}

/**
 * Records that the 80% buffer rule was honored when producing the plan.
 * `applied: false` means the planner deliberately exceeded the rule (e.g. PO override).
 */
export interface SprintPlanBufferRule {
  percent: number;
  applied: boolean;
}

/**
 * A sprint the planner proposes to create on commit to fit tickets beyond the
 * current planning horizon. `id` is a temporary client-generated UUID; the real
 * sprint is created server-side by `commitEpicDraft` which substitutes the real
 * Mongo id into the matching `TicketAssignment.sprintId` values.
 */
export interface ProposedSprint {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  capacityPoints: number;
}

export interface SprintPlan {
  assignments: TicketAssignment[];
  /**
   * New sprints the planner suggests creating to accommodate tickets that
   * didn't fit into the existing planning horizon. Created server-side at commit.
   */
  proposedSprints?: ProposedSprint[];
  /** Records the buffer policy applied during planning. Populated by Slice B. */
  bufferRule?: SprintPlanBufferRule;
}

export interface PlannerInput {
  backlog: BacklogProposal;
  sprints: SprintSnapshot[];
  members: MemberSnapshot[];
  /**
   * Per-member velocity derived from board history (or cold-start defaults
   * when no completed sprints exist). Threaded into `PlannerInput` so the
   * planner — mock today, LangGraph later — operates on real capacity
   * instead of re-deriving defaults from `members`.
   */
  capacities: TeamMemberCapacity[];
  /** Pre-existing story-point allocations from board tickets already in these sprints. */
  initialAllocations?: SprintPreAllocation[];
  /** Board name — used to name proposed sprints `{boardName} {N+1}` per the codebase convention. */
  boardName?: string;
  /** Next sprint number on the board, so proposed sprints extend the existing numbering. */
  nextSprintNumber?: number;
}

export type PlannerOutput = SprintPlan;

export interface PlannerChatInput {
  plannerTranscript: BrainstormTurn[];
  currentPlan: SprintPlan;
  backlog: BacklogProposal;
  sprints: SprintSnapshot[];
  members: MemberSnapshot[];
  /** Same capacity context as `PlannerInput` so revisions stay budget-aware. */
  capacities: TeamMemberCapacity[];
  userMessage: string;
  initialAllocations?: SprintPreAllocation[];
}

export interface PlannerChatOutput {
  reply: string;
  updatedPlan: SprintPlan | null;
}

// ── Inspector (Phase 5) actor contracts ──────────────────────────────

/**
 * Bundle the Inspector actor needs to produce a grounded reply: the frozen
 * Epic plan, the live ticket state, drift between them, accumulated chat,
 * and any previously-curated memories. `userMessage` is the new turn from
 * the PO that triggered this round.
 */
export interface InspectorTurnInput {
  snapshot: EpicSnapshot;
  liveTickets: Ticket[];
  columns: BoardColumn[];
  drift: DriftReport;
  transcript: InspectorTurn[];
  memories: EpicMemory[];
  userMessage: string;
}

/**
 * What the Inspector returns: the assistant reply plus any insights it
 * chose to persist via the `saveInsight` tool. `insightsToSave` is empty
 * on most turns; the Inspector only writes when an observation is durable
 * and worth re-folding into future context.
 */
export interface InspectorTurnOutput {
  reply: string;
  insightsToSave: Array<{
    content: string;
    tags: string[];
    source: EpicMemorySource;
  }>;
}

// ── Commit artifact (Phase 4 → committed) ────────────────────────────

/**
 * Immutable record of a committed Epic. One per Epic, written once at Phase 4 commit,
 * never mutated. Captures the frozen 4-phase artifacts and back-references to the live
 * `Ticket` records created from this Epic. Consumed by drift detection ("plan vs live")
 * and by the Phase 5 Inspector (chat over committed Epic context).
 */
export interface EpicSnapshot {
  id: string;
  orgId: string;
  boardId: string;
  epicTicketId: string;
  /** Source draft this snapshot was committed from. Null if reconstructed from legacy data. */
  draftId: string | null;
  createdAt: string;
  /** User id of the PO who pressed Commit. Null when written by a system migration. */
  createdBy: string | null;
  // Frozen 4-phase artifacts (immutable copies of the draft state at commit):
  transcript: BrainstormTurn[];
  blueprintTranscript: BrainstormTurn[];
  brainstormSummary: BrainstormSummary | null;
  backlog: BacklogProposal | null;
  plannerTranscript: BrainstormTurn[];
  sprintPlan: SprintPlan | null;
  planningSprints: SprintSnapshot[];
  planningMembers: MemberSnapshot[];
  /** Back-refs to live `Ticket` records created at commit (epic + children). */
  ticketIds: string[];
}

/**
 * Lightweight projection of `EpicSnapshot` used by picker / list views.
 * Avoids hydrating the full frozen-artifact payload when all we need is
 * a card. The full snapshot is fetched by id on click.
 */
export interface EpicSnapshotIndexEntry {
  id: string;
  epicTicketId: string;
  boardId: string;
  title: string;
  createdAt: string;
  createdBy: string | null;
  /** Total tickets (epic + children) created at commit. */
  ticketCount: number;
}

// ── Phase 5 Inspector ────────────────────────────────────────────────

export type InspectorTurnRole = "user" | "inspector";

export interface InspectorTurn {
  id: string;
  role: InspectorTurnRole;
  text: string;
  createdAt: string;
  /** Clerk user id of the human who sent this turn — null for AI turns or legacy data. */
  authorId?: string | null;
  /** Display name resolved server-side at write time so other POs see who said what. */
  authorName?: string | null;
}

/**
 * Per-Epic chat transcript that persists across all Phase 5 sessions.
 * One document per `epicSnapshotId`; turns are appended in order.
 */
export interface InspectorTranscript {
  id: string;
  orgId: string;
  epicSnapshotId: string;
  turns: InspectorTurn[];
  updatedAt: string;
}

export type EpicMemorySource = "chat" | "ticketEvolution";

/**
 * AI-curated insight about a committed Epic. Append-only — written by the Inspector
 * via the `saveInsight` tool when something meaningful surfaces. Read on each new
 * Inspector turn so accumulated knowledge folds into context.
 */
export interface EpicMemory {
  id: string;
  orgId: string;
  epicSnapshotId: string;
  content: string;
  tags: string[];
  source: EpicMemorySource;
  createdAt: string;
}

// ── Persistence boundary ─────────────────────────────────────────────

/**
 * Persistence boundary for orchestrator drafts. The picker queries the list
 * directly via Apollo `useQuery(GET_EPIC_DRAFTS)` (cache-and-network); this
 * boundary exists for the in-session lifecycle: load on entry, save on edit,
 * remove on abandon.
 */
export interface DraftStore {
  load(id: DraftId): Promise<EpicDraft | null>;
  save(draft: EpicDraft): Promise<void>;
  remove(id: DraftId): Promise<void>;
}

/**
 * Persistence boundary for Phase 5 transcript + memory. Same shape rules
 * as `DraftStore` — Apollo-backed adapter on the client, GQL → Mongo on the server.
 */
export interface InspectorStore {
  loadTranscript(epicSnapshotId: string): Promise<InspectorTranscript | null>;
  appendTurn(epicSnapshotId: string, turn: InspectorTurn): Promise<InspectorTranscript>;
  listMemories(epicSnapshotId: string): Promise<EpicMemory[]>;
  saveMemory(memory: EpicMemory): Promise<void>;
}

// ── Zod schemas (validate AI / persisted payloads at boundaries) ─────

const proposalLabelSchema = z.enum(["developer", "ux", "qa", "po"]);

const proposalStoryPointsSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(5),
  z.literal(8),
  z.literal(13),
]);

export const brainstormTurnSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "analyst"]),
  text: z.string(),
  createdAt: z.string(),
  authorId: z.string().nullish(),
  authorName: z.string().nullish(),
});

export const brainstormSummarySchema = z.object({
  summary: z.string().min(1),
  goals: z.array(z.string()),
});

export const linkKindSchema = z.enum(["blockedBy", "relatedTo", "duplicates"]);

export const proposalDependencySchema = z.object({
  kind: linkKindSchema,
  targetProposalId: z.string().min(1),
});

const orgMemberRoleSchema = z.enum(["developer", "ux", "tester", "po"]);

// GraphQL emits a flat shape for AC (variant-specific fields are nullable list
// columns alongside the discriminator), so the wire payload arrives with `null`
// in the unselected-variant slots. We use a permissive flat schema and a
// transform to narrow into the discriminated-union domain shape, instead of
// `discriminatedUnion` directly which would reject `null` on the optionals.
const flatAcceptanceCriterionSchema = z.object({
  kind: z.enum(["gherkin", "narrative"]),
  title: z.string().nullish(),
  given: z.string().nullish(),
  when: z.string().nullish(),
  outcome: z.string().nullish(),
  and: z.string().nullish(),
  text: z.string().nullish(),
});

// Wire schema for JSON Schema generation (no transforms — used by LLM structured output)
export const acceptanceCriterionWireSchema = flatAcceptanceCriterionSchema;

// Domain schema with validation transform (used for GraphQL response validation, not LLM)
export const acceptanceCriterionSchema = acceptanceCriterionWireSchema.transform(
  (v, ctx): AcceptanceCriterion => {
    if (v.kind === "gherkin") {
      if (!v.given || !v.when || !v.outcome) {
        ctx.addIssue({
          code: "custom",
          message: "gherkin acceptance criteria require given, when, and outcome",
        });
        return z.NEVER;
      }
      return {
        kind: "gherkin",
        title: v.title ?? undefined,
        given: v.given,
        when: v.when,
        outcome: v.outcome,
        and: v.and ?? undefined,
      };
    }
    if (!v.text) {
      ctx.addIssue({
        code: "custom",
        message: "narrative acceptance criteria require non-empty text",
      });
      return z.NEVER;
    }
    return { kind: "narrative", text: v.text };
  },
);

export const ticketProposalSchema = z.object({
  id: z.string().min(1),
  hierarchyType: z.enum(["story", "task"]),
  title: z.string().min(1),
  oneLiner: z.string(),
  description: z.string(),
  label: proposalLabelSchema,
  storyPoints: proposalStoryPointsSchema.nullable(),
  risks: z.array(z.string()),
  refined: z.boolean(),
  transcript: z.array(brainstormTurnSchema).default([]),
  // Slice A.1 additions — accept both null and undefined (GraphQL nullable
  // fields surface as explicit null on the wire; persisted draft docs may have
  // the field absent), normalize to undefined so the inferred shape matches
  // the `TicketProposal` interface (`discipline?: OrgMemberRole`).
  discipline: orgMemberRoleSchema
    .nullish()
    .transform((v) => v ?? undefined),
  dependencies: z
    .array(proposalDependencySchema)
    .nullish()
    .transform((v) => v ?? undefined),
  acceptanceCriteria: z
    .array(acceptanceCriterionSchema)
    .nullish()
    .transform((v) => v ?? undefined),
});

export const backlogProposalSchema = z.object({
  epicTitle: z.string().min(1),
  epicDescription: z.string(),
  tickets: z.array(ticketProposalSchema).min(1),
});

export const dependencyInferenceInputSchema = z.object({
  tickets: z.array(ticketProposalSchema).min(1),
  currentDependencies: z.array(proposalDependencySchema).default([]),
  epicSummary: brainstormSummarySchema.optional(),
});

export const dependencyInferenceOutputSchema = z.object({
  ticketId: z.string().min(1),
  dependencies: z.array(proposalDependencySchema).default([]),
});

export const analystTurnOutputSchema = z.object({
  reply: z.string().min(1),
  summary: brainstormSummarySchema.nullable(),
});

export const controllerOutputSchema = z.object({
  description: z.string().min(1),
  acceptanceCriteria: z.array(acceptanceCriterionSchema).default([]),
  storyPoints: proposalStoryPointsSchema,
  risks: z.array(z.string()),
});

const epicMemorySourceSchema = z.enum(["chat", "ticketEvolution"]);

// ── Chat mutation schemas ────────────────────────────────────────────

export const blueprintMutationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("addTicket"),
    title: z.string().min(1),
    oneLiner: z.string(),
    label: proposalLabelSchema,
    hierarchyType: z.enum(["story", "task"]),
    afterTicketId: z.string().optional(),
  }),
  z.object({
    kind: z.literal("removeTicket"),
    ticketId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("renameTicket"),
    ticketId: z.string().min(1),
    title: z.string().optional(),
    oneLiner: z.string().optional(),
  }),
  z.object({
    kind: z.literal("changeLabel"),
    ticketId: z.string().min(1),
    label: proposalLabelSchema,
  }),
  z.object({
    kind: z.literal("reorderTicket"),
    ticketId: z.string().min(1),
    newIndex: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal("editEpicTitle"),
    title: z.string().min(1),
  }),
  z.object({
    kind: z.literal("editEpicDescription"),
    description: z.string().min(1),
  }),
  z.object({
    kind: z.literal("addDependency"),
    sourceTicketId: z.string().min(1),
    targetTicketId: z.string().min(1),
    linkKind: linkKindSchema,
  }),
  z.object({
    kind: z.literal("removeDependency"),
    sourceTicketId: z.string().min(1),
    targetTicketId: z.string().min(1),
    linkKind: linkKindSchema,
  }),
]);

// Wire schema for JSON Schema generation (no transforms — used by LLM structured output)
export const refinementMutationWireSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("setDescription"),
    description: z.string().min(1),
  }),
  z.object({
    kind: z.literal("setAcceptanceCriteria"),
    acceptanceCriteria: z.array(acceptanceCriterionWireSchema).min(1),
  }),
  z.object({
    kind: z.literal("setStoryPoints"),
    storyPoints: proposalStoryPointsSchema,
  }),
  z.object({
    kind: z.literal("setLabel"),
    label: proposalLabelSchema,
  }),
  z.object({
    kind: z.literal("setDiscipline"),
    discipline: orgMemberRoleSchema,
  }),
  z.object({
    kind: z.literal("replaceRisks"),
    risks: z.array(z.string().min(1)),
  }),
]);

// Domain schema (used for post-LLM validation + GraphQL parsing, applies AC transforms)
export const refinementMutationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("setDescription"),
    description: z.string().min(1),
  }),
  z.object({
    kind: z.literal("setAcceptanceCriteria"),
    acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
  }),
  z.object({
    kind: z.literal("setStoryPoints"),
    storyPoints: proposalStoryPointsSchema,
  }),
  z.object({
    kind: z.literal("setLabel"),
    label: proposalLabelSchema,
  }),
  z.object({
    kind: z.literal("setDiscipline"),
    discipline: orgMemberRoleSchema,
  }),
  z.object({
    kind: z.literal("replaceRisks"),
    risks: z.array(z.string().min(1)),
  }),
]);


const sprintSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  capacityPoints: z.number(),
  status: z.enum(["planning", "active", "completed"]),
  usedPoints: z.number().optional(),
});

const memberSnapshotSchema = z.object({
  userId: z.string(),
  fullName: z.string(),
  role: z.enum(["developer", "ux", "tester", "po"]),
});

const ticketAssignmentSchema = z.object({
  ticketId: z.string(),
  sprintId: z.string().nullable(),
  assigneeUserId: z.string().nullable(),
});

const sprintPlanBufferRuleSchema = z.object({
  percent: z.number(),
  applied: z.boolean(),
});

const proposedSprintSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  capacityPoints: z.number(),
});

const sprintPlanSchema = z.object({
  assignments: z.array(ticketAssignmentSchema),
  proposedSprints: z.array(proposedSprintSchema).optional(),
  bufferRule: sprintPlanBufferRuleSchema.optional(),
});

export const plannerChatOutputSchema = z.object({
  reply: z.string().min(1),
  updatedPlan: sprintPlanSchema.nullable(),
});

export const inspectorTurnOutputSchema = z.object({
  reply: z.string().min(1),
  insightsToSave: z
    .array(
      z.object({
        content: z.string().min(1),
        tags: z.array(z.string()).default([]),
        source: epicMemorySourceSchema,
      }),
    )
    .default([]),
});

// ── EpicSnapshot schema ──────────────────────────────────────────────

export const epicSnapshotSchema = z.object({
  id: z.string().min(1),
  orgId: z.string(),
  boardId: z.string(),
  epicTicketId: z.string(),
  draftId: z.string().nullable(),
  createdAt: z.string(),
  createdBy: z.string().nullable(),
  transcript: z.array(brainstormTurnSchema).default([]),
  blueprintTranscript: z.array(brainstormTurnSchema).default([]),
  brainstormSummary: brainstormSummarySchema.nullable(),
  backlog: backlogProposalSchema.nullable(),
  plannerTranscript: z.array(brainstormTurnSchema).default([]),
  sprintPlan: sprintPlanSchema.nullable(),
  planningSprints: z.array(sprintSnapshotSchema).default([]),
  planningMembers: z.array(memberSnapshotSchema).default([]),
  ticketIds: z.array(z.string()).default([]),
});

// ── Phase 5 Inspector schemas ────────────────────────────────────────

export const inspectorTurnSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "inspector"]),
  text: z.string(),
  createdAt: z.string(),
  authorId: z.string().nullish(),
  authorName: z.string().nullish(),
});

export const inspectorTranscriptSchema = z.object({
  id: z.string().min(1),
  orgId: z.string(),
  epicSnapshotId: z.string().min(1),
  turns: z.array(inspectorTurnSchema).default([]),
  updatedAt: z.string(),
});

export const epicMemorySchema = z.object({
  id: z.string().min(1),
  orgId: z.string(),
  epicSnapshotId: z.string().min(1),
  content: z.string().min(1),
  tags: z.array(z.string()).default([]),
  source: z.enum(["chat", "ticketEvolution"]),
  createdAt: z.string(),
});

export const epicDraftSchema = z.object({
  id: z.string().min(1),
  orgId: z.string(),
  boardId: z.string(),
  authorId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  phase: z.enum([
    "phase1Brainstorming",
    "phase2Structuring",
    "phase3Refining",
    "phase4SprintPlanning",
    "committing",
    "committed",
    "abandoned",
  ]),
  transcript: z.array(brainstormTurnSchema),
  blueprintTranscript: z.array(brainstormTurnSchema).default([]),
  brainstormSummary: brainstormSummarySchema.nullable(),
  backlog: backlogProposalSchema.nullable(),
  refinementCursor: z.number().int().min(0),
  sprintPlan: sprintPlanSchema.nullable().default(null),
  plannerTranscript: z.array(brainstormTurnSchema).default([]),
  planningSprints: z.array(sprintSnapshotSchema).default([]),
  planningMembers: z.array(memberSnapshotSchema).default([]),
  lastSeenAt: z.string(),
});

// ── Constructors / pure helpers ──────────────────────────────────────

export function createEmptyDraft(args: {
  id: DraftId;
  orgId: string;
  boardId: string;
  authorId: string;
  now: string;
}): EpicDraft {
  return {
    id: args.id,
    orgId: args.orgId,
    boardId: args.boardId,
    authorId: args.authorId,
    createdAt: args.now,
    updatedAt: args.now,
    phase: "phase1Brainstorming",
    transcript: [],
    blueprintTranscript: [],
    brainstormSummary: null,
    backlog: null,
    refinementCursor: 0,
    sprintPlan: null,
    plannerTranscript: [],
    planningSprints: [],
    planningMembers: [],
    lastSeenAt: args.now,
  };
}

export function draftDisplayTitle(draft: EpicDraft): string {
  if (draft.backlog?.epicTitle) return draft.backlog.epicTitle;
  const firstUserTurn = draft.transcript.find((t) => t.role === "user");
  if (firstUserTurn) {
    const trimmed = firstUserTurn.text.trim().slice(0, 60);
    return trimmed.length > 0 ? trimmed : "Untitled draft";
  }
  return "Untitled draft";
}

export function isTerminalPhase(phase: OrchestratorPhase): boolean {
  return phase === "committed" || phase === "abandoned";
}

/**
 * Render a single AC as a one-paragraph string.
 * Gherkin AC: "GIVEN … WHEN … [AND …] THEN …" with optional "Scenario: title" prefix.
 * Narrative AC: free text as-is.
 *
 * Used at commit time to compose `Ticket.description` from structured AC, and
 * by the Phase 3 read-only renderer.
 */
export function renderAcceptanceCriterion(ac: AcceptanceCriterion): string {
  if (ac.kind === "narrative") return ac.text;
  const head = ac.title ? `Scenario: ${ac.title}\n` : "";
  const andClause = ac.and ? ` AND ${ac.and}` : "";
  return `${head}GIVEN ${ac.given}, WHEN ${ac.when}${andClause}, THEN ${ac.outcome}`;
}

/**
 * Compose a ticket's description block with its structured AC appended as a
 * markdown list. Returns `description` as-is when there are no structured AC
 * — back-compat path for legacy proposals that still have AC embedded inline.
 */
export function composeDescriptionWithAcceptanceCriteria(
  description: string,
  acceptanceCriteria: AcceptanceCriterion[] | undefined,
): string {
  if (!acceptanceCriteria || acceptanceCriteria.length === 0) return description;
  const rendered = acceptanceCriteria
    .map((ac) => `- ${renderAcceptanceCriterion(ac)}`)
    .join("\n");
  const body = description.trim();
  const sep = body.length ? "\n\n" : "";
  return `${body}${sep}## Acceptance Criteria\n${rendered}`;
}
