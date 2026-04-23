export type BoardId = string;
export type TicketId = string;
export type ColumnId = string;

export type TicketHierarchyType = "epic" | "story" | "task";
export type UserRole = "member" | "admin";

export interface BoardColumn {
  id: ColumnId;
  boardId: BoardId;
  name: string;
  states: string[];
  color: string;
}

export interface Board {
  id: BoardId;
  name: string;
  type: "scrum" | "kanban" | "task";
}

export interface Ticket {
  id: TicketId;
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
}

export interface ReleaseVersion {
  id: string;
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

export interface AnalystSeedData {
  boards: Board[];
  boardColumns: BoardColumn[];
  tickets: Ticket[];
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

export const DEFAULT_RELEASE_VERSIONS: ReleaseVersion[] = [
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
