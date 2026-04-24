import type {
  AnalystMachineContext,
  BoardColumn,
  ColumnId,
  Ticket,
  TicketId,
} from "./types";

// ── Indexed lookup helpers (O(1) by id) ─────────────────────────────
// Cached per context slice identity via WeakMap so indices only rebuild
// when the underlying array reference changes (XState `assign` preserves
// references for untouched slices).
const ticketIndexCache = new WeakMap<Ticket[], Map<TicketId, Ticket>>();
const columnIndexCache = new WeakMap<BoardColumn[], Map<ColumnId, BoardColumn>>();

export const indexTickets = (tickets: Ticket[]): Map<TicketId, Ticket> => {
  const cached = ticketIndexCache.get(tickets);
  if (cached) return cached;
  const map = new Map<TicketId, Ticket>();
  for (const ticket of tickets) map.set(ticket.id, ticket);
  ticketIndexCache.set(tickets, map);
  return map;
};

export const indexColumns = (columns: BoardColumn[]): Map<ColumnId, BoardColumn> => {
  const cached = columnIndexCache.get(columns);
  if (cached) return cached;
  const map = new Map<ColumnId, BoardColumn>();
  for (const column of columns) map.set(column.id, column);
  columnIndexCache.set(columns, map);
  return map;
};

export const analystSelectors = {
  activeBoard: (context: AnalystMachineContext) =>
    context.boards.find((board) => board.id === context.activeBoardId) ?? null,

  activeBoardColumns: (context: AnalystMachineContext) =>
    context.boardColumns.filter((column) => column.boardId === context.activeBoardId),

  activeBoardTickets: (context: AnalystMachineContext) => {
    if (!context.activeBoardId) return [];
    return context.tickets.filter((ticket) => ticket.boardId === context.activeBoardId);
  },

  activeBoardTicketsByColumn: (context: AnalystMachineContext) => {
    const activeColumns = context.boardColumns.filter(
      (column) => column.boardId === context.activeBoardId,
    );
    // Bucket tickets once (O(n)) instead of per-column filter (O(n*m))
    const byColumn = new Map<ColumnId, Ticket[]>();
    for (const column of activeColumns) byColumn.set(column.id, []);
    for (const ticket of context.tickets) {
      if (ticket.boardId !== context.activeBoardId) continue;
      const bucket = byColumn.get(ticket.columnId);
      if (bucket) bucket.push(ticket);
    }
    return activeColumns.map((column) => ({
      column,
      tickets: byColumn.get(column.id) ?? [],
    }));
  },

  selectedTicket: (context: AnalystMachineContext) => {
    if (!context.selectedTicketId) return null;
    return indexTickets(context.tickets).get(context.selectedTicketId) ?? null;
  },

  workflowStatesForTicket: (context: AnalystMachineContext, ticketId: TicketId | null) => {
    if (!ticketId) return [];
    const ticket = indexTickets(context.tickets).get(ticketId);
    if (!ticket) return [];
    return indexColumns(context.boardColumns).get(ticket.columnId)?.states ?? [];
  },

  allWorkflowStates: (context: AnalystMachineContext) => {
    const out = new Set<string>();
    for (const column of context.boardColumns) {
      if (column.boardId !== context.activeBoardId) continue;
      for (const state of column.states) out.add(state);
    }
    return Array.from(out);
  },

  allLabels: (context: AnalystMachineContext) => context.labels,

  workflowChoicesOrdered: (context: AnalystMachineContext) => {
    const out: Array<{
      columnId: ColumnId;
      columnName: string;
      color: string;
      states: string[];
    }> = [];
    for (const column of context.boardColumns) {
      if (column.boardId !== context.activeBoardId) continue;
      out.push({
        columnId: column.id,
        columnName: column.name,
        color: column.color,
        states: column.states,
      });
    }
    return out;
  },

  ticketByNumber: (context: AnalystMachineContext, ticketNumber: string | null) => {
    if (!ticketNumber) return null;
    const lc = ticketNumber.toLowerCase();
    for (const ticket of context.tickets) {
      if (ticket.ticketNumber.toLowerCase() === lc) return ticket;
    }
    return null;
  },
};
