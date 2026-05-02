export const typeDefs = /* GraphQL */ `
  enum BoardType { scrum kanban task }
  enum HierarchyType { epic story task }
  enum Priority { low medium high }
  enum BoardRole { member admin }
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
    linkedTicketIds: [ID!]!
    assigneeIds: [ID!]!
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
    linkedTicketIds: [ID!]
    assigneeIds: [ID!]
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
  }
`;
