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
  OrgMember,
  OrgMemberRole,
  ReleaseVersion,
  Sprint,
  SprintAssignment,
  Ticket,
  TicketHierarchyType,
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
  | "createVersion"
  | "createSprint"
  | "editSprint"
  | "members";

/**
 * Board kanban view modes.
 * - `board`: kanban filtered to the selected sprint (defaults to the active sprint).
 * - `backlog`: expandable all-sprints + backlog list view (BacklogView handles its own filtering).
 */
export type BoardViewMode = "board" | "backlog";

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
  /** When set, the create-ticket modal pre-fills `parentTicketId` with this value. */
  createTicketParentId: string | null;
  /** Set when an UpdateTicket mutation returns a ConflictError. Cleared on resolve. */
  conflictError: ActiveConflict | null;
  sprints: Sprint[];
  viewMode: BoardViewMode;
  /** Sprint currently focused in the `board` view. Null when no sprint exists. */
  selectedSprintId: string | null;
  /** Resolved sprint object for `selectedSprintId`. Null when none is selected. */
  selectedSprint: Sprint | null;
  /** True only when there is no sprint at all on the active board. */
  hasNoSprints: boolean;
  createSprintModalOpen: boolean;
  /**
   * Sum of `storyPoints` for tickets in the selected sprint.
   * 0 when no sprint is selected. Used by the capacity bar.
   */
  committedPoints: number;
  /**
   * Average `completedPoints` across the last 3 sprints with status `completed`.
   * Null when there is insufficient history (< 1 completed sprint).
   * Drives the velocity badge and Controller-agent realism check.
   */
  velocity: number | null;
}

export interface BoardActions {
  selectBoard: (boardId: string) => void;
  openTicket: (ticketId: string) => void;
  closeModal: () => void;
  openCreateTicket: () => void;
  openCreateTicketLinkedTo: (ticketId: string) => void;
  openCreateTicketAsChildOf: (parentTicketId: string) => void;
  openSearch: () => void;
  openCreateVersion: () => void;
  openOrchestrator: () => void;
  addBoardColumn: (
    boardId: string,
    columnName: string,
    states: string[],
  ) => void;
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
  /** Set ticket's parent (epic). Pass `null` to detach. */
  setTicketParent: (ticketId: string, parentId: string | null) => Promise<void>;
  /** Change a ticket's hierarchy type (epic / story / task). */
  setTicketHierarchyType: (ticketId: string, hierarchyType: TicketHierarchyType) => Promise<void>;
  linkTickets: (ticketId: string, targetTicketId: string) => void;
  unlinkTickets: (ticketId: string, targetTicketId: string) => void;
  createVersion: (
    name: string,
    releaseDate: string,
    applyToTicketId?: string,
  ) => void;
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
  createSprint: (input: {
    name?: string;
    description?: string;
    goal?: string;
    startDate: string;
    endDate: string;
    capacityPoints?: number;
  }) => Promise<Sprint | null>;
  updateSprint: (
    id: string,
    input: {
      name?: string;
      description?: string;
      goal?: string;
      startDate?: string;
      endDate?: string;
      capacityPoints?: number;
      status?: Sprint["status"];
    },
  ) => Promise<void>;
  deleteSprint: (id: string) => Promise<void>;
  upsertSprintAssignment: (input: {
    sprintId: string;
    userId: string;
    availableHours: number;
  }) => Promise<SprintAssignment | null>;
  removeSprintAssignment: (sprintId: string, userId: string) => Promise<void>;
  setMemberRole: (userId: string, role: OrgMemberRole | null) => Promise<void>;
  setViewMode: (mode: BoardViewMode) => void;
  selectSprint: (sprintId: string) => void;
  openCreateSprint: () => void;
  openEditSprint: (sprintId: string) => void;
  openMembers: () => void;
  /** Add or remove a ticket from a sprint. */
  setTicketSprints: (ticketId: string, sprintIds: string[]) => Promise<void>;
}

export type BoardViewModel = BoardData & BoardActions;

// ── Contexts ─────────────────────────────────────────────────────────

const BoardDataContext = createContext<BoardData | null>(null);
const BoardActionsContext = createContext<BoardActions | null>(null);

// ── Apollo result types (narrowed locally — keeps generated types optional) ──

interface GetBoardsResult {
  boards: Board[];
}
interface GetBoardColumnsResult {
  boardColumns: BoardColumn[];
}
interface GetTicketsResult {
  tickets: {
    edges: Array<{ cursor: string; node: Ticket }>;
    pageInfo: { endCursor: string | null; hasNextPage: boolean };
  };
}
interface GetReleaseVersionsResult {
  releaseVersions: ReleaseVersion[];
}
interface GetLabelsResult {
  labels: string[];
}
interface GetOrgMembersResult {
  orgMembers: OrgMember[];
}
interface GetSprintsResult {
  sprints: Sprint[];
}

// ── Helpers ──────────────────────────────────────────────────────────

const COLUMN_PALETTE = [
  "#64748b",
  "#4f46e5",
  "#0ea5e9",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
];
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

  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>("none");
  const [createTicketParentId, setCreateTicketParentId] = useState<string | null>(null);
  const [createTicketLinkSourceId, setCreateTicketLinkSourceId] = useState<
    string | null
  >(null);
  const [conflictError, setConflictError] = useState<ActiveConflict | null>(
    null,
  );
  // Per-ticket mutation queue: serializes patches so two rapid edits never
  // share the same expectedVersion and trigger a false self-conflict.
  const ticketPatchQueues = useRef<Map<string, Promise<void>>>(new Map());
  const [viewMode, setViewModeState] = useState<BoardViewMode>("board");
  const [selectedSprintIdState, setSelectedSprintIdState] = useState<
    string | null
  >(null);

  // ── Queries ──────────────────────────────────────────────────────
  const { data: boardsData, loading: boardsLoading } =
    useQuery<GetBoardsResult>(GET_BOARDS, { skip: !sessionReady });
  // Stabilize the reference: `data?.boards ?? []` returns a fresh array every
  // render, which would invalidate downstream useMemo deps each tick.
  const boards = useMemo(() => boardsData?.boards ?? [], [boardsData]);

  // Auto-select a board once boards load.
  // Priority: ?board=X URL param (deep-link) > first available board.
  // setState-in-effect is intentional: boards are loaded async via Apollo
  // and the choice depends on the URL, so we can't derive the initial value
  // at render time. searchParams is excluded from deps to avoid re-running
  // when the user navigates within the app — the effect only owns the
  // first selection.
  useEffect(() => {
    if (activeBoardId || boards.length === 0) return;
    const fromUrl = searchParams.get("board");
    const matched = fromUrl ? boards.find((b) => b.id === fromUrl) : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveBoardId(matched?.id ?? boards[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boards]);

  const { data: columnsData, loading: columnsLoading } =
    useQuery<GetBoardColumnsResult>(GET_BOARD_COLUMNS, {
      variables: { boardId: activeBoardId },
      skip: !activeBoardId,
    });
  const boardColumns = useMemo<BoardColumn[]>(
    () => columnsData?.boardColumns ?? [],
    [columnsData],
  );

  const { data: ticketsData, loading: ticketsLoading } =
    useQuery<GetTicketsResult>(GET_TICKETS, {
      variables: { boardId: activeBoardId, first: 200 },
      skip: !activeBoardId,
    });
  const allTickets = useMemo<Ticket[]>(
    () => ticketsData?.tickets.edges.map((e) => e.node) ?? [],
    [ticketsData],
  );

  const { data: versionsData } = useQuery<GetReleaseVersionsResult>(
    GET_RELEASE_VERSIONS,
    {
      variables: { boardId: activeBoardId },
      skip: !activeBoardId,
    },
  );
  const releaseVersions = useMemo(
    () => versionsData?.releaseVersions ?? [],
    [versionsData],
  );

  const { data: labelsData } = useQuery<GetLabelsResult>(GET_LABELS, {
    skip: !sessionReady,
  });
  const labels = useMemo(() => labelsData?.labels ?? [], [labelsData]);

  const { data: orgMembersData } = useQuery<GetOrgMembersResult>(
    GET_ORG_MEMBERS,
    {
      skip: !sessionReady,
    },
  );
  const orgMembers = useMemo<OrgMember[]>(
    () => orgMembersData?.orgMembers ?? [],
    [orgMembersData],
  );

  const { data: sprintsData } = useQuery<GetSprintsResult>(GET_SPRINTS, {
    variables: { boardId: activeBoardId },
    skip: !activeBoardId,
  });
  const sprints = useMemo<Sprint[]>(
    () => sprintsData?.sprints ?? [],
    [sprintsData],
  );

  const isLoading =
    boardsLoading || (!!activeBoardId && (columnsLoading || ticketsLoading));

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
  const [upsertSprintAssignmentMutation] = useMutation(
    UPSERT_SPRINT_ASSIGNMENT,
  );
  const [removeSprintAssignmentMutation] = useMutation(
    REMOVE_SPRINT_ASSIGNMENT,
  );
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
      const params = new URLSearchParams(
        stateRef.current.searchParams.toString(),
      );
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
        query
          ? `${stateRef.current.pathname}?${query}`
          : stateRef.current.pathname,
        { scroll: false },
      );
    },
    [],
  );

  // URL → UI: open modals/tickets when query params change. This is a
  // legitimate "sync with external system" (the URL bar) — we can't derive
  // these modal states at render because URL changes are imperative
  // navigation events. setState-in-effect is correct here.
  /* eslint-disable react-hooks/set-state-in-effect */
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
    if (modal === "create-sprint" && activeModal !== "createSprint") {
      setActiveModal("createSprint");
      return;
    }
    if (!ticketNumber && !modal && activeModal !== "none") {
      setActiveModal("none");
      setSelectedTicketId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allTickets]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Sprint selection / view-mode derivations ─────────────────────
  /**
   * The "currently focused" sprint defaults to the board's active sprint
   * (status === "active") when the user hasn't explicitly picked another.
   * Falling through this priority chain keeps the UI sensible whether
   * the board has 0, 1, or many sprints.
   */
  const defaultSprintId = useMemo<string | null>(() => {
    const today = new Date().toISOString().slice(0, 10);
    // Find sprint whose dates include today
    const currentSprint = sprints.find(
      (s) => s.startDate <= today && today <= s.endDate,
    );
    if (currentSprint) return currentSprint.id;
    // Fallback to active status
    const active = sprints.find((s) => s.status === "active");
    if (active) return active.id;
    // Fallback to planning status
    const planning = sprints.find((s) => s.status === "planning");
    if (planning) return planning.id;
    // Fallback to first sprint
    return sprints[0]?.id ?? null;
  }, [sprints]);

  const selectedSprintId = selectedSprintIdState ?? defaultSprintId;
  const selectedSprint = useMemo(
    () => sprints.find((s) => s.id === selectedSprintId) ?? null,
    [sprints, selectedSprintId],
  );
  const hasNoSprints = sprints.length === 0;

  // In `board` mode: filter to the selected sprint. In `backlog` mode the kanban
  // is replaced by BacklogView which handles its own filtering — return all.
  const filteredTickets = useMemo(() => {
    if (viewMode === "board" && selectedSprintId) {
      return allTickets.filter((t) => t.sprintIds.includes(selectedSprintId));
    }
    return allTickets;
  }, [allTickets, viewMode, selectedSprintId]);

  // ── Selectors / derived data ─────────────────────────────────────
  const activeBoardTicketsByColumn = useMemo(
    () => bucketTicketsByColumn(boardColumns, filteredTickets),
    [boardColumns, filteredTickets],
  );

  const committedPoints = useMemo(() => {
    if (!selectedSprintId) return 0;
    return allTickets
      .filter((t) => t.sprintIds.includes(selectedSprintId))
      .reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  }, [allTickets, selectedSprintId]);

  /**
   * Velocity: average `completedPoints` over the last 3 completed sprints.
   * Returned as null when history is too thin to be meaningful.
   */
  const velocity = useMemo<number | null>(() => {
    const completed = sprints
      .filter(
        (s) =>
          s.status === "completed" && typeof s.completedPoints === "number",
      )
      .slice()
      .sort((a, b) => b.endDate.localeCompare(a.endDate))
      .slice(0, 3);
    if (completed.length === 0) return null;
    const sum = completed.reduce((acc, s) => acc + (s.completedPoints ?? 0), 0);
    return Math.round(sum / completed.length);
  }, [sprints]);

  const selectedTicket = useMemo(
    () => allTickets.find((t) => t.id === selectedTicketId) ?? null,
    [allTickets, selectedTicketId],
  );

  const workflowStateOptions = useMemo(() => {
    if (!selectedTicket) return [] as string[];
    return (
      boardColumns.find((c) => c.id === selectedTicket.columnId)?.states ?? []
    );
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
    const targetIds = new Set(selectedTicket.links.map((l) => l.targetTicketId));
    return allTickets.filter((t) => targetIds.has(t.id));
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
    const dispatchTicketPatch = (
      ticketId: string,
      patch: Record<string, unknown>,
    ): Promise<void> => {
      const queues = ticketPatchQueues.current;
      const prev = queues.get(ticketId) ?? Promise.resolve();
      const next = prev
        .then(async () => {
          const current = findTicket(ticketId);
          if (!current) return;
          const result = await updateTicketMutation({
            variables: {
              id: ticketId,
              input: { ...patch, expectedVersion: current.version },
            },
            // Keep the History tab in sync when the user toggles it open after an edit.
            refetchQueries: [
              { query: GET_TICKET_HISTORY, variables: { ticketId } },
            ],
          });
          const payload = (result.data as Record<string, unknown> | undefined)
            ?.updateTicket as
            | ({ __typename: "Ticket" } & Ticket)
            | {
                __typename: "ConflictError";
                currentState: Ticket;
                conflictedFields: string[];
                message: string;
              }
            | undefined;
          if (payload?.__typename === "ConflictError") {
            setConflictError({
              ticketId,
              currentState: payload.currentState,
              conflictedFields: payload.conflictedFields,
              message: payload.message,
              pendingPatch: patch,
            });
            // Surface the resolution banner. For modal-internal edits (typing,
            // dropdowns) the modal is already open and this is a no-op. For
            // out-of-modal patch paths (drag-and-drop, programmatic moves) this
            // is what makes the conflict reachable instead of silently failing.
            setSelectedTicketId(ticketId);
            setActiveModal("ticket");
            updateUrlParams({
              ticketId: payload.currentState.ticketNumber,
              modal: "ticket",
            });
          }
        })
        .catch(() => {});
      queues.set(ticketId, next);
      return next;
    };

    return {
      selectBoard: (boardId) => {
        setActiveBoardId(boardId);
        const params = new URLSearchParams(
          stateRef.current.searchParams.toString(),
        );
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
        updateUrlParams({
          ticketId: ticket?.ticketNumber ?? null,
          modal: "ticket",
        });
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
        setCreateTicketParentId(null);
        updateUrlParams({ ticketId: null, modal: "create" });
      },

      openCreateTicketLinkedTo: (ticketId) => {
        setActiveModal("createTicket");
        setCreateTicketLinkSourceId(ticketId);
        setCreateTicketParentId(null);
        updateUrlParams({ ticketId: null, modal: "create" });
      },

      openCreateTicketAsChildOf: (parentTicketId) => {
        setActiveModal("createTicket");
        setCreateTicketLinkSourceId(null);
        setCreateTicketParentId(parentTicketId);
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
        const existing = stateRef.current.boardColumns.filter(
          (c) => c.boardId === boardId,
        );
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
          refetchQueries: [
            { query: GET_BOARD_COLUMNS, variables: { boardId } },
          ],
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
          refetchQueries: [
            { query: GET_BOARD_COLUMNS, variables: { boardId } },
          ],
        });
      },

      moveTicketToColumn: async (ticketId, columnId) => {
        const target = stateRef.current.boardColumns.find(
          (c) => c.id === columnId,
        );
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

      setTicketParent: async (ticketId, parentId) => {
        await dispatchTicketPatch(ticketId, { parentTicketId: parentId });
      },

      setTicketHierarchyType: async (ticketId, hierarchyType) => {
        // Promoting to epic clears any parent (epics can't have parents).
        const patch: Record<string, unknown> = { hierarchyType };
        if (hierarchyType === "epic") patch.parentTicketId = null;
        await dispatchTicketPatch(ticketId, patch);
      },

      linkTickets: async (ticketId, targetTicketId) => {
        if (ticketId === targetTicketId) return;
        const a = findTicket(ticketId);
        const b = findTicket(targetTicketId);
        if (!a || !b) return;
        if (!a.links.some((l) => l.targetTicketId === targetTicketId)) {
          await updateTicketMutation({
            variables: {
              id: ticketId,
              input: {
                links: [...a.links, { kind: "relatedTo", targetTicketId }],
                expectedVersion: a.version,
              },
            },
          });
        }
        if (!b.links.some((l) => l.targetTicketId === ticketId)) {
          await updateTicketMutation({
            variables: {
              id: targetTicketId,
              input: {
                links: [...b.links, { kind: "relatedTo", targetTicketId: ticketId }],
                expectedVersion: b.version,
              },
            },
          });
        }
      },

      unlinkTickets: async (ticketId, targetTicketId) => {
        const a = findTicket(ticketId);
        const b = findTicket(targetTicketId);
        if (a && a.links.some((l) => l.targetTicketId === targetTicketId)) {
          await updateTicketMutation({
            variables: {
              id: ticketId,
              input: {
                links: a.links.filter((l) => l.targetTicketId !== targetTicketId),
                expectedVersion: a.version,
              },
            },
          });
        }
        if (b && b.links.some((l) => l.targetTicketId === ticketId)) {
          await updateTicketMutation({
            variables: {
              id: targetTicketId,
              input: {
                links: b.links.filter((l) => l.targetTicketId !== ticketId),
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
          refetchQueries: [
            { query: GET_RELEASE_VERSIONS, variables: { boardId } },
          ],
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
          refetchQueries: [
            { query: GET_TICKETS, variables: { boardId, first: 200 } },
          ],
        });
        const created = (
          result.data as { createTicket?: Ticket } | null | undefined
        )?.createTicket;
        // If we opened the create modal from another ticket, link them after creation
        const linkSource = stateRef.current.createTicketLinkSourceId;
        if (created && linkSource) {
          const source = stateRef.current.allTickets.find(
            (t) => t.id === linkSource,
          );
          if (source) {
            await updateTicketMutation({
              variables: {
                id: linkSource,
                input: {
                  links: [
                    ...source.links,
                    { kind: "relatedTo", targetTicketId: created.id },
                  ],
                  expectedVersion: source.version,
                },
              },
            });
            await updateTicketMutation({
              variables: {
                id: created.id,
                input: {
                  links: [{ kind: "relatedTo", targetTicketId: linkSource }],
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
        const created = (
          result.data as { createBoard?: Board } | null | undefined
        )?.createBoard;
        if (created) setActiveBoardId(created.id);
      },

      archiveBoard: async (boardId) => {
        await archiveBoardMutation({
          variables: { id: boardId },
          refetchQueries: [
            { query: GET_BOARDS },
            { query: GET_ARCHIVED_BOARDS },
          ],
          awaitRefetchQueries: true,
        });
        // If the user just archived the board they were viewing, switch to the
        // first remaining active board (or null if there is none).
        if (stateRef.current.activeBoardId === boardId) {
          const remaining = stateRef.current.boards.filter(
            (b) => b.id !== boardId && !b.deletedAt,
          );
          setActiveBoardId(remaining[0]?.id ?? null);
        }
      },

      restoreBoard: async (boardId) => {
        await restoreBoardMutation({
          variables: { id: boardId },
          refetchQueries: [
            { query: GET_BOARDS },
            { query: GET_ARCHIVED_BOARDS },
          ],
          awaitRefetchQueries: true,
        });
      },

      purgeBoard: async (boardId) => {
        await purgeBoardMutation({
          variables: { id: boardId },
          refetchQueries: [
            { query: GET_BOARDS },
            { query: GET_ARCHIVED_BOARDS },
          ],
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
        const ticket = stateRef.current.allTickets.find(
          (t) => t.id === ticketId,
        );
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
        return (
          (result.data as { createSprint?: Sprint } | null | undefined)
            ?.createSprint ?? null
        );
      },

      updateSprint: async (id, input) => {
        const boardId = stateRef.current.activeBoardId;
        await updateSprintMutation({
          variables: { id, input },
          refetchQueries: boardId
            ? [{ query: GET_SPRINTS, variables: { boardId } }]
            : [],
        });
      },

      deleteSprint: async (id) => {
        const boardId = stateRef.current.activeBoardId;
        await deleteSprintMutation({
          variables: { id },
          refetchQueries: boardId
            ? [{ query: GET_SPRINTS, variables: { boardId } }]
            : [],
        });
      },

      upsertSprintAssignment: async (input) => {
        const result = await upsertSprintAssignmentMutation({
          variables: { input },
        });
        return (
          (
            result.data as
              | { upsertSprintAssignment?: SprintAssignment }
              | null
              | undefined
          )?.upsertSprintAssignment ?? null
        );
      },

      removeSprintAssignment: async (sprintId, userId) => {
        await removeSprintAssignmentMutation({
          variables: { sprintId, userId },
        });
      },

      setMemberRole: async (userId, role) => {
        await setMemberRoleMutation({
          variables: { userId, role },
          refetchQueries: [{ query: GET_ORG_MEMBERS }],
        });
      },

      setViewMode: (mode) => {
        setViewModeState(mode);
      },

      selectSprint: (sprintId) => {
        setSelectedSprintIdState(sprintId);
        setViewModeState("board");
      },

      openCreateSprint: () => {
        setActiveModal("createSprint");
        updateUrlParams({ ticketId: null, modal: "create-sprint" });
      },

      openMembers: () => {
        setActiveModal("members");
        updateUrlParams({ ticketId: null, modal: "members" });
      },

      openEditSprint: (_sprintId) => {
        setActiveModal("editSprint");
        updateUrlParams({ ticketId: null, modal: "edit-sprint" });
      },

      setTicketSprints: async (ticketId, sprintIds) => {
        const current = stateRef.current.allTickets.find(
          (t) => t.id === ticketId,
        );
        if (!current) return;
        await updateTicketMutation({
          variables: {
            id: ticketId,
            input: { sprintIds, expectedVersion: current.version },
          },
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
              input: {
                ...conflict.pendingPatch,
                expectedVersion: conflict.currentState.version,
              },
            },
          });
          const payload = (result.data as Record<string, unknown> | undefined)
            ?.updateTicket as
            | ({ __typename: "Ticket" } & Ticket)
            | {
                __typename: "ConflictError";
                currentState: Ticket;
                conflictedFields: string[];
                message: string;
              }
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
      createTicketParentId,
      conflictError,
      sprints,
      viewMode,
      selectedSprintId,
      selectedSprint,
      hasNoSprints,
      createSprintModalOpen: activeModal === "createSprint",
      committedPoints,
      velocity,
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
      createTicketParentId,
      conflictError,
      sprints,
      viewMode,
      selectedSprintId,
      selectedSprint,
      hasNoSprints,
      committedPoints,
      velocity,
    ],
  );

  return (
    <BoardActionsContext.Provider value={actions}>
      <BoardDataContext.Provider value={data}>
        {children}
      </BoardDataContext.Provider>
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
  if (!ctx)
    throw new Error("useBoardActions must be used within a BoardProvider");
  return ctx;
}

/**
 * Combined view-model hook (kept for existing consumers).
 * Prefer `useBoardData` or `useBoardActions` for fine-grained subscriptions.
 */
export function useBoardContext(): BoardViewModel {
  return { ...useBoardData(), ...useBoardActions() };
}
