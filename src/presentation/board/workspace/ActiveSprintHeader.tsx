"use client";

import React from "react";
import { Target, TrendingUp, Pencil } from "lucide-react";
import { useBoardActions, useBoardData } from "@/presentation/board/BoardContext";
import { useIsAdmin } from "@/presentation/shared/hooks/useIsAdmin";

/**
 * Renders the active-sprint banner above the kanban: goal, dates, capacity bar,
 * and velocity badge. Shown only in `activeSprint` view when a sprint exists.
 *
 * Capacity bar coloring:
 *   - 0–80% green
 *   - 80–100% amber
 *   - >100% red (overcommitted)
 * Mirrors what the Controller agent will surface, so users get a feel for the
 * AI's realism check before the AI service ships.
 */
export function ActiveSprintHeader() {
  const { selectedSprint, committedPoints, velocity } = useBoardData();
  const { openEditSprint } = useBoardActions();
  const isAdmin = useIsAdmin();

  if (!selectedSprint) return null;

  const capacity = selectedSprint.capacityPoints;
  const ratio = capacity > 0 ? committedPoints / capacity : 0;
  const widthPct = Math.min(100, Math.round(ratio * 100));
  const overCapacity = capacity > 0 && committedPoints > capacity;

  const barColor =
    capacity === 0
      ? "bg-zinc-400"
      : overCapacity
        ? "bg-red-500"
        : ratio >= 0.8
          ? "bg-amber-500"
          : "bg-emerald-500";

  return (
    <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 dark:bg-indigo-500/10 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-zinc-500">
            <span>{selectedSprint.status}</span>
            <span className="text-zinc-400">·</span>
            <span>
              {selectedSprint.startDate} → {selectedSprint.endDate}
            </span>
          </div>
          <h3 className="mt-1 truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {selectedSprint.name}
          </h3>
          {selectedSprint.goal && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
              <Target size={12} className="mt-0.5 shrink-0 text-indigo-500" />
              <span className="truncate">{selectedSprint.goal}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {velocity !== null && (
            <div
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-600 dark:text-zinc-300"
              title="Average completed story points across the last 3 completed sprints"
            >
              <TrendingUp size={12} className="text-emerald-500" />
              avg {velocity} SP
            </div>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => openEditSprint(selectedSprint.id)}
              className="rounded-md p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 transition-colors"
              title="Edit sprint"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>Committed</span>
          <span className={overCapacity ? "font-semibold text-red-500" : ""}>
            {committedPoints} / {capacity || "—"} SP
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`h-full ${barColor} transition-[width] duration-200`}
            style={{ width: `${widthPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
