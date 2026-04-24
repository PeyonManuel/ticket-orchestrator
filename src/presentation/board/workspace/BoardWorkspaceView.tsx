"use client";

import React, { useCallback, useMemo, useState } from "react";
import { useBoardActions, useBoardData } from "@/presentation/board/BoardContext";
import { ColumnCard } from "./ColumnCard";
import { ColumnForm } from "./ColumnForm";
import { VersionPanel } from "./VersionPanel";
import { useBoardDrag } from "./useBoardDrag";

export default function BoardWorkspaceView() {
  const {
    activeBoardId,
    boards,
    activeBoardTicketsByColumn,
    boardColumns,
    releaseVersions,
  } = useBoardData();

  const {
    openTicket,
    addBoardColumn,
    updateColumnState,
    updateColumnColor,
    openOrchestrator,
    moveTicketToColumn,
    updateTicketWorkflowState,
    createVersion,
    deleteVersion,
    renameColumn,
    deleteColumn,
    reorderColumns,
  } = useBoardActions();

  // Column header editing — single open at a time
  const [colorPickerColumnId, setColorPickerColumnId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");
  const [editingStatesColumnId, setEditingStatesColumnId] = useState<string | null>(null);

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  );

  const drag = useBoardDrag({
    activeBoardId,
    boardColumns,
    moveTicketToColumn,
    updateTicketWorkflowState,
    reorderColumns,
  });

  // Header edit callbacks — stable via useCallback
  const onBeginRename = useCallback((columnId: string, currentName: string) => {
    setEditingColumnId(columnId);
    setEditingColumnName(currentName);
    setColorPickerColumnId(null);
  }, []);
  const onCommitRename = useCallback(() => {
    if (!editingColumnId) return;
    const trimmed = editingColumnName.trim();
    if (trimmed) renameColumn(editingColumnId, trimmed);
    setEditingColumnId(null);
  }, [editingColumnId, editingColumnName, renameColumn]);
  const onCancelRename = useCallback(() => setEditingColumnId(null), []);

  const onToggleColorPicker = useCallback(
    (columnId: string) => setColorPickerColumnId((p) => (p === columnId ? null : columnId)),
    [],
  );
  const onSelectColor = useCallback(
    (columnId: string, color: string) => {
      updateColumnColor(columnId, color);
      setColorPickerColumnId(null);
    },
    [updateColumnColor],
  );

  const onToggleStatesEditor = useCallback(
    (columnId: string) => setEditingStatesColumnId((p) => (p === columnId ? null : columnId)),
    [],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="rounded-xl border border-indigo-500/20 bg-zinc-900/80 p-4 shadow-[0_0_0_1px_rgba(99,102,241,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Active Board</p>
            <h2 className="text-xl font-semibold text-zinc-100">
              {activeBoard?.name ?? "No board selected"}
            </h2>
          </div>
          <button
            onClick={openOrchestrator}
            className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-indigo-400 hover:text-indigo-300"
          >
            Open AI Orchestrator
          </button>
        </div>

        <ColumnForm
          activeBoardId={activeBoardId}
          boardColumns={boardColumns}
          columnCount={boardColumns.length}
          onAddColumn={addBoardColumn}
        />

        <VersionPanel
          releaseVersions={releaseVersions}
          onCreateVersion={createVersion}
          onDeleteVersion={deleteVersion}
        />
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-zinc-500">Tickets by Column</p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {activeBoardTicketsByColumn.map(({ column, tickets }) => (
            <ColumnCard
              key={column.id}
              column={column}
              tickets={tickets}
              isTicketDropTarget={drag.dropColumnId === column.id && drag.isTicketDragging}
              isColumnDropTarget={
                drag.columnDragOverId === column.id &&
                drag.isColumnDragging &&
                drag.draggedColumnId !== column.id
              }
              isBeingDragged={drag.draggedColumnId === column.id}
              hoverState={drag.hoverState}
              draggedTicketId={drag.draggedTicketId}
              isRenaming={editingColumnId === column.id}
              renameValue={editingColumnName}
              isColorPickerOpen={colorPickerColumnId === column.id}
              isStatesEditorOpen={editingStatesColumnId === column.id}
              onBeginRename={onBeginRename}
              onRenameValueChange={setEditingColumnName}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              onToggleColorPicker={onToggleColorPicker}
              onSelectColor={onSelectColor}
              onToggleStatesEditor={onToggleStatesEditor}
              onChangeStates={updateColumnState}
              onDeleteColumn={deleteColumn}
              onOpenTicket={openTicket}
              onColumnDragStart={drag.onColumnDragStart}
              onColumnDragEnd={drag.onColumnDragEnd}
              onColumnDragOver={drag.onColumnDragOver}
              onColumnDragLeave={drag.onColumnDragLeave}
              onColumnDrop={drag.onColumnDrop}
              onTicketDragStart={drag.onTicketDragStart}
              onTicketDragEnd={drag.onTicketDragEnd}
              onStateDragOver={drag.onStateDragOver}
              onStateDragLeave={drag.onStateDragLeave}
              onStateDrop={drag.onStateDrop}
              allowColumnDrag={!drag.isTicketDragging}
            />
          ))}

          {drag.isColumnDragging && (
            <div
              onDragOver={drag.onEndZoneDragOver}
              onDragLeave={drag.onEndZoneDragLeave}
              onDrop={drag.onEndZoneDrop}
              className={`flex min-w-[48px] shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                drag.columnDragOverId === "__end__"
                  ? "border-indigo-400/70 bg-indigo-500/10"
                  : "border-zinc-700/40"
              }`}
            />
          )}

          {activeBoardTicketsByColumn.length === 0 && (
            <div className="rounded-md border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
              This board has no columns yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
