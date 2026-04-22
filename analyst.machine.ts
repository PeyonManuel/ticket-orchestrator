import { assign, sendTo, setup } from "xstate";
import type {
  AiOrchestratorContext,
  AnalystMachineContext,
  BoardId,
  BoardColumn,
  ColumnId,
  CreateTicketInput,
  OrchestratorSuggestion,
  ReleaseVersion,
  Ticket,
  TicketId,
} from "@/analyst.types";
import { seedAnalystData } from "@/analyst.types";

export type AiOrchestratorEvent =
  | { type: "START_ANALYSIS"; requirement: string }
  | {
      type: "ANALYSIS_COMPLETED";
      refinementDraft: string;
      planDraft: string;
      suggestion: OrchestratorSuggestion;
    }
  | { type: "ANALYSIS_FAILED"; reason: string }
  | { type: "CONTROLLER_ALERTED"; alert: string }
  | { type: "APPROVE_SUGGESTION" }
  | { type: "REJECT_SUGGESTION"; reason: string }
  | { type: "RETRY" };

export const aiOrchestratorMachine = setup({
  types: {
    context: {} as AiOrchestratorContext,
    events: {} as AiOrchestratorEvent,
  },
  actions: {
    cacheRequirement: assign({
      requirement: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "START_ANALYSIS" ? event.requirement : "",
      rejectionReason: () => null,
      controllerAlert: () => null,
    }),
    cacheDrafts: assign({
      refinementDraft: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "ANALYSIS_COMPLETED" ? event.refinementDraft : null,
      planDraft: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "ANALYSIS_COMPLETED" ? event.planDraft : null,
      suggestion: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "ANALYSIS_COMPLETED" ? event.suggestion : null,
    }),
    cacheControllerAlert: assign({
      controllerAlert: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "CONTROLLER_ALERTED" ? event.alert : null,
    }),
    cacheRejectionReason: assign({
      rejectionReason: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "REJECT_SUGGESTION" ? event.reason : null,
    }),
  },
}).createMachine({
  id: "aiOrchestrator",
  initial: "idle",
  context: {
    requirement: "",
    refinementDraft: null,
    planDraft: null,
    controllerAlert: null,
    suggestion: null,
    rejectionReason: null,
  },
  states: {
    idle: {
      on: {
        START_ANALYSIS: {
          target: "researching",
          actions: "cacheRequirement",
        },
      },
    },
    researching: {
      on: {
        ANALYSIS_COMPLETED: {
          target: "awaitingHumanApproval",
          actions: "cacheDrafts",
        },
        ANALYSIS_FAILED: "failed",
      },
    },
    awaitingHumanApproval: {
      on: {
        CONTROLLER_ALERTED: {
          target: "controllerReview",
          actions: "cacheControllerAlert",
        },
        APPROVE_SUGGESTION: "approved",
        REJECT_SUGGESTION: {
          target: "rejected",
          actions: "cacheRejectionReason",
        },
      },
    },
    controllerReview: {
      on: {
        APPROVE_SUGGESTION: "approved",
        REJECT_SUGGESTION: {
          target: "rejected",
          actions: "cacheRejectionReason",
        },
      },
    },
    approved: {
      type: "final",
    },
    rejected: {
      on: {
        RETRY: "researching",
      },
    },
    failed: {
      on: {
        RETRY: "researching",
      },
    },
  },
});

export type AnalystEvent =
  | { type: "SELECT_BOARD"; boardId: BoardId }
  | { type: "OPEN_TICKET"; ticketId: TicketId }
  | { type: "OPEN_SEARCH" }
  | { type: "OPEN_CREATE_TICKET"; linkSourceTicketId?: TicketId }
  | { type: "OPEN_CREATE_VERSION" }
  | { type: "OPEN_ORCHESTRATOR" }
  | { type: "CLOSE_MODAL" }
  | {
      type: "ADD_BOARD_COLUMN";
      boardId: BoardId;
      columnName: string;
      states: string[];
    }
  | {
      type: "UPDATE_COLUMN_STATE";
      columnId: ColumnId;
      states: string[];
    }
  | {
      type: "UPDATE_COLUMN_COLOR";
      columnId: ColumnId;
      color: string;
    }
  | {
      type: "MOVE_TICKET_TO_COLUMN";
      ticketId: TicketId;
      columnId: ColumnId;
    }
  | {
      type: "UPDATE_TICKET_FIELD";
      ticketId: TicketId;
      field: "title" | "description" | "label" | "fixVersion";
      value: string;
    }
  | {
      type: "UPDATE_TICKET_WORKFLOW_STATE";
      ticketId: TicketId;
      workflowState: string;
    }
  | { type: "UPDATE_TICKET_STORY_POINTS"; ticketId: TicketId; storyPoints: 1 | 2 | 3 | 5 | 8 | 13 }
  | { type: "LINK_TICKETS"; ticketId: TicketId; targetTicketId: TicketId }
  | { type: "UNLINK_TICKETS"; ticketId: TicketId; targetTicketId: TicketId }
  | { type: "CREATE_VERSION"; name: string; releaseDate: string; applyToTicketId?: TicketId }
  | { type: "CREATE_TICKET"; payload: CreateTicketInput }
  | { type: "AI_EVENT"; event: AiOrchestratorEvent };

const getTicketsForBoard = (
  boardId: BoardId | null,
  tickets: Ticket[],
): Ticket[] => {
  if (!boardId) return [];
  return tickets.filter((ticket) => ticket.boardId === boardId);
};

const normalizeColumnSlug = (columnName: string): string =>
  columnName.trim().toLowerCase().replace(/\s+/g, "-");

const getNextTicketNumber = (tickets: Ticket[]): string => {
  const max = tickets.reduce((acc, ticket) => {
    const match = ticket.ticketNumber.match(/^OR-(\d+)$/i);
    if (!match) return acc;
    return Math.max(acc, Number(match[1]));
  }, 0);
  return `OR-${max + 1}`;
};

export const analystWorkspaceMachine = setup({
  types: {
    context: {} as AnalystMachineContext,
    events: {} as AnalystEvent,
  },
  actions: {
    setActiveBoard: assign({
      activeBoardId: ({ event }: { event: AnalystEvent }) =>
        event.type === "SELECT_BOARD" ? event.boardId : null,
      selectedTicketId: () => null,
    }),
    openTicket: assign({
      selectedTicketId: ({ event }: { event: AnalystEvent }) =>
        event.type === "OPEN_TICKET" ? event.ticketId : null,
      activeModal: () => "ticket",
    }),
    openCreateTicket: assign({
      activeModal: () => "createTicket",
      createTicketLinkSourceId: ({ event }: { event: AnalystEvent }) =>
        event.type === "OPEN_CREATE_TICKET" ? event.linkSourceTicketId ?? null : null,
    }),
    openCreateVersion: assign({
      activeModal: () => "createVersion",
    }),
    openSearch: assign({
      activeModal: () => "search",
    }),
    openOrchestrator: assign({
      activeModal: () => "orchestrator",
    }),
    closeModal: assign({
      selectedTicketId: () => null,
      createTicketLinkSourceId: () => null,
      activeModal: () => "none",
    }),
    addBoardColumn: assign({
      boardColumns: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "ADD_BOARD_COLUMN") {
          return context.boardColumns;
        }

        const trimmedName = event.columnName.trim();
        if (!trimmedName) {
          return context.boardColumns;
        }
        const boardColumnCount = context.boardColumns.filter(
          (column) => column.boardId === event.boardId,
        ).length;
        if (boardColumnCount >= 6) {
          return context.boardColumns;
        }

        const alreadyExists = context.boardColumns.some(
          (column) =>
            column.boardId === event.boardId &&
            column.name.toLowerCase() === trimmedName.toLowerCase(),
        );

        if (alreadyExists) {
          return context.boardColumns;
        }

        const nextColumn: BoardColumn = {
          id: `${event.boardId}-${normalizeColumnSlug(trimmedName)}`,
          boardId: event.boardId,
          name: trimmedName,
          states: event.states.length
            ? event.states
            : [normalizeColumnSlug(trimmedName)],
          color: "#64748b",
        };

        return [...context.boardColumns, nextColumn];
      },
    }),
    updateColumnState: assign({
      boardColumns: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "UPDATE_COLUMN_STATE") {
          return context.boardColumns;
        }

        return context.boardColumns.map((column) =>
          column.id === event.columnId
            ? { ...column, states: event.states.length ? event.states : column.states }
            : column,
        );
      },
    }),
    updateColumnColor: assign({
      boardColumns: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "UPDATE_COLUMN_COLOR") return context.boardColumns;
        return context.boardColumns.map((column) =>
          column.id === event.columnId ? { ...column, color: event.color } : column,
        );
      },
    }),
    updateTicketField: assign({
      tickets: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "UPDATE_TICKET_FIELD") {
          return context.tickets;
        }

        return context.tickets.map((ticket) =>
          ticket.id === event.ticketId
            ? { ...ticket, [event.field]: event.value }
            : ticket,
        );
      },
    }),
    moveTicketToColumn: assign({
      tickets: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "MOVE_TICKET_TO_COLUMN") {
          return context.tickets;
        }

        const targetColumn = context.boardColumns.find(
          (column) => column.id === event.columnId,
        );
        if (!targetColumn) {
          return context.tickets;
        }

        return context.tickets.map((ticket) =>
          ticket.id === event.ticketId
            ? {
                ...ticket,
                boardId: targetColumn.boardId,
                columnId: targetColumn.id,
                workflowState: targetColumn.states[0] ?? ticket.workflowState,
              }
            : ticket,
        );
      },
    }),
    updateTicketWorkflowState: assign({
      tickets: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "UPDATE_TICKET_WORKFLOW_STATE") {
          return context.tickets;
        }
        const targetColumn = context.boardColumns.find((column) =>
          column.states.includes(event.workflowState),
        );
        return context.tickets.map((ticket) => {
          if (ticket.id !== event.ticketId) {
            return ticket;
          }
          return {
            ...ticket,
            workflowState: event.workflowState,
            columnId: targetColumn?.id ?? ticket.columnId,
            boardId: targetColumn?.boardId ?? ticket.boardId,
          };
        });
      },
    }),
    updateTicketStoryPoints: assign({
      tickets: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "UPDATE_TICKET_STORY_POINTS") return context.tickets;
        return context.tickets.map((ticket) =>
          ticket.id === event.ticketId ? { ...ticket, storyPoints: event.storyPoints } : ticket,
        );
      },
    }),
    linkTickets: assign({
      tickets: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "LINK_TICKETS" || event.ticketId === event.targetTicketId) {
          return context.tickets;
        }
        return context.tickets.map((ticket) => {
          if (ticket.id === event.ticketId) {
            if (ticket.linkedTicketIds.includes(event.targetTicketId)) return ticket;
            return { ...ticket, linkedTicketIds: [...ticket.linkedTicketIds, event.targetTicketId] };
          }
          if (ticket.id === event.targetTicketId) {
            if (ticket.linkedTicketIds.includes(event.ticketId)) return ticket;
            return { ...ticket, linkedTicketIds: [...ticket.linkedTicketIds, event.ticketId] };
          }
          return ticket;
        });
      },
    }),
    unlinkTickets: assign({
      tickets: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "UNLINK_TICKETS") return context.tickets;
        return context.tickets.map((ticket) => {
          if (ticket.id === event.ticketId) {
            return {
              ...ticket,
              linkedTicketIds: ticket.linkedTicketIds.filter((id) => id !== event.targetTicketId),
            };
          }
          if (ticket.id === event.targetTicketId) {
            return {
              ...ticket,
              linkedTicketIds: ticket.linkedTicketIds.filter((id) => id !== event.ticketId),
            };
          }
          return ticket;
        });
      },
    }),
    createVersion: assign({
      releaseVersions: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "CREATE_VERSION") return context.releaseVersions;
        if (!event.name.trim()) return context.releaseVersions;
        const exists = context.releaseVersions.some(
          (version) => version.name.toLowerCase() === event.name.trim().toLowerCase(),
        );
        if (exists) return context.releaseVersions;
        const newVersion: ReleaseVersion = {
          id: `version-${crypto.randomUUID().slice(0, 8)}`,
          name: event.name.trim(),
          releaseDate: event.releaseDate,
        };
        return [...context.releaseVersions, newVersion];
      },
      tickets: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "CREATE_VERSION" || !event.applyToTicketId) return context.tickets;
        return context.tickets.map((ticket) =>
          ticket.id === event.applyToTicketId ? { ...ticket, fixVersion: event.name.trim() } : ticket,
        );
      },
      activeModal: () => "ticket",
    }),
    createTicket: assign({
      tickets: ({
        context,
        event,
      }: {
        context: AnalystMachineContext;
        event: AnalystEvent;
      }) => {
        if (event.type !== "CREATE_TICKET") {
          return context.tickets;
        }
        const newTicket: Ticket = {
          id: `ticket-${crypto.randomUUID().slice(0, 8)}`,
          ticketNumber: getNextTicketNumber(context.tickets),
          ...event.payload,
          linkedTicketIds: [],
        };
        const withNew = [newTicket, ...context.tickets];
        if (!context.createTicketLinkSourceId) return withNew;
        return withNew.map((ticket) => {
          if (ticket.id === newTicket.id) {
            return {
              ...ticket,
              linkedTicketIds: Array.from(new Set([...ticket.linkedTicketIds, context.createTicketLinkSourceId as string])),
            };
          }
          if (ticket.id === context.createTicketLinkSourceId) {
            return {
              ...ticket,
              linkedTicketIds: Array.from(new Set([...ticket.linkedTicketIds, newTicket.id])),
            };
          }
          return ticket;
        });
      },
      selectedTicketId: ({
        event,
      }: {
        event: AnalystEvent;
      }) => (event.type === "CREATE_TICKET" ? null : null),
      activeModal: () => "none",
      createTicketLinkSourceId: () => null,
    }),
    forwardAiEvent: sendTo("aiOrchestratorActor", ({ event }: { event: AnalystEvent }) =>
      event.type === "AI_EVENT" ? event.event : { type: "RETRY" },
    ),
  },
  guards: {
    hasBoardSelected: ({ context }: { context: AnalystMachineContext }) =>
      context.activeBoardId !== null,
  },
}).createMachine({
  id: "analystWorkspace",
  type: "parallel",
  context: {
    boards: seedAnalystData.boards,
    boardColumns: seedAnalystData.boardColumns,
    tickets: seedAnalystData.tickets,
    activeBoardId: seedAnalystData.boards[0]?.id ?? null,
    selectedTicketId: null,
    activeModal: "none",
    createTicketLinkSourceId: null,
    releaseVersions: [
      { id: "version-1", name: "v1.1.0", releaseDate: "2026-06-15" },
      { id: "version-2", name: "v1.2.0", releaseDate: "2026-07-31" },
      { id: "version-3", name: "v1.3.0", releaseDate: "2026-09-10" },
    ],
    currentUserRole: "member",
  },
  states: {
    workspace: {
      initial: "boardInactive",
      states: {
        boardInactive: {
          always: [
            {
              guard: "hasBoardSelected",
              target: "boardActive",
            },
          ],
          on: {
            SELECT_BOARD: {
              target: "boardActive",
              actions: "setActiveBoard",
            },
          },
        },
        boardActive: {
          on: {
            SELECT_BOARD: {
              actions: "setActiveBoard",
            },
            OPEN_TICKET: {
              actions: "openTicket",
            },
            OPEN_CREATE_TICKET: {
              actions: "openCreateTicket",
            },
            OPEN_CREATE_VERSION: {
              actions: "openCreateVersion",
            },
            OPEN_SEARCH: {
              actions: "openSearch",
            },
            OPEN_ORCHESTRATOR: {
              actions: "openOrchestrator",
            },
            CLOSE_MODAL: {
              actions: "closeModal",
            },
            ADD_BOARD_COLUMN: {
              actions: "addBoardColumn",
            },
            UPDATE_COLUMN_STATE: {
              actions: "updateColumnState",
            },
            UPDATE_COLUMN_COLOR: {
              actions: "updateColumnColor",
            },
            MOVE_TICKET_TO_COLUMN: {
              actions: "moveTicketToColumn",
            },
            UPDATE_TICKET_FIELD: {
              actions: "updateTicketField",
            },
            UPDATE_TICKET_WORKFLOW_STATE: {
              actions: "updateTicketWorkflowState",
            },
            UPDATE_TICKET_STORY_POINTS: {
              actions: "updateTicketStoryPoints",
            },
            LINK_TICKETS: {
              actions: "linkTickets",
            },
            UNLINK_TICKETS: {
              actions: "unlinkTickets",
            },
            CREATE_VERSION: {
              actions: "createVersion",
            },
            CREATE_TICKET: {
              actions: "createTicket",
            },
          },
        },
      },
    },
    orchestratorPanel: {
      initial: "closed",
      states: {
        closed: {
          on: {
            OPEN_ORCHESTRATOR: "opened",
          },
        },
        opened: {
          invoke: {
            id: "aiOrchestratorActor",
            src: aiOrchestratorMachine,
          },
          on: {
            CLOSE_MODAL: "closed",
            AI_EVENT: {
              actions: "forwardAiEvent",
            },
          },
        },
      },
    },
  },
});

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
    context.tickets.find((ticket) => ticket.id === context.selectedTicketId) ??
    null,
  workflowStatesForTicket: (
    context: AnalystMachineContext,
    ticketId: TicketId | null,
  ) => {
    if (!ticketId) return [];
    const ticket = context.tickets.find((item) => item.id === ticketId);
    if (!ticket) return [];
    const column = context.boardColumns.find((item) => item.id === ticket.columnId);
    return column?.states ?? [];
  },
  allWorkflowStates: (context: AnalystMachineContext) =>
    Array.from(new Set(context.boardColumns.flatMap((column) => column.states))),
  workflowChoicesOrdered: (context: AnalystMachineContext) =>
    context.boardColumns.map((column) => ({
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
