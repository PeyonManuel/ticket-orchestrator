"use client";

import React, { memo } from "react";
import { GripVertical, Pencil, SlidersHorizontal, X } from "lucide-react";
import type { BoardColumn, Ticket } from "@/domain/analyst";
import { StatesTagInput } from "@/presentation/shared/inputs/StatesTagInput";
import { TicketCard } from "./TicketCard";

export const COLUMN_COLOR_PRESETS = [
  "#64748b",
  "#4f46e5",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#e11d48",
  "#14b8a6",
];

interface ColumnCardProps {
  column: BoardColumn;
  tickets: Ticket[];

  // Visual states
  isTicketDropTarget: boolean;
  isColumnDropTarget: boolean;
  isBeingDragged: boolean;
  hoverState: string | null;
  draggedTicketId: string | null;

  // Editing state (lifted to keep only one open at a time)
  isRenaming: boolean;
  renameValue: string;
  isColorPickerOpen: boolean;
  isStatesEditorOpen: boolean;

  // Callbacks
  onBeginRename: (columnId: string, currentName: string) => void;
  onRenameValueChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;

  onToggleColorPicker: (columnId: string) => void;
  onSelectColor: (columnId: string, color: string) => void;

  onToggleStatesEditor: (columnId: string) => void;
  onChangeStates: (columnId: string, states: string[]) => void;

  onDeleteColumn: (columnId: string) => void;
  onOpenTicket: (ticketId: string) => void;

  // Column-level drag handlers (native events)
  onColumnDragStart: (columnId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onColumnDragEnd: () => void;
  onColumnDragOver: (columnId: string, event: React.DragEvent<HTMLDivElement>) => void;
  onColumnDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onColumnDrop: (columnId: string, event: React.DragEvent<HTMLDivElement>) => void;

  // Ticket drag handlers
  onTicketDragStart: (ticketId: string, event: React.DragEvent<HTMLElement>) => void;
  onTicketDragEnd: () => void;

  // Workflow state drop zones
  onStateDragOver: (state: string, event: React.DragEvent<HTMLDivElement>) => void;
  onStateDragLeave: (state: string, event: React.DragEvent<HTMLDivElement>) => void;
  onStateDrop: (state: string, event: React.DragEvent<HTMLDivElement>) => void;

  allowColumnDrag: boolean;
  isAdmin: boolean;
}

function ColumnCardImpl(props: ColumnCardProps) {
  const {
    column,
    tickets,
    isTicketDropTarget,
    isColumnDropTarget,
    isBeingDragged,
    hoverState,
    draggedTicketId,
    isRenaming,
    renameValue,
    isColorPickerOpen,
    isStatesEditorOpen,
    onBeginRename,
    onRenameValueChange,
    onCommitRename,
    onCancelRename,
    onToggleColorPicker,
    onSelectColor,
    onToggleStatesEditor,
    onChangeStates,
    onDeleteColumn,
    onOpenTicket,
    onColumnDragStart,
    onColumnDragEnd,
    onColumnDragOver,
    onColumnDragLeave,
    onColumnDrop,
    onTicketDragStart,
    onTicketDragEnd,
    onStateDragOver,
    onStateDragLeave,
    onStateDrop,
    allowColumnDrag,
    isAdmin,
  } = props;

  const showStateZones = isTicketDropTarget && column.states.length > 0;

  return (
    <div
      draggable={allowColumnDrag && isAdmin}
      onDragStart={(e) => onColumnDragStart(column.id, e)}
      onDragEnd={onColumnDragEnd}
      onDragOver={(e) => onColumnDragOver(column.id, e)}
      onDragLeave={onColumnDragLeave}
      onDrop={(e) => onColumnDrop(column.id, e)}
      className={`flex min-w-[300px] flex-1 flex-col rounded-lg border p-3 transition-colors ${
        isColumnDropTarget
          ? "border-indigo-400/70 bg-indigo-500/10 ring-1 ring-indigo-500/30"
          : isTicketDropTarget
          ? "border-indigo-400 bg-indigo-500/5"
          : isBeingDragged
          ? "border-zinc-600 opacity-40"
          : "border-zinc-300 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900"
      }`}
    >
      {/* Header */}
      <div className="mb-3">
        <div className="flex items-center justify-between gap-1">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            <GripVertical
              size={13}
              className={`shrink-0 text-zinc-400 dark:text-zinc-600 active:cursor-grabbing ${
                isAdmin ? "cursor-grab" : "cursor-default opacity-30"
              }`}
            />
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => onRenameValueChange(e.target.value)}
                onBlur={onCommitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCommitRename();
                  if (e.key === "Escape") onCancelRename();
                }}
                className="w-full rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 outline-none ring-1 ring-indigo-500/50"
              />
            ) : (
              <button
                type="button"
                onClick={() => isAdmin && onBeginRename(column.id, column.name)}
                className={`group flex items-center gap-1 truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100 ${
                  isAdmin ? "hover:text-indigo-600 dark:hover:text-indigo-200" : "cursor-default"
                }`}
                title={isAdmin ? "Click to rename" : undefined}
              >
                <span className="truncate">{column.name}</span>
                <Pencil
                  size={11}
                  className={`shrink-0 text-zinc-600 opacity-0 transition-opacity ${
                    isAdmin ? "group-hover:opacity-100" : ""
                  }`}
                />
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            {isAdmin && (
            <button
              type="button"
              onClick={() => onToggleStatesEditor(column.id)}
              title="Edit states"
              className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                isStatesEditorOpen
                  ? "bg-indigo-500/20 text-indigo-300"
                  : "text-zinc-500 dark:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <SlidersHorizontal size={11} />
            </button>
            )}

            {isAdmin && (
            <div className="relative">
              <button
                onClick={() => onToggleColorPicker(column.id)}
                className="h-5 w-7 rounded border border-zinc-700"
                style={{ backgroundColor: column.color }}
                title="Column color"
              />
              {isColorPickerOpen && (
                <div className="absolute right-0 top-7 z-20 flex gap-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 p-1.5">
                  {COLUMN_COLOR_PRESETS.map((color) => (
                    <button
                      key={color}
                      onClick={() => onSelectColor(column.id, color)}
                      className="h-4 w-4 rounded border border-zinc-700"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              )}
            </div>
            )}

            {!isAdmin && (
              <div
                className="h-5 w-7 rounded border border-zinc-300 dark:border-zinc-700"
                style={{ backgroundColor: column.color }}
                title="Column color"
              />
            )}

            {isAdmin && (
            <button
              type="button"
              onClick={() => onDeleteColumn(column.id)}
              title="Delete column"
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-500 dark:text-zinc-600 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-red-500 dark:hover:text-red-400"
            >
              <X size={12} />
            </button>
            )}
          </div>
        </div>

        {isStatesEditorOpen && (
          <div className="mt-2">
            <p className="mb-1 text-[10px] text-zinc-500">
              Workflow states — type and press Enter to add
            </p>
            <StatesTagInput
              value={column.states}
              onChange={(states) => onChangeStates(column.id, states)}
            />
          </div>
        )}
      </div>

      {/* Body: tickets or state drop zones */}
      <div className="flex flex-col gap-2">
        {showStateZones ? (
          column.states.map((state) => (
            <div
              key={state}
              onDragOver={(e) => onStateDragOver(state, e)}
              onDragLeave={(e) => onStateDragLeave(state, e)}
              onDrop={(e) => onStateDrop(state, e)}
              className={`flex min-h-[72px] items-center justify-center rounded-lg border px-4 py-4 text-center transition-all duration-150 ${
                hoverState === state
                  ? "scale-[1.02] border-indigo-400 bg-indigo-500/20"
                  : "border-indigo-500/30 bg-indigo-500/5"
              }`}
            >
              <span
                className={`text-sm font-semibold tracking-wide transition-colors ${
                  hoverState === state ? "text-indigo-100" : "text-indigo-300/70"
                }`}
              >
                {state}
              </span>
            </div>
          ))
        ) : (
          <>
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                accentColor={column.color}
                isDragging={draggedTicketId === ticket.id}
                onOpen={onOpenTicket}
                onDragStart={onTicketDragStart}
                onDragEnd={onTicketDragEnd}
              />
            ))}
            {tickets.length === 0 && (
              <p className="rounded-md border border-dashed border-zinc-300 dark:border-zinc-800 p-3 text-xs text-zinc-400 dark:text-zinc-500">
                No tickets in this column.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const ColumnCard = memo(ColumnCardImpl);
