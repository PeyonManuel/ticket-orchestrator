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

export interface OrchestratorSuggestion {
  id: string;
  summary: string;
  riskLevel: "low" | "medium" | "high";
  suggestedAction: "accept" | "revise" | "deScope";
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

export interface AiOrchestratorContext {
  requirement: string;
  refinementDraft: string | null;
  planDraft: string | null;
  controllerAlert: string | null;
  suggestion: OrchestratorSuggestion | null;
  rejectionReason: string | null;
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

export const DEFAULT_COLUMN_DEFINITIONS: Array<Pick<BoardColumn, "name" | "states">> = [
  { name: "Backlog", states: ["backlog"] },
  { name: "To Do", states: ["todo"] },
  { name: "In Progress", states: ["inProgress"] },
  { name: "In Review", states: ["inReview"] },
  { name: "In QA", states: ["inQa"] },
  { name: "Ready", states: ["ready"] },
];
