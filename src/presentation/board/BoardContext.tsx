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
import { useQuery, useMutation, useApolloClient } from "@apollo/client/react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  Board,
  BoardColumn,
  CreateTicketInput,
  EpicSnapshot,
  OrgMember,
  OrgMemberRole,
  ReleaseVersion,
  Sprint,
  SprintAssignment,
  Ticket,
  UserRole,
} from "@/domain/analyst";
import {
  GET_BOARDS,
  GET_ARCHIVED_BOARDS,
  GET_BOARD_COLUMNS,
  GET_TICKETS,
  GET_TICKET_HISTORY,
  GET_RELEASE_VERSIONS,
  GET_LABELS,
  GET_ORG_MEMBERS,
  CREATE_BOARD,
  ARCHIVE_BOARD,
  RESTORE_BOARD,
  PURGE_BOARD,
  CREATE_COLUMN,
  UPDATE_COLUMN,
  DELETE_COLUMN,
  REORDER_COLUMNS,
  CREATE_TICKET,
  UPDATE_TICKET,
  CREATE_VERSION,
  DELETE_VERSION,
  ADD_LABEL,
  GET_SPRINTS,
  CREATE_SPRINT,
  UPDATE_SPRINT,
  DELETE_SPRINT,
  UPSERT_SPRINT_ASSIGNMENT,
  REMOVE_SPRINT_ASSIGNMENT,
  CREATE_EPIC_SNAPSHOT,
  SET_MEMBER_ROLE,
} from "@/infrastructure/graphql/operations";

// ── View-model shapes (kept identical to previous public API) ───────

/** Holds the server's current state when an optimistic-concurrency conflict is detected. */
export interface ActiveConflict {
  ticketId: string;
  /** Server's current Ticket — what was committed by another user. */
  currentState: Ticket;
  /** Field names that differ between the user's submission and the server state. */
  conflictedFields: string[];
  message: string;
  /** The patch the user was trying to apply — needed for Overwrite. */
  pendingPatch: Record<string, unknown>;
}

export type ActiveModal =
  | "none"
  | "ticket"
  | "createTicket"
  | "orchestrator"
  | "search"
  | "createVersion";

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
  orgMembers: OrgMember[];
  currentUserRole: UserRole;
  orchestratorOpen: boolean;
  createModalOpen: boolean;
  createVersionModalOpen: boolean;
  labels: string[];
  /** True while any of the initial data queries are still in flight. */
  isLoading: boolean;
  createTicketLinkSourceId: string | null;
  /** Set when an UpdateTicket mutation returns a ConflictError. Cleared on resolve. */
  conflictError: ActiveConflict | null;
  sprints: Sprint[];
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
  updateTicketPriority: (
    ticketId: string,
    priority: "low" | "medium" | "high",
  ) => void;
  /**
   * Sets the single assignee for a ticket. Pass `null` to clear.
   * The schema still stores an array; we wrap into `[userId]` or `[]` accordingly.
   */
  setTicketAssignee: (ticketId: string, userId: string | null) => void;
  linkTickets: (ticketId: string, targetTicketId: string) => void;
  unlinkTickets: (ticketId: string, targetTicketId: string) => void;
  createVersion: (name: string, releaseDate: string, applyToTicketId?: string) => void;
  deleteVersion: (versionId: string) => void;
  createBoard: (name: string) => Promise<void>;
  archiveBoard: (boardId: string) => Promise<void>;
  restoreBoard: (boardId: string) => Promise<void>;
  purgeBoard: (boardId: string) => Promise<void>;
  createTicket: (payload: CreateTicketInput) => void;
  addLabel: (label: string) => void;
  getTicketShareUrl: (ticketId: string) => string;
  /**
   * Resolve an active conflict.
   * - "overwrite": re-submit the pending patch against the server's current version.
   * - "discard": accept the server's current state, abandon the local change.
   */
  resolveConflict: (strategy: "overwrite" | "discard") => void;
  createSprint: (input: { name: string; startDate: string; endDate: string; capacityPoints?: number }) => Promise<Sprint | null>;
  updateSprint: (id: string, input: { name?: string; startDate?: string; endDate?: string; capacityPoints?: number; status?: Sprint["status"] }) => Promise<void>;
  deleteSprint: (id: string) => Promise<void>;
  upsertSprintAssignment: (input: { sprintId: string; userId: string; availableHours: number }) => Promise<SprintAssignment | null>;
  removeSprintAssignment: (sprintId: string, userId: string) => Promise<void>;
  createEpicSnapshot: (epicTicketId: string, planJson: string) => Promise<EpicSnapshot | null>;
  setMemberRole: (userId: string, role: OrgMemberRole | null) => Promise<void>;
}

export type BoardViewModel = BoardData & BoardActions;

// ── Contexts ─────────────────────────────────────────────────────────

const BoardDataContext = createContext<BoardData | null>(null);
const BoardActionsContext = createContext<BoardActions | null>(null);

// ── Apollo result types (narrowed locally — keeps generated types optional) ──

interface GetBoardsResult { boards: Board[] }
interface GetBoardColumnsResult { boardColumns: BoardColumn[] }
interface GetTicketsResult {
  tickets: { edges: Array<{ cursor: string; node: Ticket }>; pageInfo: { endCursor: string | null; hasNextPage: boolean } };
}
interface GetReleaseVersionsResult { releaseVersions: ReleaseVersion[] }
interface GetLabelsResult { labels: string[] }
interface GetOrgMembersResult { orgMembers: OrgMember[] }
interface GetSprintsResult { sprints: Sprint[] }

// ── Helpers ──────────────────────────────────────────────────────────

const COLUMN_PALETTE = ["#64748b", "#4f46e5", "#0ea5e9", "#f59e0b", "#ef4444", "#22c55e"];
const SLUG = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "-");

function bucketTicketsByColumn(
  columns: BoardColumn[],
  tickets: Ticket[],
): Array<{ column: BoardColumn; tickets: Ticket[] }> {
  const byColumn = new Map<string, Ticket[]>();
  for (const c of columns) byColumn.set(c.id, []);
  for (const t of tickets) {
    const list = byColumn.get(t.columnId);
    if (list) list.push(t);
  }
  return columns
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ column: c, tickets: byColumn.get(c.id) ?? [] }));
}

// ─────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────

export function BoardProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const apollo = useApolloClient();

  // Wait for Clerk to confirm an active org before firing any queries.
  // Without this guard, Apollo fires immediately and the server-side auth()
  // may still see orgId: null in the session cookie (setActive is async).
  const { orgId: clerkOrgId } = useAuth();
  const sessionReady = !!clerkOrgId;

  // ── UI state (was XState; now plain useState) ────────────────────
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>("none");
  const [createTicketLinkSourceId, setCreateTicketLinkSourceId] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<ActiveConflict | null>(null);

  // ── Queries ──────────────────────────────────────────────────────
  const { data: boardsData, loading: boardsLoading } =
    useQuery<GetBoardsResult>(GET_BOARDS, { skip: !sessionReady });
  const boards = boardsData?.boards ?? [];

  // Auto-select a board once boards load.
  // Priority: ?board=X URL param (deep-link) > first available board.
  useEffect(() => {
    if (activeBoardId || boards.length === 0) return;
    const fromUrl = searchParams.get("board");
    const matched = fromUrl ? boards.find((b) => b.id === fromUrl) : null;
    setActiveBoardId(matched?.id ?? boards[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards]);

  const { data: columnsData, loading: columnsLoading } = useQuery<GetBoardColumnsResult>(
    GET_BOARD_COLUMNS,
    { variables: { boardId: activeBoardId }, skip: !activeBoardId },
  );
  const boardColumns = useMemo<BoardColumn[]>(
    () => columnsData?.boardColumns ?? [],
    [columnsData],
  );

  const { data: ticketsData, loading: ticketsLoading } = useQuery<GetTicketsResult>(
    GET_TICKETS,
    {
      variables: { boardId: activeBoardId, first: 200 },
      skip: !activeBoardId,
    },
  );
  const allTickets = useMemo<Ticket[]>(
    () => ticketsData?.tickets.edges.map((e) => e.node) ?? [],
    [ticketsData],
  );

  const { data: versionsData } = useQuery<GetReleaseVersionsResult>(GET_RELEASE_VERSIONS, {
    variables: { boardId: activeBoardId },
    skip: !activeBoardId,
  });
  const releaseVersions = versionsData?.releaseVersions ?? [];

  const { data: labelsData } = useQuery<GetLabelsResult>(GET_LABELS, { skip: !sessionReady });
  const labels = labelsData?.labels ?? [];

  const { data: orgMembersData } = useQuery<GetOrgMembersResult>(GET_ORG_MEMBERS, {
    skip: !sessionReady,
  });
  const orgMembers = useMemo<OrgMember[]>(
    () => orgMembersData?.orgMembers ?? [],
    [orgMembersData],
  );

  const { data: sprintsData } = useQuery<GetSprintsResult>(GET_SPRINTS, {
    variables: { boardId: activeBoardId },
    skip: !activeBoardId,
  });
  const sprints = useMemo<Sprint[]>(() => sprintsData?.sprints ?? [], [sprintsData]);

  const isLoading = boardsLoading || (!!activeBoardId && (columnsLoading || ticketsLoading));

  // ── Mutations ────────────────────────────────────────────────────
  const [createBoardMutation] = useMutation(CREATE_BOARD);
  const [archiveBoardMutation] = useMutation(ARCHIVE_BOARD);
  const [restoreBoardMutation] = useMutation(RESTORE_BOARD);
  const [purgeBoardMutation] = useMutation(PURGE_BOARD);
  const [createColumnMutation] = useMutation(CREATE_COLUMN);
  const [updateColumnMutation] = useMutation(UPDATE_COLUMN);
  const [deleteColumnMutation] = useMutation(DELETE_COLUMN);
  const [reorderColumnsMutation] = useMutation(REORDER_COLUMNS);
  const [createTicketMutation] = useMutation(CREATE_TICKET);
  const [updateTicketMutation] = useMutation(UPDATE_TICKET);
  const [createVersionMutation] = useMutation(CREATE_VERSION);
  const [deleteVersionMutation] = useMutation(DELETE_VERSION);
  const [addLabelMutation] = useMutation(ADD_LABEL);
  const [createSprintMutation] = useMutation(CREATE_SPRINT);
  const [updateSprintMutation] = useMutation(UPDATE_SPRINT);
  const [deleteSprintMutation] = useMutation(DELETE_SPRINT);
  const [upsertSprintAssignmentMutation] = useMutation(UPSERT_SPRINT_ASSIGNMENT);
  const [removeSprintAssignmentMutation] = useMutation(REMOVE_SPRINT_ASSIGNMENT);
  const [createEpicSnapshotMutation] = useMutation(CREATE_EPIC_SNAPSHOT);
  const [setMemberRoleMutation] = useMutation(SET_MEMBER_ROLE);

  // Stable refs so action callbacks don't re-bind every render
  const stateRef = useRef({
    boards,
    boardColumns,
    allTickets,
    activeBoardId,
    createTicketLinkSourceId,
    conflictError,
    pathname,
    searchParams,
    router,
  });
  useEffect(() => {
    stateRef.current = {
      boards,
      boardColumns,
      allTickets,
      activeBoardId,
      createTicketLinkSourceId,
      conflictError,
      pathname,
      searchParams,
      router,
    };
  });

  // ── URL <-> UI sync (deep links) ─────────────────────────────────
  const updateUrlParams = useCallback(
    (next: { modal?: string | null; ticketId?: string | null }) => {
      const params = new URLSearchParams(stateRef.current.searchParams.toString());
      if (typeof next.modal !== "undefined") {
        if (next.modal) params.set("modal", next.modal);
        else params.delete("modal");
      }
      if (typeof next.ticketId !== "undefined") {
        if (next.ticketId) params.set("ticket", next.ticketId);
        else params.delete("ticket");
      }
      const query = params.toString();
      stateRef.current.router.replace(
        query ? `${stateRef.current.pathname}?${query}` : stateRef.current.pathname,
        { scroll: false },
      );
    },
    [],
  );

  // URL → UI: open modals/tickets when query params change
  useEffect(() => {
    const modal = searchParams.get("modal");
    const ticketNumber = searchParams.get("ticket");

    if (ticketNumber) {
      const ticket = allTickets.find(
        (t) => t.ticketNumber.toLowerCase() === ticketNumber.toLowerCase(),
      );
      if (ticket && selectedTicketId !== ticket.id) {
        setSelectedTicketId(ticket.id);
        setActiveModal("ticket");
        return;
      }
    }
    if (modal === "orchestrator" && activeModal !== "orchestrator") {
      setActiveModal("orchestrator");
      return;
    }
    if (modal === "create" && activeModal !== "createTicket") {
      setActiveModal("createTicket");
      return;
    }
    if (modal === "search" && activeModal !== "search") {
      setActiveModal("search");
      return;
    }
    if (modal === "create-version" && activeModal !== "createVersion") {
      setActiveModal("createVersion");
      return;
    }
    if (!ticketNumber && !modal && activeModal !== "none") {
      setActiveModal("none");
      setSelectedTicketId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allTickets]);

  // ── Selectors / derived data ─────────────────────────────────────
  const activeBoardTicketsByColumn = useMemo(
    () => bucketTicketsByColumn(boardColumns, allTickets),
    [boardColumns, allTickets],
  );

  const selectedTicket = useMemo(
    () => allTickets.find((t) => t.id === selectedTicketId) ?? null,
    [allTickets, selectedTicketId],
  );

  const workflowStateOptions = useMemo(() => {
    if (!selectedTicket) return [] as string[];
    return boardColumns.find((c) => c.id === selectedTicket.columnId)?.states ?? [];
  }, [boardColumns, selectedTicket]);

  const globalWorkflowStateOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of boardColumns) for (const s of c.states) set.add(s);
    return Array.from(set);
  }, [boardColumns]);

  const workflowChoicesOrdered = useMemo(
    () =>
      boardColumns
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((c) => ({
          columnId: c.id,
          columnName: c.name,
          color: c.color,
          states: c.states,
        })),
    [boardColumns],
  );

  const linkedTickets = useMemo(() => {
    if (!selectedTicket) return [] as Ticket[];
    return allTickets.filter((t) => selectedTicket.linkedTicketIds.includes(t.id));
  }, [allTickets, selectedTicket]);

  // ─────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────
  const actions = useMemo<BoardActions>(() => {
    const findTicket = (id: string) =>
      stateRef.current.allTickets.find((t) => t.id === id);

    /**
     * Wraps a partial ticket field patch into the optimistic-concurrency
     * `UpdateTicketInput` shape (with `expectedVersion`) and dispatches.
     * On `ConflictError`, sets `conflictError` UI state so TicketModal
     * can render a diff/resolve banner.
     */
    const dispatchTicketPatch = async (
      ticketId: string,
      patch: Record<string, unknown>,
    ) => {
      const current = findTicket(ticketId);
      if (!current) return;
      const result = await updateTicketMutation({
        variables: {
          id: ticketId,
          input: { ...patch, expectedVersion: current.version },
        },
        // Keep the History tab in sync when the user toggles it open after an edit.
        refetchQueries: [{ query: GET_TICKET_HISTORY, variables: { ticketId } }],
      });
      const payload = (result.data as Record<string, unknown> | undefined)?.updateTicket as
        | ({ __typename: "Ticket" } & Ticket)
        | { __typename: "ConflictError"; currentState: Ticket; conflictedFields: string[]; message: string }
        | undefined;
      if (payload?.__typename === "ConflictError") {
        setConflictError({
          ticketId,
          currentState: payload.currentState,
          conflictedFields: payload.conflictedFields,
          message: payload.message,
          pendingPatch: patch,
        });
      }
    };

    return {
      selectBoard: (boardId) => {
        setActiveBoardId(boardId);
        const params = new URLSearchParams(stateRef.current.searchParams.toString());
        params.set("board", boardId);
        stateRef.current.router.replace(
          `${stateRef.current.pathname}?${params.toString()}`,
          { scroll: false },
        );
      },

      openTicket: (ticketId) => {
        setSelectedTicketId(ticketId);
        setActiveModal("ticket");
        const ticket = findTicket(ticketId);
        updateUrlParams({ ticketId: ticket?.ticketNumber ?? null, modal: "ticket" });
      },

      closeModal: () => {
        setSelectedTicketId(null);
        setActiveModal("none");
        setCreateTicketLinkSourceId(null);
        updateUrlParams({ ticketId: null, modal: null });
      },

      openCreateTicket: () => {
        setActiveModal("createTicket");
        setCreateTicketLinkSourceId(null);
        updateUrlParams({ ticketId: null, modal: "create" });
      },

      openCreateTicketLinkedTo: (ticketId) => {
        setActiveModal("createTicket");
        setCreateTicketLinkSourceId(ticketId);
        updateUrlParams({ ticketId: null, modal: "create" });
      },

      openSearch: () => {
        setActiveModal("search");
        updateUrlParams({ ticketId: null, modal: "search" });
      },

      openCreateVersion: () => {
        setActiveModal("createVersion");
        updateUrlParams({ modal: "create-version" });
      },

      openOrchestrator: () => {
        setActiveModal("orchestrator");
        updateUrlParams({ ticketId: null, modal: "orchestrator" });
      },

      addBoardColumn: async (boardId, columnName, states) => {
        const trimmed = columnName.trim();
        if (!trimmed) return;
        const existing = stateRef.current.boardColumns.filter((c) => c.boardId === boardId);
        if (existing.length >= 6) return;
        const color = COLUMN_PALETTE[existing.length] ?? "#64748b";
        await createColumnMutation({
          variables: {
            input: {
              boardId,
              name: trimmed,
              states: states.length ? states : [SLUG(trimmed)],
              color,
            },
          },
          refetchQueries: [{ query: GET_BOARD_COLUMNS, variables: { boardId } }],
        });
      },

      updateColumnState: async (columnId, states) => {
        await updateColumnMutation({
          variables: { id: columnId, input: { states } },
        });
      },

      updateColumnColor: async (columnId, color) => {
        await updateColumnMutation({
          variables: { id: columnId, input: { color } },
        });
      },

      renameColumn: async (columnId, name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        await updateColumnMutation({
          variables: { id: columnId, input: { name: trimmed } },
        });
      },

      deleteColumn: async (columnId) => {
        const boardId = stateRef.current.activeBoardId;
        if (!boardId) return;
        await deleteColumnMutation({
          variables: { id: columnId },
          refetchQueries: [
            { query: GET_BOARD_COLUMNS, variables: { boardId } },
            { query: GET_TICKETS, variables: { boardId, first: 200 } },
          ],
        });
      },

      reorderColumns: async (boardId, orderedColumnIds) => {
        await reorderColumnsMutation({
          variables: { boardId, orderedIds: orderedColumnIds },
          refetchQueries: [{ query: GET_BOARD_COLUMNS, variables: { boardId } }],
        });
      },

      moveTicketToColumn: async (ticketId, columnId) => {
        const target = stateRef.current.boardColumns.find((c) => c.id === columnId);
        if (!target) return;
        await dispatchTicketPatch(ticketId, {
          columnId,
          workflowState: target.states[0] ?? undefined,
        });
      },

      updateTicketField: async (ticketId, field, value) => {
        await dispatchTicketPatch(ticketId, { [field]: value });
      },

      updateTicketWorkflowState: async (ticketId, workflowState) => {
        const target = stateRef.current.boardColumns.find((c) =>
          c.states.includes(workflowState),
        );
        await dispatchTicketPatch(ticketId, {
          workflowState,
          columnId: target?.id ?? undefined,
        });
      },

      updateTicketStoryPoints: async (ticketId, storyPoints) => {
        await dispatchTicketPatch(ticketId, { storyPoints });
      },

      updateTicketPriority: async (ticketId, priority) => {
        await dispatchTicketPatch(ticketId, { priority });
      },

      setTicketAssignee: async (ticketId, userId) => {
        await dispatchTicketPatch(ticketId, {
          assigneeIds: userId ? [userId] : [],
        });
      },

      linkTickets: async (ticketId, targetTicketId) => {
        if (ticketId === targetTicketId) return;
        const a = findTicket(ticketId);
        const b = findTicket(targetTicketId);
        if (!a || !b) return;
        if (!a.linkedTicketIds.includes(targetTicketId)) {
          await updateTicketMutation({
            variables: {
              id: ticketId,
              input: {
                linkedTicketIds: [...a.linkedTicketIds, targetTicketId],
                expectedVersion: a.version,
              },
            },
          });
        }
        if (!b.linkedTicketIds.includes(ticketId)) {
          await updateTicketMutation({
            variables: {
              id: targetTicketId,
              input: {
                linkedTicketIds: [...b.linkedTicketIds, ticketId],
                expectedVersion: b.version,
              },
            },
          });
        }
      },

      unlinkTickets: async (ticketId, targetTicketId) => {
        const a = findTicket(ticketId);
        const b = findTicket(targetTicketId);
        if (a && a.linkedTicketIds.includes(targetTicketId)) {
          await updateTicketMutation({
            variables: {
              id: ticketId,
              input: {
                linkedTicketIds: a.linkedTicketIds.filter((id) => id !== targetTicketId),
                expectedVersion: a.version,
              },
            },
          });
        }
        if (b && b.linkedTicketIds.includes(ticketId)) {
          await updateTicketMutation({
            variables: {
              id: targetTicketId,
              input: {
                linkedTicketIds: b.linkedTicketIds.filter((id) => id !== ticketId),
                expectedVersion: b.version,
              },
            },
          });
        }
      },

      createVersion: async (name, releaseDate, applyToTicketId) => {
        const boardId = stateRef.current.activeBoardId;
        if (!boardId) return;
        const trimmed = name.trim();
        if (!trimmed) return;
        await createVersionMutation({
          variables: { boardId, name: trimmed, releaseDate },
          refetchQueries: [{ query: GET_RELEASE_VERSIONS, variables: { boardId } }],
        });
        if (applyToTicketId) {
          await dispatchTicketPatch(applyToTicketId, { fixVersion: trimmed });
        }
      },

      deleteVersion: async (versionId) => {
        const boardId = stateRef.current.activeBoardId;
        await deleteVersionMutation({
          variables: { id: versionId },
          refetchQueries: boardId
            ? [{ query: GET_RELEASE_VERSIONS, variables: { boardId } }]
            : [],
        });
      },

      createTicket: async (payload) => {
        const boardId = stateRef.current.activeBoardId;
        if (!boardId) return;
        const result = await createTicketMutation({
          variables: { input: payload },
          refetchQueries: [{ query: GET_TICKETS, variables: { boardId, first: 200 } }],
        });
        const created = (result.data as { createTicket?: Ticket } | null | undefined)?.createTicket;
        // If we opened the create modal from another ticket, link them after creation
        const linkSource = stateRef.current.createTicketLinkSourceId;
        if (created && linkSource) {
          const source = stateRef.current.allTickets.find((t) => t.id === linkSource);
          if (source) {
            await updateTicketMutation({
              variables: {
                id: linkSource,
                input: {
                  linkedTicketIds: [...source.linkedTicketIds, created.id],
                  expectedVersion: source.version,
                },
              },
            });
            await updateTicketMutation({
              variables: {
                id: created.id,
                input: {
                  linkedTicketIds: [linkSource],
                  expectedVersion: created.version,
                },
              },
            });
          }
        }
        setCreateTicketLinkSourceId(null);
        setActiveModal("none");
        updateUrlParams({ modal: null });
      },

      createBoard: async (name) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const result = await createBoardMutation({
          variables: { input: { name: trimmed } },
          refetchQueries: [{ query: GET_BOARDS }],
        });
        const created = (result.data as { createBoard?: Board } | null | undefined)?.createBoard;
        if (created) setActiveBoardId(created.id);
      },

      archiveBoard: async (boardId) => {
        await archiveBoardMutation({
          variables: { id: boardId },
          refetchQueries: [{ query: GET_BOARDS }, { query: GET_ARCHIVED_BOARDS }],
          awaitRefetchQueries: true,
        });
        // If the user just archived the board they were viewing, switch to the
        // first remaining active board (or null if there is none).
        if (stateRef.current.activeBoardId === boardId) {
          const remaining = stateRef.current.boards.filter((b) => b.id !== boardId && !b.deletedAt);
          setActiveBoardId(remaining[0]?.id ?? null);
        }
      },

      restoreBoard: async (boardId) => {
        await restoreBoardMutation({
          variables: { id: boardId },
          refetchQueries: [{ query: GET_BOARDS }, { query: GET_ARCHIVED_BOARDS }],
          awaitRefetchQueries: true,
        });
      },

      purgeBoard: async (boardId) => {
        await purgeBoardMutation({
          variables: { id: boardId },
          refetchQueries: [{ query: GET_BOARDS }, { query: GET_ARCHIVED_BOARDS }],
          awaitRefetchQueries: true,
        });
      },

      addLabel: async (label) => {
        const trimmed = label.trim().toLowerCase();
        if (!trimmed) return;
        await addLabelMutation({
          variables: { label: trimmed },
          refetchQueries: [{ query: GET_LABELS }],
        });
      },

      getTicketShareUrl: (ticketId) => {
        if (typeof window === "undefined") return "";
        const ticket = stateRef.current.allTickets.find((t) => t.id === ticketId);
        if (!ticket) return "";
        return `${window.location.origin}/tickets/${ticket.ticketNumber}`;
      },

      createSprint: async (input) => {
        const boardId = stateRef.current.activeBoardId;
        if (!boardId) return null;
        const result = await createSprintMutation({
          variables: { input: { ...input, boardId } },
          refetchQueries: [{ query: GET_SPRINTS, variables: { boardId } }],
        });
        return (result.data as { createSprint?: Sprint } | null | undefined)?.createSprint ?? null;
      },

      updateSprint: async (id, input) => {
        const boardId = stateRef.current.activeBoardId;
        await updateSprintMutation({
          variables: { id, input },
          refetchQueries: boardId ? [{ query: GET_SPRINTS, variables: { boardId } }] : [],
        });
      },

      deleteSprint: async (id) => {
        const boardId = stateRef.current.activeBoardId;
        await deleteSprintMutation({
          variables: { id },
          refetchQueries: boardId ? [{ query: GET_SPRINTS, variables: { boardId } }] : [],
        });
      },

      upsertSprintAssignment: async (input) => {
        const result = await upsertSprintAssignmentMutation({
          variables: { input },
        });
        return (result.data as { upsertSprintAssignment?: SprintAssignment } | null | undefined)?.upsertSprintAssignment ?? null;
      },

      removeSprintAssignment: async (sprintId, userId) => {
        await removeSprintAssignmentMutation({ variables: { sprintId, userId } });
      },

      createEpicSnapshot: async (epicTicketId, planJson) => {
        const result = await createEpicSnapshotMutation({
          variables: { epicTicketId, planJson },
        });
        return (result.data as { createEpicSnapshot?: EpicSnapshot } | null | undefined)?.createEpicSnapshot ?? null;
      },

      setMemberRole: async (userId, role) => {
        await setMemberRoleMutation({
          variables: { userId, role },
          refetchQueries: [{ query: GET_ORG_MEMBERS }],
        });
      },

      resolveConflict: async (strategy) => {
        const conflict = stateRef.current.conflictError;
        if (!conflict) return;
        if (strategy === "overwrite") {
          // Re-submit the same patch but with the server's current version
          const result = await updateTicketMutation({
            variables: {
              id: conflict.ticketId,
              input: { ...conflict.pendingPatch, expectedVersion: conflict.currentState.version },
            },
          });
          const payload = (result.data as Record<string, unknown> | undefined)?.updateTicket as
            | ({ __typename: "Ticket" } & Ticket)
            | { __typename: "ConflictError"; currentState: Ticket; conflictedFields: string[]; message: string }
            | undefined;
          if (payload?.__typename === "ConflictError") {
            // Another conflict after overwrite — update with fresh conflict
            setConflictError({
              ticketId: conflict.ticketId,
              currentState: payload.currentState,
              conflictedFields: payload.conflictedFields,
              message: payload.message,
              pendingPatch: conflict.pendingPatch,
            });
            return;
          }
        }
        // discard OR overwrite succeeded — clear conflict; Apollo cache already has latest
        setConflictError(null);
      },
    };
  }, [
    addLabelMutation,
    archiveBoardMutation,
    createBoardMutation,
    createColumnMutation,
    createEpicSnapshotMutation,
    createSprintMutation,
    createTicketMutation,
    createVersionMutation,
    deleteColumnMutation,
    deleteSprintMutation,
    deleteVersionMutation,
    purgeBoardMutation,
    reorderColumnsMutation,
    removeSprintAssignmentMutation,
    restoreBoardMutation,
    setMemberRoleMutation,
    updateColumnMutation,
    updateSprintMutation,
    updateTicketMutation,
    upsertSprintAssignmentMutation,
    updateUrlParams,
  ]);

  // Suppress unused-warning for apollo client (kept for future cache writes)
  void apollo;

  // ── Data context value ───────────────────────────────────────────
  const data = useMemo<BoardData>(
    () => ({
      boards,
      allTickets,
      boardColumns,
      activeBoardId,
      activeBoardTicketsByColumn,
      selectedTicket,
      activeModal,
      workflowStateOptions,
      globalWorkflowStateOptions,
      workflowChoicesOrdered,
      linkedTickets,
      currentUserRole: "member",
      releaseVersions,
      orgMembers,
      orchestratorOpen: activeModal === "orchestrator",
      createModalOpen: activeModal === "createTicket",
      createVersionModalOpen: activeModal === "createVersion",
      labels,
      isLoading,
      createTicketLinkSourceId,
      conflictError,
      sprints,
    }),
    [
      boards,
      allTickets,
      boardColumns,
      activeBoardId,
      activeBoardTicketsByColumn,
      selectedTicket,
      activeModal,
      workflowStateOptions,
      globalWorkflowStateOptions,
      workflowChoicesOrdered,
      linkedTickets,
      releaseVersions,
      orgMembers,
      labels,
      isLoading,
      createTicketLinkSourceId,
      conflictError,
      sprints,
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
