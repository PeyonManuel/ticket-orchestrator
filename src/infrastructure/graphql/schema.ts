export const typeDefs = /* GraphQL */ `
  enum BoardType { scrum kanban task }
  enum HierarchyType { epic story task }
  enum Priority { low medium high }
  enum BoardRole { member admin }
  enum OrgMemberRole { developer ux tester po }
  enum SprintStatus { planning active completed }
  enum HistoryEntryKind {
    created
    updated
    assignee_added
    assignee_removed
    commented
    comment_edited
    comment_deleted
  }

  type Board {
    id: ID!
    orgId: ID!
    name: String!
    type: BoardType!
    """ISO-8601 timestamp set when the board was archived. null on active boards. Archived boards are auto-purged after 30 days."""
    deletedAt: String
  }

  type BoardColumn {
    id: ID!
    orgId: ID!
    boardId: ID!
    name: String!
    states: [String!]!
    color: String!
    order: Int!
    """Tickets in a column with isDone=true count as completed for velocity, drift, and rollover."""
    isDone: Boolean!
    """Protected columns cannot be deleted (e.g. the default To Do and Done columns)."""
    protected: Boolean!
  }

  type BoardMember {
    orgId: ID!
    boardId: ID!
    userId: ID!
    role: BoardRole!
    addedAt: String!
  }

  type Ticket {
    id: ID!
    orgId: ID!
    ticketNumber: String!
    boardId: ID!
    columnId: ID!
    hierarchyType: HierarchyType!
    parentTicketId: ID
    title: String!
    description: String!
    label: String!
    fixVersion: String!
    storyPoints: Int!
    workflowState: String!
    priority: Priority!
    """Typed dependency / documentation links to other tickets."""
    links: [TicketLink!]!
    assigneeIds: [ID!]!
    """Sprints this ticket is part of. Tickets can live in multiple sprints."""
    sprintIds: [ID!]!
    version: Int!
    """Comments resolved via DataLoader (no N+1)."""
    comments: [Comment!]!
    """Audit trail of every change. Newest first."""
    history: [TicketHistoryEntry!]!
  }

  type Comment {
    id: ID!
    orgId: ID!
    ticketId: ID!
    authorId: ID!
    body: String!
    createdAt: String!
    updatedAt: String!
  }

  type HistoryFieldChange {
    field: String!
    from: String
    to: String
  }

  type TicketHistoryEntry {
    id: ID!
    orgId: ID!
    ticketId: ID!
    actorId: ID!
    timestamp: String!
    kind: HistoryEntryKind!
    changes: [HistoryFieldChange!]!
  }

  type ReleaseVersion {
    id: ID!
    orgId: ID!
    boardId: ID!
    name: String!
    releaseDate: String!
  }

  """A member of the active Clerk organization. Used to populate assignee pickers."""
  type OrgMember {
    userId: ID!
    fullName: String!
    imageUrl: String
    emailAddress: String
    """Functional planning role (developer/designer/qa/po/admin). Set by PO/admin in org settings."""
    role: OrgMemberRole
  }

  type Sprint {
    id: ID!
    orgId: ID!
    boardId: ID!
    name: String!
    description: String!
    """One-line goal — anchors the sprint to a deliverable."""
    goal: String!
    startDate: String!
    endDate: String!
    capacityPoints: Int!
    status: SprintStatus!
    """SP completed at the moment status flipped to 'completed'. Absent on planning/active sprints."""
    completedPoints: Int
  }

  type SprintAssignment {
    id: ID!
    orgId: ID!
    sprintId: ID!
    userId: ID!
    availableHours: Float!
  }

  """Immutable record of a committed Epic. One per Epic, written once at Phase 4 commit, never mutated. Captures the frozen 4-phase artifacts and back-refs to the live Ticket records created from this Epic."""
  type EpicSnapshot {
    id: ID!
    orgId: ID!
    boardId: ID!
    epicTicketId: ID!
    """Source draft this snapshot was committed from."""
    draftId: ID
    createdAt: String!
    """User id of the PO who pressed Commit."""
    createdBy: ID
    # Frozen 4-phase artifacts:
    transcript: [BrainstormTurn!]!
    blueprintTranscript: [BrainstormTurn!]!
    brainstormSummary: BrainstormSummary
    backlog: BacklogProposal
    plannerTranscript: [BrainstormTurn!]!
    sprintPlan: SprintPlan
    planningSprints: [SprintSnapshot!]!
    planningMembers: [MemberSnapshot!]!
    """Back-refs to live Ticket records created at commit (epic + children)."""
    ticketIds: [ID!]!
  }

  """Lightweight projection of EpicSnapshot for picker / list views."""
  type EpicSnapshotIndexEntry {
    id: ID!
    epicTicketId: ID!
    boardId: ID!
    title: String!
    createdAt: String!
    createdBy: ID
    """Total tickets (epic + children) created at commit."""
    ticketCount: Int!
  }

  # ── Orchestrator drafts ───────────────────────────────────────────────
  enum OrchestratorPhase {
    phase1Brainstorming
    phase2Structuring
    phase3Refining
    phase4SprintPlanning
    committing
    committed
    abandoned
  }
  enum BrainstormRole { user analyst }
  enum ProposalLabel {
    developer ux qa po
  }
  enum ProposalHierarchyType { story task }

  """Kind of link between two tickets / proposals. Drives dependency reasoning + UI semantics."""
  enum LinkKind { blockedBy relatedTo duplicates }

  """Pre-commit dependency between two proposals within the same draft."""
  type ProposalDependency {
    kind: LinkKind!
    targetProposalId: ID!
  }

  input ProposalDependencyInput {
    kind: LinkKind!
    targetProposalId: ID!
  }

  type BrainstormTurn {
    id: ID!
    role: BrainstormRole!
    text: String!
    createdAt: String!
    authorId: String
    authorName: String
  }

  type BrainstormSummary {
    summary: String!
    goals: [String!]!
  }

  type TicketProposal {
    id: ID!
    hierarchyType: ProposalHierarchyType!
    title: String!
    oneLiner: String!
    description: String!
    label: ProposalLabel!
    acceptanceCriteria: [String!]!
    """null until the Controller has refined this ticket."""
    storyPoints: Int
    risks: [String!]!
    refined: Boolean!
    """Per-ticket refinement chat with the AI in Phase 3."""
    transcript: [BrainstormTurn!]!
    """Functional discipline — drives Phase 4 capacity matching. Same enum as MemberSnapshot.role."""
    discipline: OrgMemberRole
    """Within-draft dependency edges. blockedBy participates in topo-sort during Phase 4."""
    dependencies: [ProposalDependency!]
  }

  type BacklogProposal {
    epicTitle: String!
    epicDescription: String!
    tickets: [TicketProposal!]!
  }

  """Persistent in-flight Epic draft. Never commits to the board until COMMIT_EPIC."""
  type EpicDraft {
    id: ID!
    orgId: ID!
    boardId: ID!
    authorId: ID!
    createdAt: String!
    updatedAt: String!
    phase: OrchestratorPhase!
    transcript: [BrainstormTurn!]!
    """Phase 2 refinement chat between PO and AI about the backlog structure."""
    blueprintTranscript: [BrainstormTurn!]!
    brainstormSummary: BrainstormSummary
    backlog: BacklogProposal
    refinementCursor: Int!
    sprintPlan: SprintPlan
    plannerTranscript: [BrainstormTurn!]!
    planningSprints: [SprintSnapshot!]!
    planningMembers: [MemberSnapshot!]!
    lastSeenAt: String!
  }

  type CommitEpicDraftResult {
    epicTicketId: ID!
    createdTicketIds: [ID!]!
    snapshotId: ID!
  }

  type TicketAssignment {
    ticketId: ID!
    sprintId: ID
    assigneeUserId: ID
  }

  """Records that the planner honored the buffer rule (e.g. 80%) when producing the plan."""
  type SprintPlanBufferRule {
    percent: Float!
    applied: Boolean!
  }

  input SprintPlanBufferRuleInput {
    percent: Float!
    applied: Boolean!
  }

  type ProposedSprint {
    id: ID!
    name: String!
    startDate: String!
    endDate: String!
    capacityPoints: Int!
  }

  input ProposedSprintInput {
    id: ID!
    name: String!
    startDate: String!
    endDate: String!
    capacityPoints: Int!
  }

  type SprintPlan {
    assignments: [TicketAssignment!]!
    reasoning: String!
    """Tickets that didn't fit at the buffer rule and are sliding to a later sprint."""
    overflow: [TicketProposal!]
    """New sprints the planner suggests creating to accommodate overflow."""
    proposedSprints: [ProposedSprint!]
    """Buffer policy applied during planning. Populated by Slice B's slicingPolicy."""
    bufferRule: SprintPlanBufferRule
  }

  type SprintSnapshot {
    id: ID!
    name: String!
    startDate: String!
    endDate: String!
    capacityPoints: Int!
    status: String!
  }

  type MemberSnapshot {
    userId: ID!
    fullName: String!
    role: OrgMemberRole!
  }

  """Lightweight draft listing entry — used by the resume picker."""
  type EpicDraftIndexEntry {
    id: ID!
    title: String!
    phase: OrchestratorPhase!
    updatedAt: String!
  }

  # ── Typed ticket links ───────────────────────────────────────────────
  """Typed link between two live Tickets — populates Ticket.links (replaced legacy linkedTicketIds)."""
  type TicketLink {
    kind: LinkKind!
    targetTicketId: ID!
  }

  input TicketLinkInput {
    kind: LinkKind!
    targetTicketId: ID!
  }

  # ── Phase 5 Inspector ─────────────────────────────────────────────────
  enum InspectorTurnRole { user inspector }

  type InspectorTurn {
    id: ID!
    role: InspectorTurnRole!
    text: String!
    createdAt: String!
    authorId: String
    authorName: String
  }

  input InspectorTurnInput {
    id: ID!
    role: InspectorTurnRole!
    text: String!
    createdAt: String!
    authorId: String
    authorName: String
  }

  """Per-Epic chat transcript that persists across all Phase 5 sessions. One per epicSnapshotId."""
  type InspectorTranscript {
    id: ID!
    orgId: ID!
    epicSnapshotId: ID!
    turns: [InspectorTurn!]!
    updatedAt: String!
  }

  enum EpicMemorySource { chat ticketEvolution }

  """AI-curated insight about a committed Epic. Append-only, written by the Inspector via saveInsight."""
  type EpicMemory {
    id: ID!
    orgId: ID!
    epicSnapshotId: ID!
    content: String!
    tags: [String!]!
    source: EpicMemorySource!
    createdAt: String!
  }

  input SaveEpicMemoryInput {
    epicSnapshotId: ID!
    content: String!
    tags: [String!]!
    source: EpicMemorySource!
  }

  input BrainstormTurnInput {
    id: ID!
    role: BrainstormRole!
    text: String!
    createdAt: String!
    authorId: String
    authorName: String
  }

  input BrainstormSummaryInput {
    summary: String!
    goals: [String!]!
  }

  input TicketProposalInput {
    id: ID!
    hierarchyType: ProposalHierarchyType!
    title: String!
    oneLiner: String!
    description: String!
    label: ProposalLabel!
    acceptanceCriteria: [String!]!
    storyPoints: Int
    risks: [String!]!
    refined: Boolean!
    transcript: [BrainstormTurnInput!]!
    discipline: OrgMemberRole
    dependencies: [ProposalDependencyInput!]
  }

  input BacklogProposalInput {
    epicTitle: String!
    epicDescription: String!
    tickets: [TicketProposalInput!]!
  }

  input TicketAssignmentInput {
    ticketId: ID!
    sprintId: ID
    assigneeUserId: ID
  }

  input SprintPlanInput {
    assignments: [TicketAssignmentInput!]!
    reasoning: String!
    overflow: [TicketProposalInput!]
    proposedSprints: [ProposedSprintInput!]
    bufferRule: SprintPlanBufferRuleInput
  }

  input SprintSnapshotInput {
    id: ID!
    name: String!
    startDate: String!
    endDate: String!
    capacityPoints: Int!
    status: String!
  }

  input MemberSnapshotInput {
    userId: ID!
    fullName: String!
    role: OrgMemberRole!
  }

  input SaveEpicDraftInput {
    id: ID!
    boardId: ID!
    authorId: ID!
    createdAt: String!
    phase: OrchestratorPhase!
    transcript: [BrainstormTurnInput!]!
    blueprintTranscript: [BrainstormTurnInput!]!
    brainstormSummary: BrainstormSummaryInput
    backlog: BacklogProposalInput
    refinementCursor: Int!
    sprintPlan: SprintPlanInput
    plannerTranscript: [BrainstormTurnInput!]!
    planningSprints: [SprintSnapshotInput!]!
    planningMembers: [MemberSnapshotInput!]!
    lastSeenAt: String!
  }

  # ── Cursor pagination for tickets ────────────────────────────────────
  # Stable, concurrent-write-safe (unlike offset pagination).
  type PageInfo {
    endCursor: String
    hasNextPage: Boolean!
  }

  type TicketEdge {
    cursor: String!
    node: Ticket!
  }

  type TicketConnection {
    edges: [TicketEdge!]!
    pageInfo: PageInfo!
  }

  # ── Conflict result for optimistic concurrency ───────────────────────
  type ConflictError {
    """Server's current truth — render a PR-style diff against the user's edits."""
    currentState: Ticket!
    """Field names that diverge from the user's submission."""
    conflictedFields: [String!]!
    message: String!
  }

  union UpdateTicketResult = Ticket | ConflictError

  type Query {
    """Active (non-archived) boards for the current tenant."""
    boards: [Board!]!
    """Archived boards, newest deletion first. Admin-only. Used by the Trash UI."""
    archivedBoards: [Board!]!
    boardColumns(boardId: ID!): [BoardColumn!]!
    tickets(boardId: ID!, first: Int = 50, after: String): TicketConnection!
    ticket(id: ID!): Ticket
    """Looks up a ticket by its human-readable number (e.g. OR-42). Index-backed O(1)."""
    ticketByNumber(ticketNumber: String!): Ticket
    ticketHistory(ticketId: ID!): [TicketHistoryEntry!]!
    releaseVersions(boardId: ID!): [ReleaseVersion!]!
    boardMembers(boardId: ID!): [BoardMember!]!
    """All labels available to the org (union of seed labels + user-created)."""
    labels: [String!]!
    """Members of the current Clerk organization. Used as the assignee pool."""
    orgMembers: [OrgMember!]!
    sprints(boardId: ID!): [Sprint!]!
    sprintAssignments(sprintId: ID!): [SprintAssignment!]!
    epicSnapshot(epicTicketId: ID!): EpicSnapshot
    """Hydrate a single committed-Epic snapshot by id."""
    epicSnapshotById(id: ID!): EpicSnapshot
    """Committed Epics on a board, newest first. Sourced from EpicSnapshot."""
    committedEpics(boardId: ID!): [EpicSnapshotIndexEntry!]!
    """In-flight Epic drafts on a board, newest activity first."""
    epicDrafts(boardId: ID!): [EpicDraftIndexEntry!]!
    """Hydrate a single draft by id."""
    epicDraft(id: ID!): EpicDraft
    """Phase 5 chat transcript for a committed Epic. Null until the first turn lands."""
    inspectorTranscript(epicSnapshotId: ID!): InspectorTranscript
    """AI-curated insights for a committed Epic, newest first."""
    epicMemories(epicSnapshotId: ID!): [EpicMemory!]!
  }

  input CreateBoardInput { name: String!, type: BoardType }

  input CreateColumnInput {
    boardId: ID!
    name: String!
    states: [String!]!
    color: String!
  }

  input UpdateColumnInput {
    name: String
    states: [String!]
    color: String
    isDone: Boolean
  }

  input CreateTicketInput {
    boardId: ID!
    columnId: ID!
    hierarchyType: HierarchyType!
    parentTicketId: ID
    title: String!
    description: String!
    label: String!
    fixVersion: String!
    workflowState: String!
    priority: Priority!
    storyPoints: Int!
    assigneeIds: [ID!]
  }

  input UpdateTicketInput {
    columnId: ID
    workflowState: String
    title: String
    description: String
    label: String
    fixVersion: String
    priority: Priority
    storyPoints: Int
    links: [TicketLinkInput!]
    assigneeIds: [ID!]
    sprintIds: [ID!]
    hierarchyType: HierarchyType
    parentTicketId: ID
    """The version the client last observed. Required for optimistic concurrency."""
    expectedVersion: Int!
  }

  type Mutation {
    createBoard(input: CreateBoardInput!): Board!
    """Soft-delete a board. Admin-only. Tickets/columns are hidden until restored or purged after 30 days."""
    archiveBoard(id: ID!): Board!
    """Restore a soft-deleted board. Admin-only."""
    restoreBoard(id: ID!): Board!
    """Immediately hard-delete an archived board and cascade all children. Admin-only. Irreversible."""
    purgeBoard(id: ID!): Boolean!
    createColumn(input: CreateColumnInput!): BoardColumn!
    updateColumn(id: ID!, input: UpdateColumnInput!): BoardColumn
    deleteColumn(id: ID!): Boolean!
    reorderColumns(boardId: ID!, orderedIds: [ID!]!): Boolean!

    createTicket(input: CreateTicketInput!): Ticket!
    updateTicket(id: ID!, input: UpdateTicketInput!): UpdateTicketResult!

    addComment(ticketId: ID!, body: String!): Comment!
    editComment(commentId: ID!, body: String!): Comment
    deleteComment(commentId: ID!): Boolean!

    addBoardMember(boardId: ID!, userId: ID!, role: BoardRole!): BoardMember!
    removeBoardMember(boardId: ID!, userId: ID!): Boolean!

    createVersion(boardId: ID!, name: String!, releaseDate: String!): ReleaseVersion!
    deleteVersion(id: ID!): Boolean!

    """Add a new label to the org-scoped label vocabulary. Idempotent."""
    addLabel(label: String!): String!

    createSprint(input: CreateSprintInput!): Sprint!
    updateSprint(id: ID!, input: UpdateSprintInput!): Sprint
    deleteSprint(id: ID!): Boolean!

    upsertSprintAssignment(input: UpsertSprintAssignmentInput!): SprintAssignment!
    removeSprintAssignment(sprintId: ID!, userId: ID!): Boolean!

    """Set (or clear) the functional planning role for an org member."""
    setMemberRole(userId: ID!, role: OrgMemberRole): Boolean!

    """Create a fresh empty Epic draft scoped to the active org and given board."""
    createEpicDraft(boardId: ID!): EpicDraft!
    """Persist the full draft state. The orchestrator machine is the single writer."""
    saveEpicDraft(input: SaveEpicDraftInput!): EpicDraft!
    """Soft-delete a draft. Removes it from the resume picker but keeps the audit trail."""
    deleteEpicDraft(id: ID!): Boolean!
    """Commit an Epic draft to the board: creates the Epic ticket, all child tickets, and an EpicSnapshot. Returns IDs of everything created."""
    commitEpicDraft(draftId: ID!): CommitEpicDraftResult!

    """Append a turn to the Phase 5 transcript for a committed Epic. Lazily creates the transcript document on the first call."""
    appendInspectorTurn(epicSnapshotId: ID!, turn: InspectorTurnInput!): InspectorTranscript!
    """Write a new EpicMemory record. Append-only; called by the Inspector via the saveInsight tool."""
    saveEpicMemory(input: SaveEpicMemoryInput!): EpicMemory!
  }

  input CreateSprintInput {
    boardId: ID!
    """Optional — server auto-generates '{boardName} {N}' when omitted."""
    name: String
    description: String
    goal: String
    startDate: String!
    endDate: String!
    capacityPoints: Int
  }

  input UpdateSprintInput {
    name: String
    description: String
    goal: String
    startDate: String
    endDate: String
    capacityPoints: Int
    status: SprintStatus
  }

  input UpsertSprintAssignmentInput {
    sprintId: ID!
    userId: ID!
    availableHours: Float!
  }
`;
