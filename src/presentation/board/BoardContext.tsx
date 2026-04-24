"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMachine } from "@xstate/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { StateFrom } from "xstate";
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

// ── View-model shapes ────────────────────────────────────────────────

export interface BoardData {
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
}

export interface BoardActions {
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

/** Combined shape for components that need both. */
export type BoardViewModel = BoardData & BoardActions;

// ── Contexts ─────────────────────────────────────────────────────────

const BoardDataContext = createContext<BoardData | null>(null);
const BoardActionsContext = createContext<BoardActions | null>(null);

type AnalystState = StateFrom<typeof analystWorkspaceMachine>;

// Persistence debouncer — coalesce rapid-fire transitions (e.g. drag).
const PERSIST_DEBOUNCE_MS = 250;

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const [persistedInput] = useState(loadWorkspaceSnapshot);
  const [state, send] = useMachine(analystWorkspaceMachine, { input: persistedInput });
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Stable refs so action callbacks don't need to re-bind every render.
  const sendRef = useRef(send);
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  const searchParamsRef = useRef(searchParams);
  const contextRef = useRef(state.context);
  useEffect(() => {
    sendRef.current = send;
    routerRef.current = router;
    pathnameRef.current = pathname;
    searchParamsRef.current = searchParams;
    contextRef.current = state.context;
  });

  const updateUrlParams = useCallback(
    (next: { modal?: string | null; ticketId?: string | null }) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      if (typeof next.modal !== "undefined") {
        if (next.modal) params.set("modal", next.modal);
        else params.delete("modal");
      }
      if (typeof next.ticketId !== "undefined") {
        if (next.ticketId) params.set("ticket", next.ticketId);
        else params.delete("ticket");
      }
      const query = params.toString();
      routerRef.current.replace(
        query ? `${pathnameRef.current}?${query}` : pathnameRef.current,
        { scroll: false },
      );
    },
    [],
  );

  // URL -> machine sync for deep links
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

  // Debounced persistence
  useEffect(() => {
    const id = setTimeout(
      () => saveWorkspaceSnapshot(state.context),
      PERSIST_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [state.context]);

  // ── Actions: identity stable for the lifetime of the provider ────
  const actions = useMemo<BoardActions>(() => {
    const s = (event: Parameters<typeof send>[0]) => sendRef.current(event);
    return {
      selectBoard: (boardId) => s({ type: "SELECT_BOARD", boardId }),
      openTicket: (ticketId) => {
        s({ type: "OPEN_TICKET", ticketId });
        const ticket = contextRef.current.tickets.find((item) => item.id === ticketId);
        updateUrlParams({ ticketId: ticket?.ticketNumber ?? null, modal: "ticket" });
      },
      closeModal: () => {
        s({ type: "CLOSE_MODAL" });
        updateUrlParams({ ticketId: null, modal: null });
      },
      openCreateTicket: () => {
        s({ type: "OPEN_CREATE_TICKET" });
        updateUrlParams({ ticketId: null, modal: "create" });
      },
      openCreateTicketLinkedTo: (ticketId) => {
        s({ type: "OPEN_CREATE_TICKET", linkSourceTicketId: ticketId });
        updateUrlParams({ ticketId: null, modal: "create" });
      },
      openSearch: () => {
        s({ type: "OPEN_SEARCH" });
        updateUrlParams({ ticketId: null, modal: "search" });
      },
      openCreateVersion: () => {
        s({ type: "OPEN_CREATE_VERSION" });
        updateUrlParams({ modal: "create-version" });
      },
      openOrchestrator: () => {
        s({ type: "OPEN_ORCHESTRATOR" });
        updateUrlParams({ ticketId: null, modal: "orchestrator" });
      },
      addBoardColumn: (boardId, columnName, states) =>
        s({ type: "ADD_BOARD_COLUMN", boardId, columnName, states }),
      updateColumnState: (columnId, states) => s({ type: "UPDATE_COLUMN_STATE", columnId, states }),
      updateColumnColor: (columnId, color) => s({ type: "UPDATE_COLUMN_COLOR", columnId, color }),
      renameColumn: (columnId, name) => s({ type: "RENAME_COLUMN", columnId, name }),
      deleteColumn: (columnId) => s({ type: "DELETE_COLUMN", columnId }),
      reorderColumns: (boardId, orderedColumnIds) =>
        s({ type: "REORDER_COLUMNS", boardId, orderedColumnIds }),
      moveTicketToColumn: (ticketId, columnId) =>
        s({ type: "MOVE_TICKET_TO_COLUMN", ticketId, columnId }),
      updateTicketField: (ticketId, field, value) =>
        s({ type: "UPDATE_TICKET_FIELD", ticketId, field, value }),
      updateTicketWorkflowState: (ticketId, workflowState) =>
        s({ type: "UPDATE_TICKET_WORKFLOW_STATE", ticketId, workflowState }),
      updateTicketStoryPoints: (ticketId, storyPoints) =>
        s({ type: "UPDATE_TICKET_STORY_POINTS", ticketId, storyPoints }),
      linkTickets: (ticketId, targetTicketId) =>
        s({ type: "LINK_TICKETS", ticketId, targetTicketId }),
      unlinkTickets: (ticketId, targetTicketId) =>
        s({ type: "UNLINK_TICKETS", ticketId, targetTicketId }),
      createVersion: (name, releaseDate, applyToTicketId) =>
        s({ type: "CREATE_VERSION", name, releaseDate, applyToTicketId }),
      deleteVersion: (versionId) => s({ type: "DELETE_VERSION", versionId }),
      createTicket: (payload) => s({ type: "CREATE_TICKET", payload }),
      addLabel: (label) => s({ type: "ADD_LABEL", label }),
      dispatchOrchestratorEvent: (event) => s({ type: "AI_EVENT", event }),
      getTicketShareUrl: (ticketId) => {
        if (typeof window === "undefined") return "";
        const ticket = contextRef.current.tickets.find((item) => item.id === ticketId);
        if (!ticket) return "";
        return `${window.location.origin}${pathnameRef.current}?modal=ticket&ticket=${ticket.ticketNumber}`;
      },
    };
  }, [updateUrlParams]);

  // ── Data: each slice memoized on its own narrow deps ─────────────
  // We intentionally depend on individual context slices (not the full `ctx`
  // object) to avoid re-running heavy selectors when unrelated fields change.
  const ctx = state.context;

  /* eslint-disable react-hooks/exhaustive-deps */
  const boardColumnsForActive = useMemo(
    () => analystSelectors.activeBoardColumns(ctx),
    [ctx.boardColumns, ctx.activeBoardId],
  );

  const activeBoardTicketsByColumn = useMemo(
    () => analystSelectors.activeBoardTicketsByColumn(ctx),
    [ctx.boardColumns, ctx.tickets, ctx.activeBoardId],
  );

  const selectedTicket = useMemo(
    () => analystSelectors.selectedTicket(ctx),
    [ctx.tickets, ctx.selectedTicketId],
  );

  const workflowStateOptions = useMemo(
    () => analystSelectors.workflowStatesForTicket(ctx, ctx.selectedTicketId),
    [ctx.tickets, ctx.boardColumns, ctx.selectedTicketId],
  );

  const globalWorkflowStateOptions = useMemo(
    () => analystSelectors.allWorkflowStates(ctx),
    [ctx.boardColumns, ctx.activeBoardId],
  );

  const workflowChoicesOrdered = useMemo(
    () => analystSelectors.workflowChoicesOrdered(ctx),
    [ctx.boardColumns, ctx.activeBoardId],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const linkedTickets = useMemo(
    () =>
      selectedTicket
        ? ctx.tickets.filter((t) => selectedTicket.linkedTicketIds.includes(t.id))
        : [],
    [selectedTicket, ctx.tickets],
  );

  const orchestratorOpen =
    ctx.activeModal === "orchestrator" &&
    (state as AnalystState).matches({ orchestratorPanel: "opened" });

  const data = useMemo<BoardData>(
    () => ({
      boards: ctx.boards,
      allTickets: ctx.tickets,
      boardColumns: boardColumnsForActive,
      activeBoardId: ctx.activeBoardId,
      activeBoardTicketsByColumn,
      selectedTicket,
      activeModal: ctx.activeModal,
      workflowStateOptions,
      globalWorkflowStateOptions,
      workflowChoicesOrdered,
      linkedTickets,
      currentUserRole: ctx.currentUserRole,
      releaseVersions: ctx.releaseVersions,
      orchestratorOpen,
      createModalOpen: ctx.activeModal === "createTicket",
      createVersionModalOpen: ctx.activeModal === "createVersion",
      labels: ctx.labels,
    }),
    [
      ctx.boards,
      ctx.tickets,
      boardColumnsForActive,
      ctx.activeBoardId,
      activeBoardTicketsByColumn,
      selectedTicket,
      ctx.activeModal,
      workflowStateOptions,
      globalWorkflowStateOptions,
      workflowChoicesOrdered,
      linkedTickets,
      ctx.currentUserRole,
      ctx.releaseVersions,
      orchestratorOpen,
      ctx.labels,
    ],
  );

  return (
    <BoardActionsContext.Provider value={actions}>
      <BoardDataContext.Provider value={data}>{children}</BoardDataContext.Provider>
    </BoardActionsContext.Provider>
  );
}

// ── Hooks ────────────────────────────────────────────────────────────

export function useBoardData(): BoardData {
  const ctx = useContext(BoardDataContext);
  if (!ctx) throw new Error("useBoardData must be used within a BoardProvider");
  return ctx;
}

export function useBoardActions(): BoardActions {
  const ctx = useContext(BoardActionsContext);
  if (!ctx) throw new Error("useBoardActions must be used within a BoardProvider");
  return ctx;
}

/**
 * Combined view-model hook (kept for existing consumers).
 * Prefer `useBoardData` or `useBoardActions` for fine-grained subscriptions.
 */
export function useBoardContext(): BoardViewModel {
  return { ...useBoardData(), ...useBoardActions() };
}
