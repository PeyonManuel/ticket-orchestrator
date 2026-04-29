"use client";

import React, { useMemo, useState } from "react";
import { useBoardContext } from "@/presentation/board/BoardContext";
import { LabelDropdown } from "@/presentation/shared/dropdowns/LabelDropdown";
import { SimpleDropdown } from "@/presentation/shared/dropdowns/SimpleDropdown";
import type { TicketHierarchyType } from "@/domain/analyst";

export function CreateTicketModal() {
  const {
    activeBoardId,
    boardColumns,
    releaseVersions,
    createModalOpen,
    createTicket,
    closeModal,
    labels,
    addLabel,
  } = useBoardContext();

  const columnsForBoard = useMemo(
    () => boardColumns.filter((column) => column.boardId === activeBoardId),
    [activeBoardId, boardColumns],
  );

  const [form, setForm] = useState<{
    title: string;
    description: string;
    label: string;
    fixVersion: string;
    storyPoints: 1 | 2 | 3 | 5 | 8 | 13;
    hierarchyType: TicketHierarchyType;
    priority: "low" | "medium" | "high";
    parentTicketId: string;
    columnId: string;
  }>({
    title: "",
    description: "",
    label: "backend",
    fixVersion: releaseVersions[0]?.name ?? "v1.0.0",
    storyPoints: 3,
    hierarchyType: "task",
    priority: "medium",
    parentTicketId: "",
    columnId: columnsForBoard[0]?.id ?? "",
  });

  // Adjust state while rendering when the active board's columns change
  if (
    columnsForBoard[0] &&
    !columnsForBoard.find((item) => item.id === form.columnId)
  ) {
    setForm((prev) => ({ ...prev, columnId: columnsForBoard[0].id }));
  }

  if (!createModalOpen) return null;

  const chosenColumn = columnsForBoard.find((item) => item.id === form.columnId);

  return (
    <div
      onClick={closeModal}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 dark:bg-zinc-950/70 backdrop-blur-sm p-6"
    >
      <form
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          if (!activeBoardId || !form.columnId || !form.title.trim()) return;
          createTicket({
            boardId: activeBoardId,
            columnId: form.columnId,
            hierarchyType: form.hierarchyType,
            parentTicketId: form.parentTicketId || null,
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
          <input
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Title"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600"
          />
          <textarea
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
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
            <SimpleDropdown
              value={form.fixVersion}
              options={releaseVersions.map((v) => ({
                label: v.name,
                value: v.name,
                meta: v.releaseDate,
              }))}
              onChange={(v) => setForm((prev) => ({ ...prev, fixVersion: v }))}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <SimpleDropdown
              value={form.hierarchyType}
              options={[
                { label: "Epic", value: "epic" },
                { label: "Story", value: "story" },
                { label: "Task", value: "task" },
              ]}
              onChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  hierarchyType: v as TicketHierarchyType,
                }))
              }
            />
            <SimpleDropdown
              value={form.priority}
              options={[
                { label: "Low", value: "low", dot: "#22c55e" },
                { label: "Medium", value: "medium", dot: "#f59e0b" },
                { label: "High", value: "high", dot: "#ef4444" },
              ]}
              onChange={(v) =>
                setForm((prev) => ({ ...prev, priority: v as "low" | "medium" | "high" }))
              }
            />
            <SimpleDropdown
              value={String(form.storyPoints)}
              options={[1, 2, 3, 5, 8, 13].map((p) => ({
                label: `${p} SP`,
                value: String(p),
              }))}
              onChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  storyPoints: Number(v) as 1 | 2 | 3 | 5 | 8 | 13,
                }))
              }
            />
            <SimpleDropdown
              value={form.columnId}
              options={columnsForBoard.map((col) => ({
                label: col.name,
                value: col.id,
                dot: col.color,
              }))}
              onChange={(v) => setForm((prev) => ({ ...prev, columnId: v }))}
            />
          </div>
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
              className="rounded-md bg-indigo-400 px-4 py-2 text-xs font-semibold text-zinc-950"
            >
              Create
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
