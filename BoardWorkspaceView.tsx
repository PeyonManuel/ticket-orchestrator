"use client";

import { useState } from "react";
import { useBoardContext } from "@/BoardContext";

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
    openCreateVersion,
    moveTicketToColumn,
    boardColumns,
  } = useBoardContext();
  const [newColumnName, setNewColumnName] = useState("");
  const [newColumnStates, setNewColumnStates] = useState("");
  const [draggedTicketId, setDraggedTicketId] = useState<string | null>(null);
  const [dropColumnId, setDropColumnId] = useState<string | null>(null);
  const [showAddColumnPanel, setShowAddColumnPanel] = useState(false);
  const [colorPickerColumnId, setColorPickerColumnId] = useState<string | null>(null);
  const columnColors = ["#64748b", "#4f46e5", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#e11d48", "#14b8a6"];

  const activeBoard = boards.find((board) => board.id === activeBoardId) ?? null;
  const columnCount = boardColumns.length;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
      <section className="rounded-xl border border-indigo-500/20 bg-zinc-900/80 p-4 shadow-[0_0_0_1px_rgba(99,102,241,0.08)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">
              Active Board
            </p>
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
          <button
            onClick={openCreateVersion}
            className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-semibold text-zinc-200 hover:border-indigo-400 hover:text-indigo-300"
          >
            Create Version
          </button>
        </div>
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
                newColumnStates
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              );
              setNewColumnName("");
              setNewColumnStates("");
              setShowAddColumnPanel(false);
            }}
            disabled={columnCount >= 6}
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500"
          >
            Save Column
          </button>
          </div>
        )}
      </section>

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
                <h3 className="text-sm font-semibold text-zinc-100 flex items-center justify-between">
                  <span>{column.name}</span>
                  <div className="relative">
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
                        {columnColors.map((color) => (
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
                </h3>
                <input
                  value={column.states.join(", ")}
                  onChange={(event) =>
                    updateColumnState(
                      column.id,
                      event.target.value
                        .split(",")
                        .map((item) => item.trim())
                        .filter(Boolean),
                    )
                  }
                  className="mt-2 w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300"
                />
                <p className="mt-1 text-[10px] text-zinc-500">
                  States (comma-separated). Currently one per column by default.
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
                    <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
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
