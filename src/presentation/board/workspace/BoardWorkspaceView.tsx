"use client";

import React, { useRef, useState } from "react";
import { Calendar, GripVertical, Pencil, SlidersHorizontal, X } from "lucide-react";
import { useBoardContext } from "@/presentation/board/BoardContext";
import { StatesTagInput } from "@/presentation/shared/inputs/StatesTagInput";

const COLUMN_COLOR_PRESETS = [
  "#64748b",
  "#4f46e5",
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#e11d48",
  "#14b8a6",
];

export default function BoardWorkspaceView() {
  const {
    activeBoardId,
    boards,
    activeBoardTicketsByColumn,
    openTicket,
    addBoardColumn,
    updateColumnState,
    updateColumnColor,
    openOrchestrator,
    moveTicketToColumn,
    updateTicketWorkflowState,
    boardColumns,
    releaseVersions,
    createVersion,
    deleteVersion,
    renameColumn,
    deleteColumn,
    reorderColumns,
  } = useBoardContext();

  // ── New-column form state ────────────────────────────────────────────
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnStates, setNewColumnStates] = useState<string[]>([]);
  const [showAddColumnPanel, setShowAddColumnPanel] = useState(false);

  // ── Ticket drag state ────────────────────────────────────────────────
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [hoverState, setHoverState] = useState<string | null>(null);

  // ── Column drag-reorder state ────────────────────────────────────────
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [columnDragOverId, setColumnDragOverId] = useState<string | null>(null);
  // Ref to distinguish ticket drag vs column drag at dragstart bubble time
  const dragOriginRef = useRef<"ticket" | "column" | null>(null);

  // ── Column header editing ────────────────────────────────────────────
  const [colorPickerColumnId, setColorPickerColumnId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");
  const [editingStatesColumnId, setEditingStatesColumnId] = useState<string | null>(null);

  // ── Version panel ────────────────────────────────────────────────────
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [newVersionDate, setNewVersionDate] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);

  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;
  const columnCount = boardColumns.length;
  const isDragging = draggedTicketId !== null;
  const isColumnDragging = draggedColumnId !== null;

  // Duplicate column name check (case-insensitive)
  const columnNameTrimmed = newColumnName.trim();
  const columnNameExists =
    columnNameTrimmed.length > 0 &&
    boardColumns.some(
      (c) => c.name.toLowerCase() === columnNameTrimmed.toLowerCase(),
    );

  // Column drop-reorder handler
  const handleColumnDrop = (targetColumnId: string) => {
    if (!draggedColumnId || draggedColumnId === targetColumnId || !activeBoardId) return;
    const currentOrder = boardColumns.map((c) => c.id);
    const fromIndex = currentOrder.indexOf(draggedColumnId);
    const toIndex = currentOrder.indexOf(targetColumnId);
    if (fromIndex === -1 || toIndex === -1) return;
    const reordered = [...currentOrder];
    reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, draggedColumnId);
    reorderColumns(activeBoardId, reordered);
  };

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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddColumnPanel((p) => !p)}
            className="rounded-md border border-indigo-400/40 px-3 py-2 text-xs font-semibold text-indigo-200 hover:border-indigo-300"
          >
            {showAddColumnPanel ? "Close Column Form" : "Add Column"}
          </button>
          <span className="text-[11px] text-zinc-500">Columns: {columnCount}/6</span>
        </div>
        {showAddColumnPanel && (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <input
                value={newColumnName}
                onChange={(e) => setNewColumnName(e.target.value)}
                placeholder="Column name"
                className={`w-full rounded-md border bg-zinc-950 px-3 py-2 text-xs text-zinc-200 md:w-1/2 ${
                  columnNameExists ? "border-amber-500/60" : "border-zinc-700"
                }`}
              />
              {columnNameExists && (
                <p className="mt-1 text-[10px] text-amber-500">
                  A column named &quot;{columnNameTrimmed}&quot; already exists.
                </p>
              )}
            </div>
            <div>
              <p className="mb-1 text-[10px] text-zinc-500">
                Workflow states — type and press Enter to add
              </p>
              <StatesTagInput value={newColumnStates} onChange={setNewColumnStates} />
            </div>
            <button
              onClick={() => {
                if (!activeBoardId || !newColumnName.trim() || columnNameExists) return;
                addBoardColumn(activeBoardId, newColumnName, newColumnStates);
                setNewColumnName("");
                setNewColumnStates([]);
                setShowAddColumnPanel(false);
              }}
              disabled={columnCount >= 6 || columnNameExists}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
            >
              Save Column
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowVersionPanel((p) => !p)}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500"
          >
            {showVersionPanel ? "Close Version Manager" : "Manage Versions"}
          </button>
          {!showVersionPanel && releaseVersions.length > 0 && (
            <span className="text-[11px] text-zinc-500">
              {releaseVersions.length} version{releaseVersions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {showVersionPanel && (
          <div className="mt-3">
            {releaseVersions.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {releaseVersions.map((v) => (
                  <div
                    key={v.id}
                    className="group relative rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => deleteVersion(v.id)}
                      className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-red-400 group-hover:flex"
                    >
                      <X size={9} />
                    </button>
                    <p className="text-xs font-semibold text-zinc-100">{v.name}</p>
                    <p className="text-[10px] text-zinc-500">{v.releaseDate}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
              <input
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                placeholder="Version name (e.g. v1.4.0)"
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
              />
              <div className="relative">
                <input
                  ref={dateInputRef}
                  type="date"
                  value={newVersionDate}
                  onChange={(e) => setNewVersionDate(e.target.value)}
                  className="h-full w-40 cursor-pointer rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 [color-scheme:dark]"
                />
                <button
                  type="button"
                  onClick={() => dateInputRef.current?.showPicker?.()}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
                >
                  <Calendar size={13} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!newVersionName.trim()) return;
                  createVersion(newVersionName.trim(), newVersionDate);
                  setNewVersionName("");
                  setNewVersionDate("");
                }}
                className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500"
              >
                Add Version
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-zinc-500">
          Tickets by Column
        </p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {activeBoardTicketsByColumn.map(({ column, tickets }) => {
            const isHoverTarget = dropColumnId === column.id && isDragging;
            const isColumnDropTarget = columnDragOverId === column.id && isColumnDragging && draggedColumnId !== column.id;

            return (
              <div
                key={column.id}
                // Column reorder — drag the whole column when NOT dragging a ticket
                draggable={!isDragging}
                onDragStart={(e) => {
                  // If this dragstart bubbled up from a draggable ticket child, skip column setup
                  // (do NOT call preventDefault — that would cancel the ticket drag too)
                  if (dragOriginRef.current === "ticket") return;
                  dragOriginRef.current = "column";
                  e.dataTransfer.setData("column-id", column.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedColumnId(column.id);
                }}
                onDragEnd={() => {
                  dragOriginRef.current = null;
                  setDraggedColumnId(null);
                  setColumnDragOverId(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOriginRef.current === "column") {
                    setColumnDragOverId(column.id);
                  } else {
                    setDropColumnId(column.id);
                  }
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (dragOriginRef.current === "column") setColumnDragOverId(null);
                    else { setDropColumnId(null); setHoverState(null); }
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragOriginRef.current === "column") {
                    handleColumnDrop(column.id);
                    setDraggedColumnId(null);
                    setColumnDragOverId(null);
                  } else {
                    if (!draggedTicketId) return;
                    if (!hoverState) moveTicketToColumn(draggedTicketId, column.id);
                    setDraggedTicketId(null);
                    setDropColumnId(null);
                    setHoverState(null);
                  }
                }}
                className={`flex min-w-[300px] flex-1 flex-col rounded-lg border p-3 transition-colors ${
                  isColumnDropTarget
                    ? "border-indigo-400/70 bg-indigo-500/10 ring-1 ring-indigo-500/30"
                    : isHoverTarget
                    ? "border-indigo-400 bg-indigo-500/5"
                    : draggedColumnId === column.id
                    ? "border-zinc-600 opacity-40"
                    : "border-zinc-800 bg-zinc-950/70"
                }`}
              >
                {/* Column header */}
                <div className="mb-3">
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex min-w-0 flex-1 items-center gap-1.5">
                      {/* Drag handle for column reorder */}
                      <GripVertical
                        size={13}
                        className="shrink-0 cursor-grab text-zinc-600 active:cursor-grabbing"
                      />
                      {editingColumnId === column.id ? (
                        <input
                          autoFocus
                          value={editingColumnName}
                          onChange={(e) => setEditingColumnName(e.target.value)}
                          onBlur={() => {
                            if (editingColumnName.trim())
                              renameColumn(column.id, editingColumnName.trim());
                            setEditingColumnId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (editingColumnName.trim())
                                renameColumn(column.id, editingColumnName.trim());
                              setEditingColumnId(null);
                            }
                            if (e.key === "Escape") setEditingColumnId(null);
                          }}
                          className="w-full rounded bg-zinc-800 px-1.5 py-0.5 text-sm font-semibold text-zinc-100 outline-none ring-1 ring-indigo-500/50"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingColumnId(column.id);
                            setEditingColumnName(column.name);
                            setColorPickerColumnId(null);
                          }}
                          className="group flex items-center gap-1 truncate text-sm font-semibold text-zinc-100 hover:text-indigo-200"
                          title="Click to rename"
                        >
                          <span className="truncate">{column.name}</span>
                          <Pencil
                            size={11}
                            className="shrink-0 text-zinc-600 opacity-0 transition-opacity group-hover:opacity-100"
                          />
                        </button>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingStatesColumnId((p) => (p === column.id ? null : column.id))
                        }
                        title="Edit states"
                        className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                          editingStatesColumnId === column.id
                            ? "bg-indigo-500/20 text-indigo-300"
                            : "text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                        }`}
                      >
                        <SlidersHorizontal size={11} />
                      </button>

                      <div className="relative">
                        <button
                          onClick={() =>
                            setColorPickerColumnId((p) => (p === column.id ? null : column.id))
                          }
                          className="h-5 w-7 rounded border border-zinc-700"
                          style={{ backgroundColor: column.color }}
                          title="Column color"
                        />
                        {colorPickerColumnId === column.id && (
                          <div className="absolute right-0 top-7 z-20 flex gap-1 rounded-md border border-zinc-700 bg-zinc-950 p-1.5">
                            {COLUMN_COLOR_PRESETS.map((color) => (
                              <button
                                key={color}
                                onClick={() => {
                                  updateColumnColor(column.id, color);
                                  setColorPickerColumnId(null);
                                }}
                                className="h-4 w-4 rounded border border-zinc-700"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => deleteColumn(column.id)}
                        title="Delete column"
                        className="flex h-5 w-5 items-center justify-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>

                  {editingStatesColumnId === column.id && (
                    <div className="mt-2">
                      <p className="mb-1 text-[10px] text-zinc-500">
                        Workflow states — type and press Enter to add
                      </p>
                      <StatesTagInput
                        value={column.states}
                        onChange={(states) => updateColumnState(column.id, states)}
                      />
                    </div>
                  )}
                </div>

                {/* Ticket list or state drop zones */}
                <div className="flex flex-col gap-2">
                  {isHoverTarget && column.states.length > 0 ? (
                    column.states.map((state) => (
                      <div
                        key={state}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setHoverState(state);
                        }}
                        onDragLeave={(e) => {
                          e.stopPropagation();
                          setHoverState((prev) => (prev === state ? null : prev));
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!draggedTicketId) return;
                          updateTicketWorkflowState(draggedTicketId, state);
                          setDraggedTicketId(null);
                          setDropColumnId(null);
                          setHoverState(null);
                        }}
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
                        <article
                          key={ticket.id}
                          draggable
                          role="button"
                          tabIndex={0}
                          onClick={() => openTicket(ticket.id)}
                          onDragStart={(e) => {
                            dragOriginRef.current = "ticket";
                            e.dataTransfer.setData("ticket-id", ticket.id);
                            setDraggedTicketId(ticket.id);
                          }}
                          onDragEnd={() => {
                            dragOriginRef.current = null;
                            setDraggedTicketId(null);
                            setDropColumnId(null);
                            setHoverState(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openTicket(ticket.id);
                            }
                          }}
                          className={`cursor-pointer rounded-md border border-zinc-800 bg-zinc-900/60 p-3 hover:border-indigo-500/50 ${
                            draggedTicketId === ticket.id ? "opacity-40" : ""
                          }`}
                          style={{ borderLeftColor: column.color, borderLeftWidth: 3 }}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300/80">
                            {ticket.hierarchyType}
                          </p>
                          <h4 className="text-sm font-semibold text-zinc-100">
                            {ticket.ticketNumber} · {ticket.title}
                          </h4>
                          <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                            {ticket.description}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                            <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">
                              {ticket.label}
                            </span>
                            <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">
                              {ticket.fixVersion}
                            </span>
                          </div>
                        </article>
                      ))}
                      {tickets.length === 0 && (
                        <p className="rounded-md border border-dashed border-zinc-800 p-3 text-xs text-zinc-500">
                          No tickets in this column.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {/* Trailing drop zone — lets any column be moved to the last position */}
          {isColumnDragging && (
            <div
              onDragOver={(e) => { e.preventDefault(); if (dragOriginRef.current === "column") setColumnDragOverId("__end__"); }}
              onDragLeave={() => setColumnDragOverId(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (!draggedColumnId || !activeBoardId) return;
                const currentOrder = boardColumns.map((c) => c.id);
                const fromIndex = currentOrder.indexOf(draggedColumnId);
                if (fromIndex === -1) return;
                const reordered = [...currentOrder];
                reordered.splice(fromIndex, 1);
                reordered.push(draggedColumnId);
                reorderColumns(activeBoardId, reordered);
                setDraggedColumnId(null);
                setColumnDragOverId(null);
              }}
              className={`flex min-w-[48px] shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                columnDragOverId === "__end__"
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
