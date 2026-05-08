export type BoardId = string;
export type TicketId = string;
export type ColumnId = string;

export type TicketHierarchyType = "epic" | "story" | "task";
export type UserRole = "member" | "admin";

export interface BoardColumn {
  id: ColumnId;
  orgId: string;
  boardId: BoardId;
  name: string;
  states: string[];
  color: string;
  order: number;
  /**
   * Marks this column as terminal — tickets here count as "done."
   * Drives velocity, drift completion %, and sprint rollover.
   * Invariant: every board must have ≥1 column with `isDone: true`.
   */
  isDone: boolean;
  /** Cannot be deleted by the user — set on the default To Do and Done columns. Defaults false. */
  protected?: boolean;
}

export interface Board {
  id: BoardId;
  orgId: string;
  name: string;
  type: "scrum" | "kanban" | "task";
  /** ISO-8601 string when soft-deleted. Null/undefined while active. */
  deletedAt?: string | null;
}

export interface Ticket {
  id: TicketId;
  orgId: string;
  ticketNumber: string;
  boardId: BoardId;
  columnId: ColumnId;
  hierarchyType: TicketHierarchyType;
  parentTicketId: TicketId | null;
  title: string;
  description: string;
  label: string;
  fixVersion: string;
  storyPoints: 1 | 2 | 3 | 5 | 8 | 13;
  workflowState: string;
  priority: "low" | "medium" | "high";
  linkedTicketIds: TicketId[];
  assigneeIds: string[];
  /** Sprints this ticket belongs to. A ticket can be in multiple sprints. */
  sprintIds: string[];
  version: number;
}

export interface CreateTicketInput {
  boardId: BoardId;
  columnId: ColumnId;
  hierarchyType: TicketHierarchyType;
  parentTicketId: TicketId | null;
  title: string;
  description: string;
  label: string;
  fixVersion: string;
  workflowState: string;
  priority: "low" | "medium" | "high";
  storyPoints: 1 | 2 | 3 | 5 | 8 | 13;
  assigneeIds?: string[];
  sprintIds?: string[];
}

export interface BoardMember {
  orgId: string;
  boardId: BoardId;
  userId: string;
  role: UserRole;
  addedAt: string;
}

export interface OrgMember {
  userId: string;
  fullName: string;
  imageUrl: string | null;
  emailAddress: string | null;
  /** Functional planning role — set by PO/admin in org settings. */
  role?: OrgMemberRole;
}

/** Functional role used for capacity planning and persona-based estimation. */
export type OrgMemberRole = "developer" | "ux" | "tester" | "po";

export interface Sprint {
  id: string;
  orgId: string;
  boardId: string;
  /** Auto-generated as `{boardName} {N}` on creation; PO can rename. */
  name: string;
  /** Free-form planning notes. */
  description: string;
  /** One-line "north star" deliverable shown in the active-sprint header. */
  goal: string;
  startDate: string;
  endDate: string;
  /** Total story-point budget for this sprint across all assignees. */
  capacityPoints: number;
  status: "planning" | "active" | "completed";
  /**
   * Snapshot of "done" story points at the moment status flipped to `completed`.
   * Used for velocity calculation; absent on planning/active sprints.
   */
  completedPoints?: number;
}

export interface SprintAssignment {
  id: string;
  orgId: string;
  sprintId: string;
  userId: string;
  /** Available working hours for this person in this sprint. */
  availableHours: number;
}

/**
 * Immutable baseline snapshot of an AI-generated Epic plan.
 * Created when the Orchestrator first executes on an Epic.
 * Used by drift detection to diff "what was planned" vs "current state."
 */
export interface EpicSnapshot {
  id: string;
  orgId: string;
  epicTicketId: string;
  createdAt: string;
  /** JSON-encoded plan: ticket proposals, role assignments, sprint allocation. */
  planJson: string;
}

export interface Comment {
  id: string;
  orgId: string;
  ticketId: TicketId;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export type HistoryEntryKind =
  | "created"
  | "updated"
  | "assignee_added"
  | "assignee_removed"
  | "commented"
  | "comment_edited"
  | "comment_deleted";

export interface HistoryFieldChange {
  field: string;
  from: string | null;
  to: string | null;
}

export interface TicketHistoryEntry {
  id: string;
  orgId: string;
  ticketId: TicketId;
  actorId: string;
  timestamp: string;
  kind: HistoryEntryKind;
  changes: HistoryFieldChange[];
}

export interface ReleaseVersion {
  id: string;
  orgId: string;
  boardId: string;
  name: string;
  releaseDate: string;
}

export type ActiveModal =
  | "none"
  | "ticket"
  | "createTicket"
  | "orchestrator"
  | "search"
  | "createVersion";

export interface AnalystMachineContext {
  boards: Board[];
  boardColumns: BoardColumn[];
  tickets: Ticket[];
  activeBoardId: BoardId | null;
  selectedTicketId: TicketId | null;
  activeModal: ActiveModal;
  createTicketLinkSourceId: TicketId | null;
  releaseVersions: ReleaseVersion[];
  currentUserRole: UserRole;
  labels: string[];
}

/** Result of comparing an EpicSnapshot against the current board state. */
export interface DriftReport {
  epicTicketId: string;
  snapshotCreatedAt: string;
  /** Tickets in snapshot but no longer on the board. */
  removedTickets: Array<{ id: string; title: string }>;
  /** Tickets on the board not in the original snapshot. */
  addedTickets: Array<{ id: string; title: string }>;
  /** Tickets whose key fields changed since the snapshot. */
  changedTickets: Array<{ id: string; title: string; changedFields: string[] }>;
  /** 0–100: what percent of snapshot tickets are in a done-like state. */
  completionPercent: number;
  hasDrift: boolean;
}

export type SeedBoard = Omit<Board, "orgId">;
export type SeedBoardColumn = Omit<BoardColumn, "orgId" | "order">;
export type SeedTicket = Omit<Ticket, "orgId" | "version" | "assigneeIds">;

export interface AnalystSeedData {
  boards: SeedBoard[];
  boardColumns: SeedBoardColumn[];
  tickets: SeedTicket[];
}

export const DEFAULT_LABELS: string[] = [
  "backend",
  "frontend",
  "security",
  "infra",
  "ux",
  "qa",
  "devops",
  "api",
  "ai",
  "planning",
  "coordination",
  "analysis",
  "observability",
  "mlops",
];

export const DEFAULT_RELEASE_VERSIONS: Array<Pick<ReleaseVersion, "id" | "name" | "releaseDate">> = [
  { id: "version-1", name: "v1.1.0", releaseDate: "2026-06-15" },
  { id: "version-2", name: "v1.2.0", releaseDate: "2026-07-31" },
  { id: "version-3", name: "v1.3.0", releaseDate: "2026-09-10" },
];

export const DEFAULT_COLUMN_DEFINITIONS: Array<Pick<BoardColumn, "name" | "states" | "isDone">> = [
  { name: "Backlog", states: ["backlog"], isDone: false },
  { name: "To Do", states: ["todo"], isDone: false },
  { name: "In Progress", states: ["inProgress"], isDone: false },
  { name: "In Review", states: ["inReview"], isDone: false },
  { name: "In QA", states: ["inQa"], isDone: false },
  { name: "Ready", states: ["ready"], isDone: true },
];
