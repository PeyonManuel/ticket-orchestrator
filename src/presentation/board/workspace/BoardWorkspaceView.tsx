"use client";

import React, { useState } from "react";
import { Pencil } from "lucide-react";
import { useBoardContext } from "@/presentation/board/BoardContext";

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
    boardColumns,
    releaseVersions,
    createVersion,
    renameColumn,
  } = useBoardContext();

  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnStates, setNewColumnStates] = useState("");
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [showAddColumnPanel, setShowAddColumnPanel] = useState(false);
  const [colorPickerColumnId, setColorPickerColumnId] = useState<string | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState("");
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [newVersionName, setNewVersionName] = useState("");
  const [newVersionDate, setNewVersionDate] = useState("");

  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? null;
  const columnCount = boardColumns.length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      {/* Header section */}
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

        {/* Column management */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAddColumnPanel((prev) => !prev)}
            className="rounded-md border border-indigo-400/40 px-3 py-2 text-xs font-semibold text-indigo-200 hover:border-indigo-300"
          >
            {showAddColumnPanel ? "Close Column Form" : "Add Column"}
          </button>
          <span className="text-[11px] text-zinc-500">Columns: {columnCount}/6</span>
        </div>
        {showAddColumnPanel && (
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
            <input
              value={newColumnName}
              onChange={(event) => setNewColumnName(event.target.value)}
              placeholder="Column name"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
            />
            <input
              value={newColumnStates}
              onChange={(event) => setNewColumnStates(event.target.value)}
              placeholder="States (comma-separated)"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
            />
            <button
              onClick={() => {
                if (!activeBoardId) return;
                addBoardColumn(
                  activeBoardId,
                  newColumnName,
                  newColumnStates.split(",").map((item) => item.trim()).filter(Boolean),
                );
                setNewColumnName("");
                setNewColumnStates("");
                setShowAddColumnPanel(false);
              }}
              disabled={columnCount >= 6}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
            >
              Save Column
            </button>
          </div>
        )}

        {/* Version management */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowVersionPanel((prev) => !prev)}
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
                    className="rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5"
                  >
                    <p className="text-xs font-semibold text-zinc-100">{v.name}</p>
                    <p className="text-[10px] text-zinc-500">{v.releaseDate}</p>
                  </div>
                ))}
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <input
                value={newVersionName}
                onChange={(e) => setNewVersionName(e.target.value)}
                placeholder="Version name (e.g. v1.4.0)"
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
              />
              <input
                type="date"
                value={newVersionDate}
                onChange={(e) => setNewVersionDate(e.target.value)}
                className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
              />
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

      {/* Board columns */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="mb-3 text-[11px] uppercase tracking-wider text-zinc-500">
          Tickets by Column
        </p>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {activeBoardTicketsByColumn.map(({ column, tickets }) => (
            <div
              key={column.id}
              onDragOver={(event) => {
                event.preventDefault();
                setDropColumnId(column.id);
              }}
              onDrop={() => {
                if (!draggedTicketId) return;
                moveTicketToColumn(draggedTicketId, column.id);
                setDraggedTicketId(null);
                setDropColumnId(null);
              }}
              className={`min-w-[280px] max-w-[280px] rounded-lg border p-3 transition-colors ${
                dropColumnId === column.id
                  ? "border-indigo-400 bg-indigo-500/10"
                  : "border-zinc-800 bg-zinc-950/70"
              }`}
            >
              <div className="mb-3">
                <div className="flex items-center justify-between gap-1">
                  <div className="min-w-0 flex-1">
                    {editingColumnId === column.id ? (
                      <input
                        autoFocus
                        value={editingColumnName}
                        onChange={(e) => setEditingColumnName(e.target.value)}
                        onBlur={() => {
                          if (editingColumnName.trim()) {
                            renameColumn(column.id, editingColumnName.trim());
                          }
                          setEditingColumnId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editingColumnName.trim()) {
                              renameColumn(column.id, editingColumnName.trim());
                            }
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

                  <div className="relative shrink-0">
                    <button
                      onClick={() =>
                        setColorPickerColumnId((prev) =>
                          prev === column.id ? null : column.id,
                        )
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
                </div>

                <input
                  value={column.states.join(", ")}
                  onChange={(event) =>
                    updateColumnState(
                      column.id,
                      event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
                    )
                  }
                  className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300"
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  States (comma-separated). Tickets move here when matching state is selected.
                </p>
              </div>

              <div className="space-y-2">
                {tickets.map((ticket) => (
                  <article
                    key={ticket.id}
                    draggable
                    role="button"
                    tabIndex={0}
                    onClick={() => openTicket(ticket.id)}
                    onDragStart={() => setDraggedTicketId(ticket.id)}
                    onDragEnd={() => {
                      setDraggedTicketId(null);
                      setDropColumnId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openTicket(ticket.id);
                      }
                    }}
                    className={`cursor-pointer rounded-md border border-zinc-800 bg-zinc-900/60 p-3 hover:border-indigo-500/50 ${
                      draggedTicketId === ticket.id ? "opacity-40" : ""
                    }`}
                    style={{ borderLeftColor: column.color, borderLeftWidth: 3 }}
                  >
                    <p className="text-[10px] uppercase tracking-wide text-indigo-300/80 font-semibold">
                      {ticket.hierarchyType}
                    </p>
                    <h4 className="text-sm font-semibold text-zinc-100">
                      {ticket.ticketNumber} · {ticket.title}
                    </h4>
                    <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{ticket.description}</p>
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
                {!tickets.length && (
                  <p className="rounded-md border border-dashed border-zinc-800 p-3 text-xs text-zinc-500">
                    No tickets in this column.
                  </p>
                )}
              </div>
            </div>
          ))}
          {!activeBoardTicketsByColumn.length && (
            <div className="rounded-md border border-dashed border-zinc-700 p-4 text-sm text-zinc-500">
              This board has no columns yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
