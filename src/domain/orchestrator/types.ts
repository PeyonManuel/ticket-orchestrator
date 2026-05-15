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
  description: string;
  label: ProposalLabel;
  acceptanceCriteria: string[];
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
  acceptanceCriteria: string[];
  storyPoints: ProposalStoryPoints;
  risks: string[];
}

export interface BlueprintChatInput {
  transcript: BrainstormTurn[];
  currentBacklog: BacklogProposal;
  userMessage: string;
}

export interface BlueprintChatOutput {
  reply: string;
}

export interface RefinementChatInput {
  transcript: BrainstormTurn[];
  ticket: TicketProposal;
  backlog: BacklogProposal;
  userMessage: string;
}

export interface RefinementChatOutput {
  reply: string;
}

// ── Phase 4 Sprint Planning ──────────────────────────────────────────

export interface SprintSnapshot {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  capacityPoints: number;
  status: "planning" | "active" | "completed";
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
 * A sprint the planner proposes to create on commit so the overflow can be
 * scheduled. `id` is a temporary client-generated UUID; the real sprint is
 * created server-side by `commitEpicDraft` which substitutes the real Mongo id
 * into the matching `TicketAssignment.sprintId` values.
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
  reasoning: string;
  /**
   * Tickets the planner couldn't fit even into the proposed sprints (truly
   * unschedulable, e.g. discipline missing entirely). Populated by slicingPolicy.
   */
  overflow?: TicketProposal[];
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

export interface DraftStore {
  list(): Promise<EpicDraftIndexEntry[]>;
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

export const ticketProposalSchema = z.object({
  id: z.string().min(1),
  hierarchyType: z.enum(["story", "task"]),
  title: z.string().min(1),
  oneLiner: z.string(),
  description: z.string(),
  label: proposalLabelSchema,
  acceptanceCriteria: z.array(z.string()),
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
});

export const backlogProposalSchema = z.object({
  epicTitle: z.string().min(1),
  epicDescription: z.string(),
  tickets: z.array(ticketProposalSchema).min(1),
});

export const analystTurnOutputSchema = z.object({
  reply: z.string().min(1),
  summary: brainstormSummarySchema.nullable(),
});

export const controllerOutputSchema = z.object({
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).min(1),
  storyPoints: proposalStoryPointsSchema,
  risks: z.array(z.string()),
});

const sprintSnapshotSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  capacityPoints: z.number(),
  status: z.enum(["planning", "active", "completed"]),
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
  reasoning: z.string(),
  // Slice A.1 additions — optional so existing plans still parse.
  overflow: z.array(ticketProposalSchema).optional(),
  proposedSprints: z.array(proposedSprintSchema).optional(),
  bufferRule: sprintPlanBufferRuleSchema.optional(),
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
