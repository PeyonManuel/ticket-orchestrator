import { gql } from "@apollo/client";

// ─── Fragments ───────────────────────────────────────────────────────────────

export const BOARD_FIELDS = gql`
  fragment BoardFields on Board {
    id
    orgId
    name
    type
    deletedAt
  }
`;

export const COLUMN_FIELDS = gql`
  fragment ColumnFields on BoardColumn {
    id
    orgId
    boardId
    name
    states
    color
    order
  }
`;

export const TICKET_FIELDS = gql`
  fragment TicketFields on Ticket {
    id
    orgId
    ticketNumber
    boardId
    columnId
    hierarchyType
    parentTicketId
    title
    description
    label
    fixVersion
    storyPoints
    workflowState
    priority
    linkedTicketIds
    assigneeIds
    version
  }
`;

export const VERSION_FIELDS = gql`
  fragment VersionFields on ReleaseVersion {
    id
    orgId
    boardId
    name
    releaseDate
  }
`;

export const COMMENT_FIELDS = gql`
  fragment CommentFields on Comment {
    id
    orgId
    ticketId
    authorId
    body
    createdAt
    updatedAt
  }
`;

export const HISTORY_FIELDS = gql`
  fragment HistoryFields on TicketHistoryEntry {
    id
    orgId
    ticketId
    actorId
    timestamp
    kind
    changes {
      field
      from
      to
    }
  }
`;

// ─── Queries ─────────────────────────────────────────────────────────────────

export const GET_BOARDS = gql`
  ${BOARD_FIELDS}
  query GetBoards {
    boards {
      ...BoardFields
    }
  }
`;

export const GET_ARCHIVED_BOARDS = gql`
  ${BOARD_FIELDS}
  query GetArchivedBoards {
    archivedBoards {
      ...BoardFields
    }
  }
`;

export const GET_BOARD_COLUMNS = gql`
  ${COLUMN_FIELDS}
  query GetBoardColumns($boardId: ID!) {
    boardColumns(boardId: $boardId) {
      ...ColumnFields
    }
  }
`;

/**
 * Cursor-paginated tickets. Caller extracts `.tickets.edges.map(e => e.node)`.
 * `first` defaults to 50 server-side; pass higher values for export-style queries.
 */
export const GET_TICKETS = gql`
  ${TICKET_FIELDS}
  query GetTickets($boardId: ID!, $first: Int, $after: String) {
    tickets(boardId: $boardId, first: $first, after: $after) {
      edges {
        cursor
        node {
          ...TicketFields
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`;

export const GET_TICKET_BY_NUMBER = gql`
  ${TICKET_FIELDS}
  query GetTicketByNumber($ticketNumber: String!) {
    ticketByNumber(ticketNumber: $ticketNumber) {
      ...TicketFields
    }
  }
`;

export const GET_RELEASE_VERSIONS = gql`
  ${VERSION_FIELDS}
  query GetReleaseVersions($boardId: ID!) {
    releaseVersions(boardId: $boardId) {
      ...VersionFields
    }
  }
`;

export const GET_LABELS = gql`
  query GetLabels {
    labels
  }
`;

export const GET_ORG_MEMBERS = gql`
  query GetOrgMembers {
    orgMembers {
      userId
      fullName
      imageUrl
      emailAddress
    }
  }
`;

export const GET_TICKET_COMMENTS = gql`
  ${COMMENT_FIELDS}
  query GetTicketComments($ticketId: ID!) {
    ticket(id: $ticketId) {
      id
      comments {
        ...CommentFields
      }
    }
  }
`;

export const GET_TICKET_HISTORY = gql`
  ${HISTORY_FIELDS}
  query GetTicketHistory($ticketId: ID!) {
    ticketHistory(ticketId: $ticketId) {
      ...HistoryFields
    }
  }
`;

// ─── Board / Column Mutations ─────────────────────────────────────────────────

export const CREATE_BOARD = gql`
  ${BOARD_FIELDS}
  mutation CreateBoard($input: CreateBoardInput!) {
    createBoard(input: $input) {
      ...BoardFields
    }
  }
`;

export const ARCHIVE_BOARD = gql`
  ${BOARD_FIELDS}
  mutation ArchiveBoard($id: ID!) {
    archiveBoard(id: $id) {
      ...BoardFields
    }
  }
`;

export const RESTORE_BOARD = gql`
  ${BOARD_FIELDS}
  mutation RestoreBoard($id: ID!) {
    restoreBoard(id: $id) {
      ...BoardFields
    }
  }
`;

export const PURGE_BOARD = gql`
  mutation PurgeBoard($id: ID!) {
    purgeBoard(id: $id)
  }
`;

export const CREATE_COLUMN = gql`
  ${COLUMN_FIELDS}
  mutation CreateColumn($input: CreateColumnInput!) {
    createColumn(input: $input) {
      ...ColumnFields
    }
  }
`;

export const UPDATE_COLUMN = gql`
  ${COLUMN_FIELDS}
  mutation UpdateColumn($id: ID!, $input: UpdateColumnInput!) {
    updateColumn(id: $id, input: $input) {
      ...ColumnFields
    }
  }
`;

export const DELETE_COLUMN = gql`
  mutation DeleteColumn($id: ID!) {
    deleteColumn(id: $id)
  }
`;

export const REORDER_COLUMNS = gql`
  mutation ReorderColumns($boardId: ID!, $orderedIds: [ID!]!) {
    reorderColumns(boardId: $boardId, orderedIds: $orderedIds)
  }
`;

// ─── Ticket Mutations ─────────────────────────────────────────────────────────

export const CREATE_TICKET = gql`
  ${TICKET_FIELDS}
  mutation CreateTicket($input: CreateTicketInput!) {
    createTicket(input: $input) {
      ...TicketFields
    }
  }
`;

/**
 * Returns a union: Ticket on success, ConflictError when the user's
 * `expectedVersion` no longer matches the server. Client must inspect
 * `__typename` and either swap the cache value (success) or open the
 * conflict-resolution UI (ConflictError).
 */
export const UPDATE_TICKET = gql`
  ${TICKET_FIELDS}
  mutation UpdateTicket($id: ID!, $input: UpdateTicketInput!) {
    updateTicket(id: $id, input: $input) {
      __typename
      ... on Ticket {
        ...TicketFields
      }
      ... on ConflictError {
        currentState {
          ...TicketFields
        }
        conflictedFields
        message
      }
    }
  }
`;

// ─── Version Mutations ────────────────────────────────────────────────────────

export const CREATE_VERSION = gql`
  ${VERSION_FIELDS}
  mutation CreateVersion($boardId: ID!, $name: String!, $releaseDate: String!) {
    createVersion(boardId: $boardId, name: $name, releaseDate: $releaseDate) {
      ...VersionFields
    }
  }
`;

export const DELETE_VERSION = gql`
  mutation DeleteVersion($id: ID!) {
    deleteVersion(id: $id)
  }
`;

// ─── Comment Mutations ────────────────────────────────────────────────────────

export const ADD_COMMENT = gql`
  ${COMMENT_FIELDS}
  mutation AddComment($ticketId: ID!, $body: String!) {
    addComment(ticketId: $ticketId, body: $body) {
      ...CommentFields
    }
  }
`;

export const EDIT_COMMENT = gql`
  ${COMMENT_FIELDS}
  mutation EditComment($commentId: ID!, $body: String!) {
    editComment(commentId: $commentId, body: $body) {
      ...CommentFields
    }
  }
`;

export const DELETE_COMMENT = gql`
  mutation DeleteComment($commentId: ID!) {
    deleteComment(commentId: $commentId)
  }
`;

// ─── Label Mutation ──────────────────────────────────────────────────────────

export const ADD_LABEL = gql`
  mutation AddLabel($label: String!) {
    addLabel(label: $label)
  }
`;
