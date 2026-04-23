import type { AnalystMachineContext, TicketId } from "./types";

const getTicketsForBoard = (boardId: string | null, tickets: AnalystMachineContext["tickets"]) => {
  if (!boardId) return [];
  return tickets.filter((ticket) => ticket.boardId === boardId);
};

export const analystSelectors = {
  activeBoard: (context: AnalystMachineContext) =>
    context.boards.find((board) => board.id === context.activeBoardId) ?? null,

  activeBoardColumns: (context: AnalystMachineContext) =>
    context.boardColumns.filter((column) => column.boardId === context.activeBoardId),

  activeBoardTickets: (context: AnalystMachineContext) =>
    getTicketsForBoard(context.activeBoardId, context.tickets),

  activeBoardTicketsByColumn: (context: AnalystMachineContext) => {
    const boardColumns = context.boardColumns.filter(
      (column) => column.boardId === context.activeBoardId,
    );
    const tickets = getTicketsForBoard(context.activeBoardId, context.tickets);
    return boardColumns.map((column) => ({
      column,
      tickets: tickets.filter((ticket) => ticket.columnId === column.id),
    }));
  },

  selectedTicket: (context: AnalystMachineContext) =>
    context.tickets.find((ticket) => ticket.id === context.selectedTicketId) ?? null,

  workflowStatesForTicket: (context: AnalystMachineContext, ticketId: TicketId | null) => {
    if (!ticketId) return [];
    const ticket = context.tickets.find((item) => item.id === ticketId);
    if (!ticket) return [];
    const column = context.boardColumns.find((item) => item.id === ticket.columnId);
    return column?.states ?? [];
  },

  allWorkflowStates: (context: AnalystMachineContext) =>
    Array.from(
      new Set(
        context.boardColumns
          .filter((column) => column.boardId === context.activeBoardId)
          .flatMap((column) => column.states),
      ),
    ),

  allLabels: (context: AnalystMachineContext) => context.labels,

  workflowChoicesOrdered: (context: AnalystMachineContext) =>
    context.boardColumns
      .filter((column) => column.boardId === context.activeBoardId)
      .map((column) => ({
        columnId: column.id,
        columnName: column.name,
        color: column.color,
        states: column.states,
      })),

  ticketByNumber: (context: AnalystMachineContext, ticketNumber: string | null) => {
    if (!ticketNumber) return null;
    return (
      context.tickets.find(
        (ticket) => ticket.ticketNumber.toLowerCase() === ticketNumber.toLowerCase(),
      ) ?? null
    );
  },
};
