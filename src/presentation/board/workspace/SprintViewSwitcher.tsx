"use client";

import { Plus } from "lucide-react";
import {
  useBoardActions,
  useBoardData,
} from "@/presentation/board/BoardContext";
import { useIsAdmin } from "@/presentation/shared/hooks/useIsAdmin";

/**
 * Sub-toolbar: [ Board | Backlog ]  [ + New Sprint ]
 *
 * Board mode shows the filtered kanban for the selected sprint.
 * Backlog mode shows the expandable all-sprints + backlog list view.
 */
export function SprintViewSwitcher() {
  const { viewMode, hasNoSprints } = useBoardData();
  const { setViewMode, openCreateSprint } = useBoardActions();
  const isAdmin = useIsAdmin();

  const base =
    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap";
  const active = "bg-indigo-600 text-white";
  const inactive =
    "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setViewMode("backlog")}
        className={`${base} ${viewMode === "backlog" ? active : inactive}`}
      >
        Backlog
      </button>

      <button
        type="button"
        onClick={() => setViewMode("board")}
        className={`${base} ${viewMode === "board" ? active : inactive}`}
      >
        Current sprint
      </button>

      {viewMode === "board" && (
        <div
          className={`min-w-[180px] ${hasNoSprints ? "pointer-events-none opacity-50" : ""}`}
          aria-disabled={hasNoSprints}
          title={hasNoSprints ? "No sprints yet — create one" : undefined}
        ></div>
      )}

      <div className="flex-1" />

      {isAdmin && (
        <button
          type="button"
          onClick={openCreateSprint}
          className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors"
        >
          <Plus size={14} />
          New sprint
        </button>
      )}
    </div>
  );
}
