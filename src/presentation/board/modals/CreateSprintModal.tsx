"use client";

import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useBoardActions, useBoardData } from "@/presentation/board/BoardContext";
import { SimpleDropdown } from "@/presentation/shared/dropdowns/SimpleDropdown";

type Weeks = 1 | 2 | 3 | 4;

/**
 * Adds `weeks` calendar weeks to today's date and returns ISO YYYY-MM-DD.
 * Used to pre-fill `endDate` from the user's chosen sprint length so we
 * don't make them open a date picker for the most common case.
 */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addWeeks(start: Date, weeks: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

/**
 * Outer wrapper only handles the open/closed switch. Form state lives in the
 * inner component which mounts when the modal opens and unmounts on close —
 * so every reopen gets fresh defaults without an effect-based reset.
 */
export function CreateSprintModal() {
  const { createSprintModalOpen } = useBoardData();
  if (!createSprintModalOpen) return null;
  return <CreateSprintModalInner />;
}

function CreateSprintModalInner() {
  const { boards, activeBoardId, sprints } = useBoardData();
  const { createSprint, closeModal, selectSprint } = useBoardActions();

  const today = useMemo(() => isoDate(new Date()), []);
  const board = boards.find((b) => b.id === activeBoardId);
  const proposedName = useMemo(() => {
    if (!board) return "";
    const count = sprints.filter((s) => s.boardId === board.id).length;
    return `${board.name} ${count + 1}`;
  }, [board, sprints]);

  // Smart start date: day after the latest active/planning sprint ends.
  // Falls back to today if none exist.
  const suggestedStartDate = useMemo(() => {
    const boardSprints = sprints.filter((s) => s.boardId === activeBoardId);
    const nonCompleted = boardSprints
      .filter((s) => s.status === "active" || s.status === "planning")
      .sort((a, b) => b.endDate.localeCompare(a.endDate));
    if (nonCompleted.length === 0) return today;
    const lastEnd = new Date(nonCompleted[0].endDate);
    lastEnd.setDate(lastEnd.getDate() + 1);
    return isoDate(lastEnd);
  }, [sprints, activeBoardId, today]);

  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(suggestedStartDate);
  const [weeks, setWeeks] = useState<Weeks>(2);
  const [submitting, setSubmitting] = useState(false);

  const endDate = isoDate(addWeeks(new Date(startDate), weeks));

  // Check for date conflicts with existing sprints on this board
  const boardSprints = sprints.filter((s) => s.boardId === activeBoardId);
  const hasConflict = boardSprints.some((sprint) => {
    // Overlaps if: newStart <= existingEnd AND newEnd >= existingStart
    return startDate <= sprint.endDate && endDate >= sprint.startDate;
  });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBoardId || submitting || hasConflict) return;
    setSubmitting(true);
    const created = await createSprint({
      description: description.trim(),
      goal: goal.trim(),
      startDate,
      endDate,
      capacityPoints: 0,
    });
    if (created) {
      selectSprint(created.id);
    }
    closeModal();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={closeModal}
      className="fixed inset-0 z-30 flex items-end sm:items-center justify-center bg-black/50 dark:bg-zinc-950/70 backdrop-blur-sm"
    >
      <motion.form
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-white dark:bg-zinc-900 z-10 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">New sprint</p>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{proposedName}</h2>
          </div>
          <button type="button" onClick={closeModal} className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 grid gap-3">
          <input
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Sprint goal — one line (e.g. 'Ship checkout v2')"
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 resize-none focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-zinc-500">
              Starts
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </label>
            <label className="grid gap-1 text-xs text-zinc-500">
              Length
              <SimpleDropdown
                value={String(weeks)}
                options={[1, 2, 3, 4].map((w) => ({ label: `${w} week${w > 1 ? "s" : ""}`, value: String(w) }))}
                onChange={(v) => setWeeks(Number(v) as Weeks)}
              />
            </label>
          </div>

          <p className="text-xs text-zinc-500">
            Ends <span className="font-medium text-zinc-700 dark:text-zinc-300">{endDate}</span>
          </p>

          {hasConflict && (
            <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
              <p className="text-xs text-amber-900 dark:text-amber-200">
                ⚠️ These dates overlap with an existing sprint. Pick different dates.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeModal}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !activeBoardId || hasConflict}
              className="rounded-md bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Creating…" : "Create sprint"}
            </button>
          </div>
        </div>
      </motion.form>
    </motion.div>
  );
}
