"use client";

import React, { createContext, useContext, useEffect, useMemo } from "react";
import { useMachine } from "@xstate/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  analystSelectors,
  analystWorkspaceMachine,
  type AiOrchestratorEvent,
} from "@/analyst.machine";
import type {
  Board,
  BoardColumn,
  CreateTicketInput,
  ReleaseVersion,
  Ticket,
  UserRole,
} from "@/analyst.types";

interface BoardViewModel {
  boards: Board[];
  boardColumns: BoardColumn[];
  activeBoardId: string | null;
  activeBoardTicketsByColumn: Array<{ column: BoardColumn; tickets: Ticket[] }>;
  selectedTicket: Ticket | null;
  activeModal: "none" | "ticket" | "createTicket" | "orchestrator" | "search";
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
  selectBoard: (boardId: string) => void;
  openTicket: (ticketId: string) => void;
  closeModal: () => void;
  openCreateTicket: () => void;
  openCreateTicketLinkedTo: (ticketId: string) => void;
  openSearch: () => void;
  openCreateVersion: () => void;
  addBoardColumn: (boardId: string, columnName: string, states: string[]) => void;
  updateColumnState: (columnId: string, states: string[]) => void;
  updateColumnColor: (columnId: string, color: string) => void;
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
  createTicket: (payload: CreateTicketInput) => void;
  openOrchestrator: () => void;
  dispatchOrchestratorEvent: (event: AiOrchestratorEvent) => void;
  getTicketShareUrl: (ticketId: string) => string;
}

const BoardContext = createContext<BoardViewModel | null>(null);

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [state, send] = useMachine(analystWorkspaceMachine);
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
  }, [searchParams, send, state.context.activeModal, state.context.selectedTicketId]);

  const value = useMemo<BoardViewModel>(() => {
    const context = state.context;
    return {
      boards: context.boards,
      allTickets: context.tickets,
      boardColumns: analystSelectors.activeBoardColumns(context),
      activeBoardId: context.activeBoardId,
      activeBoardTicketsByColumn: analystSelectors.activeBoardTicketsByColumn(context),
      selectedTicket: analystSelectors.selectedTicket(context),
      activeModal: context.activeModal,
      workflowStateOptions: analystSelectors.workflowStatesForTicket(
        context,
        context.selectedTicketId,
      ),
      globalWorkflowStateOptions: analystSelectors.allWorkflowStates(context),
      workflowChoicesOrdered: analystSelectors.workflowChoicesOrdered(context),
      linkedTickets: (() => {
        const selectedTicket = analystSelectors.selectedTicket(context);
        if (!selectedTicket) return [];
        return context.tickets.filter((ticket: Ticket) =>
          selectedTicket.linkedTicketIds.includes(ticket.id),
        );
      })(),
      currentUserRole: context.currentUserRole,
      releaseVersions: context.releaseVersions,
      orchestratorOpen:
        context.activeModal === "orchestrator" &&
        state.matches({ orchestratorPanel: "opened" }),
      createModalOpen: context.activeModal === "createTicket",
      createVersionModalOpen: context.activeModal === "createVersion",
      selectBoard: (boardId) => send({ type: "SELECT_BOARD", boardId }),
      openTicket: (ticketId) => {
        send({ type: "OPEN_TICKET", ticketId });
        const ticket = context.tickets.find((item: Ticket) => item.id === ticketId);
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
      addBoardColumn: (boardId, columnName, states) =>
        send({ type: "ADD_BOARD_COLUMN", boardId, columnName, states }),
      updateColumnState: (columnId, states) =>
        send({ type: "UPDATE_COLUMN_STATE", columnId, states }),
      updateColumnColor: (columnId, color) =>
        send({ type: "UPDATE_COLUMN_COLOR", columnId, color }),
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
      createTicket: (payload) => send({ type: "CREATE_TICKET", payload }),
      openOrchestrator: () => {
        send({ type: "OPEN_ORCHESTRATOR" });
        updateUrlParams({ ticketId: null, modal: "orchestrator" });
      },
      dispatchOrchestratorEvent: (event) => send({ type: "AI_EVENT", event }),
      getTicketShareUrl: (ticketId) => {
        if (typeof window === "undefined") return "";
        const ticket = context.tickets.find((item: Ticket) => item.id === ticketId);
        if (!ticket) return "";
        return `${window.location.origin}${pathname}?modal=ticket&ticket=${ticket.ticketNumber}`;
      },
    };
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
