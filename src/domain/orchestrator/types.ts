/**
 * Orchestrator domain types — the JSON shape the LangGraph backend will eventually emit.
 * Keep in sync with the Pydantic models in the Python service.
 *
 * Architecture overview: docs/orchestrator/architecture.md
 */

import { z } from "zod";

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
}

export interface BrainstormSummary {
  /** One-paragraph "why and what" produced by the Analyst. */
  summary: string;
  /** Goals / success criteria the user agreed to. */
  goals: string[];
  /** Out-of-scope notes — protects the Architect from over-building. */
  outOfScope: string[];
}

// ── Phase 2/3 ────────────────────────────────────────────────────────

export type ProposalLabel =
  | "frontend"
  | "backend"
  | "qa"
  | "infra"
  | "ux"
  | "ai"
  | "api"
  | "devops"
  | "security"
  | "observability";

export type ProposalStoryPoints = 1 | 2 | 3 | 5 | 8 | 13;

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

export interface SprintPlan {
  assignments: TicketAssignment[];
  reasoning: string;
}

export interface PlannerInput {
  backlog: BacklogProposal;
  sprints: SprintSnapshot[];
  members: MemberSnapshot[];
}

export type PlannerOutput = SprintPlan;

export interface PlannerChatInput {
  plannerTranscript: BrainstormTurn[];
  currentPlan: SprintPlan;
  backlog: BacklogProposal;
  sprints: SprintSnapshot[];
  members: MemberSnapshot[];
  userMessage: string;
}

export interface PlannerChatOutput {
  reply: string;
  updatedPlan: SprintPlan | null;
}

// ── Persistence boundary ─────────────────────────────────────────────

export interface DraftStore {
  list(): Promise<EpicDraftIndexEntry[]>;
  load(id: DraftId): Promise<EpicDraft | null>;
  save(draft: EpicDraft): Promise<void>;
  remove(id: DraftId): Promise<void>;
}

// ── Zod schemas (validate AI / persisted payloads at boundaries) ─────

const proposalLabelSchema = z.enum([
  "frontend",
  "backend",
  "qa",
  "infra",
  "ux",
  "ai",
  "api",
  "devops",
  "security",
  "observability",
]);

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
});

export const brainstormSummarySchema = z.object({
  summary: z.string().min(1),
  goals: z.array(z.string()),
  outOfScope: z.array(z.string()),
});

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

const sprintPlanSchema = z.object({
  assignments: z.array(ticketAssignmentSchema),
  reasoning: z.string(),
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
