import { gql } from "@apollo/client";

// ─── Fragments ───────────────────────────────────────────────────────────────

export const BOARD_FIELDS = gql`
  fragment BoardFields on Board {
    id
    name
    type
  }
`;

export const COLUMN_FIELDS = gql`
  fragment ColumnFields on BoardColumn {
    id
    boardId
    name
    states
    color
  }
`;

export const TICKET_FIELDS = gql`
  fragment TicketFields on Ticket {
    id
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
  }
`;

export const VERSION_FIELDS = gql`
  fragment VersionFields on ReleaseVersion {
    id
    name
    releaseDate
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

export const GET_BOARD_COLUMNS = gql`
  ${COLUMN_FIELDS}
  query GetBoardColumns($boardId: ID!) {
    boardColumns(boardId: $boardId) {
      ...ColumnFields
    }
  }
`;

export const GET_TICKETS = gql`
  ${TICKET_FIELDS}
  query GetTickets($boardId: ID!) {
    tickets(boardId: $boardId) {
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

// ─── Mutations ────────────────────────────────────────────────────────────────

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

export const CREATE_TICKET = gql`
  ${TICKET_FIELDS}
  mutation CreateTicket($input: CreateTicketInput!) {
    createTicket(input: $input) {
      ...TicketFields
    }
  }
`;

export const UPDATE_TICKET = gql`
  ${TICKET_FIELDS}
  mutation UpdateTicket($id: ID!, $input: UpdateTicketInput!) {
    updateTicket(id: $id, input: $input) {
      ...TicketFields
    }
  }
`;

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
