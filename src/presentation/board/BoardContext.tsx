"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMachine } from "@xstate/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  analystSelectors,
  analystWorkspaceMachine,
  type ActiveModal,
  type AiOrchestratorEvent,
  type Board,
  type BoardColumn,
  type CreateTicketInput,
  type ReleaseVersion,
  type Ticket,
  type UserRole,
} from "@/domain/analyst";
import {
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from "@/infrastructure/persistence/workspaceStorage";

export interface BoardViewModel {
  boards: Board[];
  boardColumns: BoardColumn[];
  activeBoardId: string | null;
  activeBoardTicketsByColumn: Array<{ column: BoardColumn; tickets: Ticket[] }>;
  selectedTicket: Ticket | null;
  activeModal: ActiveModal;
  workflowStateOptions: string[];
  globalWorkflowStateOptions: string[];
  workflowChoicesOrdered: Array<{
    columnId: string;
    columnName: string;
    color: string;
    states: string[];
  }>;
  allTickets: Ticket[];
  linkedTickets: Ticket[];
  releaseVersions: ReleaseVersion[];
  currentUserRole: UserRole;
  orchestratorOpen: boolean;
  createModalOpen: boolean;
  createVersionModalOpen: boolean;
  labels: string[];

  selectBoard: (boardId: string) => void;
  openTicket: (ticketId: string) => void;
  closeModal: () => void;
  openCreateTicket: () => void;
  openCreateTicketLinkedTo: (ticketId: string) => void;
  openSearch: () => void;
  openCreateVersion: () => void;
  openOrchestrator: () => void;
  addBoardColumn: (boardId: string, columnName: string, states: string[]) => void;
  updateColumnState: (columnId: string, states: string[]) => void;
  updateColumnColor: (columnId: string, color: string) => void;
  renameColumn: (columnId: string, name: string) => void;
  deleteColumn: (columnId: string) => void;
  reorderColumns: (boardId: string, orderedColumnIds: string[]) => void;
  moveTicketToColumn: (ticketId: string, columnId: string) => void;
  updateTicketField: (
    ticketId: string,
    field: "title" | "description" | "label" | "fixVersion",
    value: string,
  ) => void;
  updateTicketWorkflowState: (ticketId: string, workflowState: string) => void;
  updateTicketStoryPoints: (
    ticketId: string,
    storyPoints: 1 | 2 | 3 | 5 | 8 | 13,
  ) => void;
  linkTickets: (ticketId: string, targetTicketId: string) => void;
  unlinkTickets: (ticketId: string, targetTicketId: string) => void;
  createVersion: (name: string, releaseDate: string, applyToTicketId?: string) => void;
  deleteVersion: (versionId: string) => void;
  createTicket: (payload: CreateTicketInput) => void;
  addLabel: (label: string) => void;
  dispatchOrchestratorEvent: (event: AiOrchestratorEvent) => void;
  getTicketShareUrl: (ticketId: string) => string;
}

const BoardContext = createContext<BoardViewModel | null>(null);

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [persistedInput] = useState(loadWorkspaceSnapshot);
  const [state, send] = useMachine(analystWorkspaceMachine, { input: persistedInput });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateUrlParams = (next: { modal?: string | null; ticketId?: string | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (typeof next.modal !== "undefined") {
      if (next.modal) params.set("modal", next.modal);
      else params.delete("modal");
    }
    if (typeof next.ticketId !== "undefined") {
      if (next.ticketId) params.set("ticket", next.ticketId);
      else params.delete("ticket");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // URL <-> machine sync for deep links
  useEffect(() => {
    const modal = searchParams.get("modal");
    const ticketNumber = searchParams.get("ticket");
    const ticketFromUrl = analystSelectors.ticketByNumber(state.context, ticketNumber);

    if (ticketFromUrl && state.context.selectedTicketId !== ticketFromUrl.id) {
      send({ type: "OPEN_TICKET", ticketId: ticketFromUrl.id });
      return;
    }

    if (modal === "orchestrator" && state.context.activeModal !== "orchestrator") {
      send({ type: "OPEN_ORCHESTRATOR" });
      return;
    }
    if (modal === "create" && state.context.activeModal !== "createTicket") {
      send({ type: "OPEN_CREATE_TICKET" });
      return;
    }
    if (modal === "search" && state.context.activeModal !== "search") {
      send({ type: "OPEN_SEARCH" });
      return;
    }
    if (modal === "create-version" && state.context.activeModal !== "createVersion") {
      send({ type: "OPEN_CREATE_VERSION" });
      return;
    }

    if (!ticketNumber && !modal && state.context.activeModal !== "none") {
      send({ type: "CLOSE_MODAL" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Persist snapshot whenever domain context changes
  useEffect(() => {
    saveWorkspaceSnapshot(state.context);
  }, [state.context]);

  const value = useMemo<BoardViewModel>(() => {
    const context = state.context;
    const selectedTicket = analystSelectors.selectedTicket(context);
    return {
      boards: context.boards,
      allTickets: context.tickets,
      boardColumns: analystSelectors.activeBoardColumns(context),
      activeBoardId: context.activeBoardId,
      activeBoardTicketsByColumn: analystSelectors.activeBoardTicketsByColumn(context),
      selectedTicket,
      activeModal: context.activeModal,
      workflowStateOptions: analystSelectors.workflowStatesForTicket(
        context,
        context.selectedTicketId,
      ),
      globalWorkflowStateOptions: analystSelectors.allWorkflowStates(context),
      workflowChoicesOrdered: analystSelectors.workflowChoicesOrdered(context),
      linkedTickets: selectedTicket
        ? context.tickets.filter((ticket) =>
            selectedTicket.linkedTicketIds.includes(ticket.id),
          )
        : [],
      currentUserRole: context.currentUserRole,
      releaseVersions: context.releaseVersions,
      orchestratorOpen:
        context.activeModal === "orchestrator" &&
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state as any).matches({ orchestratorPanel: "opened" }),
      createModalOpen: context.activeModal === "createTicket",
      createVersionModalOpen: context.activeModal === "createVersion",
      labels: analystSelectors.allLabels(context),

      selectBoard: (boardId) => send({ type: "SELECT_BOARD", boardId }),
      openTicket: (ticketId) => {
        send({ type: "OPEN_TICKET", ticketId });
        const ticket = context.tickets.find((item) => item.id === ticketId);
        updateUrlParams({ ticketId: ticket?.ticketNumber ?? null, modal: "ticket" });
      },
      closeModal: () => {
        send({ type: "CLOSE_MODAL" });
        updateUrlParams({ ticketId: null, modal: null });
      },
      openCreateTicket: () => {
        send({ type: "OPEN_CREATE_TICKET" });
        updateUrlParams({ ticketId: null, modal: "create" });
      },
      openCreateTicketLinkedTo: (ticketId) => {
        send({ type: "OPEN_CREATE_TICKET", linkSourceTicketId: ticketId });
        updateUrlParams({ ticketId: null, modal: "create" });
      },
      openSearch: () => {
        send({ type: "OPEN_SEARCH" });
        updateUrlParams({ ticketId: null, modal: "search" });
      },
      openCreateVersion: () => {
        send({ type: "OPEN_CREATE_VERSION" });
        updateUrlParams({ modal: "create-version" });
      },
      openOrchestrator: () => {
        send({ type: "OPEN_ORCHESTRATOR" });
        updateUrlParams({ ticketId: null, modal: "orchestrator" });
      },
      addBoardColumn: (boardId, columnName, states) =>
        send({ type: "ADD_BOARD_COLUMN", boardId, columnName, states }),
      updateColumnState: (columnId, states) =>
        send({ type: "UPDATE_COLUMN_STATE", columnId, states }),
      updateColumnColor: (columnId, color) =>
        send({ type: "UPDATE_COLUMN_COLOR", columnId, color }),
      renameColumn: (columnId, name) => send({ type: "RENAME_COLUMN", columnId, name }),
      deleteColumn: (columnId) => send({ type: "DELETE_COLUMN", columnId }),
      reorderColumns: (boardId, orderedColumnIds) =>
        send({ type: "REORDER_COLUMNS", boardId, orderedColumnIds }),
      moveTicketToColumn: (ticketId, columnId) =>
        send({ type: "MOVE_TICKET_TO_COLUMN", ticketId, columnId }),
      updateTicketField: (ticketId, field, value) =>
        send({ type: "UPDATE_TICKET_FIELD", ticketId, field, value }),
      updateTicketWorkflowState: (ticketId, workflowState) =>
        send({ type: "UPDATE_TICKET_WORKFLOW_STATE", ticketId, workflowState }),
      updateTicketStoryPoints: (ticketId, storyPoints) =>
        send({ type: "UPDATE_TICKET_STORY_POINTS", ticketId, storyPoints }),
      linkTickets: (ticketId, targetTicketId) =>
        send({ type: "LINK_TICKETS", ticketId, targetTicketId }),
      unlinkTickets: (ticketId, targetTicketId) =>
        send({ type: "UNLINK_TICKETS", ticketId, targetTicketId }),
      createVersion: (name, releaseDate, applyToTicketId) =>
        send({ type: "CREATE_VERSION", name, releaseDate, applyToTicketId }),
      deleteVersion: (versionId) => send({ type: "DELETE_VERSION", versionId }),
      createTicket: (payload) => send({ type: "CREATE_TICKET", payload }),
      addLabel: (label) => send({ type: "ADD_LABEL", label }),
      dispatchOrchestratorEvent: (event) => send({ type: "AI_EVENT", event }),
      getTicketShareUrl: (ticketId) => {
        if (typeof window === "undefined") return "";
        const ticket = context.tickets.find((item) => item.id === ticketId);
        if (!ticket) return "";
        return `${window.location.origin}${pathname}?modal=ticket&ticket=${ticket.ticketNumber}`;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams, send, state]);

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoardContext(): BoardViewModel {
  const context = useContext(BoardContext);
  if (!context) {
    throw new Error("useBoardContext must be used within a BoardProvider");
  }
  return context;
}
