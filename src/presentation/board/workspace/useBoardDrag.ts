"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardColumn } from "@/domain/analyst";

type DragOrigin = "ticket" | "column" | null;

export interface BoardDragApi {
  // state
  draggedTicketId: string | null;
  dropColumnId: string | null;
  hoverState: string | null;
  draggedColumnId: string | null;
  columnDragOverId: string | null;
  isTicketDragging: boolean;
  isColumnDragging: boolean;

  // ticket drag
  onTicketDragStart: (ticketId: string, event: React.DragEvent<HTMLElement>) => void;
  onTicketDragEnd: () => void;

  // column drag (used on each column wrapper)
  onColumnDragStart: (columnId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onColumnDragEnd: () => void;
  onColumnDragOver: (columnId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onColumnDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onColumnDrop: (columnId: string, event: React.DragEvent<HTMLDivElement>) => void;

  // trailing end-zone
  onEndZoneDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onEndZoneDragLeave: () => void;
  onEndZoneDrop: (event: React.DragEvent<HTMLDivElement>) => void;

  // workflow-state drop zones (inside a hovered column)
  onStateDragOver: (state: string, event: React.DragEvent<HTMLDivElement>) => void;
  onStateDragLeave: (state: string, event: React.DragEvent<HTMLDivElement>) => void;
  onStateDrop: (state: string, event: React.DragEvent<HTMLDivElement>) => void;
}

interface BoardDragOptions {
  activeBoardId: string | null;
  boardColumns: BoardColumn[];
  moveTicketToColumn: (ticketId: string, columnId: string) => void;
  updateTicketWorkflowState: (ticketId: string, workflowState: string) => void;
  reorderColumns: (boardId: string, orderedColumnIds: string[]) => void;
}

export function useBoardDrag({
  activeBoardId,
  boardColumns,
  moveTicketToColumn,
  updateTicketWorkflowState,
  reorderColumns,
}: BoardDragOptions): BoardDragApi {
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [hoverState, setHoverState] = useState<string | null>(null);
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [columnDragOverId, setColumnDragOverId] = useState<string | null>(null);
  const originRef = useRef<DragOrigin>(null);

  // Refs for latest values consumed by stable callbacks (updated in effects).
  const draggedTicketIdRef = useRef(draggedTicketId);
  const hoverStateRef = useRef(hoverState);
  const draggedColumnIdRef = useRef(draggedColumnId);
  const boardColumnsRef = useRef(boardColumns);
  const activeBoardIdRef = useRef(activeBoardId);
  useEffect(() => {
    draggedTicketIdRef.current = draggedTicketId;
    hoverStateRef.current = hoverState;
    draggedColumnIdRef.current = draggedColumnId;
    boardColumnsRef.current = boardColumns;
    activeBoardIdRef.current = activeBoardId;
  });

  // ── Ticket drag ─────────────────────────────────────────────────
  const onTicketDragStart = useCallback(
    (ticketId: string, event: React.DragEvent<HTMLElement>) => {
      originRef.current = "ticket";
      event.dataTransfer.setData("ticket-id", ticketId);
      setDraggedTicketId(ticketId);
    },
    [],
  );

  const onTicketDragEnd = useCallback(() => {
    originRef.current = null;
    setDraggedTicketId(null);
    setDropColumnId(null);
    setHoverState(null);
  }, []);

  // ── Column drag ─────────────────────────────────────────────────
  const onColumnDragStart = useCallback(
    (columnId: string, event: React.DragEvent<HTMLDivElement>) => {
      // If the drag bubbled from a ticket child, leave it alone (do NOT preventDefault).
      if (originRef.current === "ticket") return;
      originRef.current = "column";
      event.dataTransfer.setData("column-id", columnId);
      event.dataTransfer.effectAllowed = "move";
      setDraggedColumnId(columnId);
    },
    [],
  );

  const onColumnDragEnd = useCallback(() => {
    originRef.current = null;
    setDraggedColumnId(null);
    setColumnDragOverId(null);
  }, []);

  const onColumnDragOver = useCallback(
    (columnId: string, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (originRef.current === "column") setColumnDragOverId(columnId);
      else setDropColumnId(columnId);
    },
    [],
  );

  const onColumnDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node)) {
      if (originRef.current === "column") setColumnDragOverId(null);
      else {
        setDropColumnId(null);
        setHoverState(null);
      }
    }
  }, []);

  const onColumnDrop = useCallback(
    (targetColumnId: string, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (originRef.current === "column") {
        const dragged = draggedColumnIdRef.current;
        const boardId = activeBoardIdRef.current;
        if (dragged && dragged !== targetColumnId && boardId) {
          const order = boardColumnsRef.current.map((c) => c.id);
          const from = order.indexOf(dragged);
          const to = order.indexOf(targetColumnId);
          if (from !== -1 && to !== -1) {
            order.splice(from, 1);
            order.splice(to, 0, dragged);
            reorderColumns(boardId, order);
          }
        }
        setDraggedColumnId(null);
        setColumnDragOverId(null);
      } else {
        const ticketId = draggedTicketIdRef.current;
        if (!ticketId) return;
        if (!hoverStateRef.current) moveTicketToColumn(ticketId, targetColumnId);
        setDraggedTicketId(null);
        setDropColumnId(null);
        setHoverState(null);
      }
    },
    [moveTicketToColumn, reorderColumns],
  );

  // ── End zone (drop as last) ──────────────────────────────────────
  const onEndZoneDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (originRef.current === "column") setColumnDragOverId("__end__");
  }, []);

  const onEndZoneDragLeave = useCallback(() => setColumnDragOverId(null), []);

  const onEndZoneDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const dragged = draggedColumnIdRef.current;
      const boardId = activeBoardIdRef.current;
      if (!dragged || !boardId) return;
      const order = boardColumnsRef.current.map((c) => c.id);
      const from = order.indexOf(dragged);
      if (from === -1) return;
      order.splice(from, 1);
      order.push(dragged);
      reorderColumns(boardId, order);
      setDraggedColumnId(null);
      setColumnDragOverId(null);
    },
    [reorderColumns],
  );

  // ── Per-workflow-state drop zones ───────────────────────────────
  const onStateDragOver = useCallback(
    (state: string, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setHoverState(state);
    },
    [],
  );

  const onStateDragLeave = useCallback(
    (state: string, event: React.DragEvent<HTMLDivElement>) => {
      event.stopPropagation();
      setHoverState((prev) => (prev === state ? null : prev));
    },
    [],
  );

  const onStateDrop = useCallback(
    (state: string, event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const ticketId = draggedTicketIdRef.current;
      if (!ticketId) return;
      updateTicketWorkflowState(ticketId, state);
      setDraggedTicketId(null);
      setDropColumnId(null);
      setHoverState(null);
    },
    [updateTicketWorkflowState],
  );

  return {
    draggedTicketId,
    dropColumnId,
    hoverState,
    draggedColumnId,
    columnDragOverId,
    isTicketDragging: draggedTicketId !== null,
    isColumnDragging: draggedColumnId !== null,

    onTicketDragStart,
    onTicketDragEnd,

    onColumnDragStart,
    onColumnDragEnd,
    onColumnDragOver,
    onColumnDragLeave,
    onColumnDrop,

    onEndZoneDragOver,
    onEndZoneDragLeave,
    onEndZoneDrop,

    onStateDragOver,
    onStateDragLeave,
    onStateDrop,
  };
}
