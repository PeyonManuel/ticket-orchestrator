"use client";

import React, { useMemo, useState } from "react";
import { useBoardContext } from "@/presentation/board/BoardContext";
import { LabelDropdown } from "@/presentation/shared/dropdowns/LabelDropdown";
import { SimpleDropdown } from "@/presentation/shared/dropdowns/SimpleDropdown";
import type { TicketHierarchyType } from "@/domain/analyst";

export function CreateTicketModal() {
  const {
    boards,
    activeBoardId,
    boardColumns,
    releaseVersions,
    createModalOpen,
    createTicket,
    closeModal,
    labels,
    addLabel,
  } = useBoardContext();

  const [selectedBoardId, setSelectedBoardId] = useState<string>(activeBoardId ?? boards[0]?.id ?? "");

  const columnsForBoard = useMemo(
    () => boardColumns.filter((c) => c.boardId === selectedBoardId),
    [selectedBoardId, boardColumns],
  );

  const [form, setForm] = useState<{
    title: string;
    description: string;
    label: string;
    fixVersion: string;
    storyPoints: 1 | 2 | 3 | 5 | 8 | 13;
    hierarchyType: TicketHierarchyType;
    priority: "low" | "medium" | "high";
    columnId: string;
  }>({
    title: "",
    description: "",
    label: labels[0] ?? "backend",
    fixVersion: releaseVersions[0]?.name ?? "",
    storyPoints: 3,
    hierarchyType: "task",
    priority: "medium",
    columnId: columnsForBoard[0]?.id ?? "",
  });

  // Keep columnId in sync when board changes
  const effectiveColumnId =
    columnsForBoard.find((c) => c.id === form.columnId)?.id ?? columnsForBoard[0]?.id ?? "";

  if (!createModalOpen) return null;

  const chosenColumn = columnsForBoard.find((c) => c.id === effectiveColumnId);
  const canSubmit = !!selectedBoardId && !!effectiveColumnId && !!form.title.trim();

  return (
    <div
      onClick={closeModal}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 dark:bg-zinc-950/70 backdrop-blur-sm p-6"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSubmit) return;
          createTicket({
            boardId: selectedBoardId,
            columnId: effectiveColumnId,
            hierarchyType: form.hierarchyType,
            parentTicketId: null,
            title: form.title.trim(),
            description: form.description.trim(),
            label: form.label.trim(),
            fixVersion: form.fixVersion.trim(),
            workflowState: chosenColumn?.states[0] ?? "todo",
            priority: form.priority,
            storyPoints: form.storyPoints,
          });
          setForm((prev) => ({ ...prev, title: "", description: "" }));
        }}
        className="w-full max-w-xl rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Create ticket</h2>

        <div className="mt-4 grid gap-3">
          {/* Board picker */}
          <SimpleDropdown
            value={selectedBoardId}
            options={boards.map((b) => ({ label: b.name, value: b.id }))}
            onChange={(v) => {
              setSelectedBoardId(v);
              setForm((prev) => ({ ...prev, columnId: "" }));
            }}
          />

          <input
            value={form.title}
            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Title"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600"
          />
          <textarea
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="Description"
            className="min-h-24 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600"
          />

          <div className="grid gap-3 md:grid-cols-2">
            <LabelDropdown
              value={form.label}
              labels={labels}
              onChange={(v) => setForm((prev) => ({ ...prev, label: v }))}
              onAddLabel={addLabel}
            />
            {/* Free-text version — no dropdown needed until versions exist */}
            <input
              value={form.fixVersion}
              onChange={(e) => setForm((prev) => ({ ...prev, fixVersion: e.target.value }))}
              placeholder="Fix version (optional)"
              list="version-options"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600"
            />
            <datalist id="version-options">
              {releaseVersions.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <SimpleDropdown
              value={form.hierarchyType}
              options={[
                { label: "Epic", value: "epic" },
                { label: "Story", value: "story" },
                { label: "Task", value: "task" },
              ]}
              onChange={(v) => setForm((prev) => ({ ...prev, hierarchyType: v as TicketHierarchyType }))}
            />
            <SimpleDropdown
              value={form.priority}
              options={[
                { label: "Low", value: "low", dot: "#22c55e" },
                { label: "Medium", value: "medium", dot: "#f59e0b" },
                { label: "High", value: "high", dot: "#ef4444" },
              ]}
              onChange={(v) => setForm((prev) => ({ ...prev, priority: v as "low" | "medium" | "high" }))}
            />
            <SimpleDropdown
              value={String(form.storyPoints)}
              options={[1, 2, 3, 5, 8, 13].map((p) => ({ label: `${p} SP`, value: String(p) }))}
              onChange={(v) => setForm((prev) => ({ ...prev, storyPoints: Number(v) as 1 | 2 | 3 | 5 | 8 | 13 }))}
            />
          </div>

          {/* Column picker — or warning if no columns */}
          {columnsForBoard.length === 0 ? (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
              This board has no columns yet. Add columns from the board view first.
            </p>
          ) : (
            <SimpleDropdown
              value={effectiveColumnId}
              options={columnsForBoard.map((col) => ({ label: col.name, value: col.id, dot: col.color }))}
              onChange={(v) => setForm((prev) => ({ ...prev, columnId: v }))}
            />
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
