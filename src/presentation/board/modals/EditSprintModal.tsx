"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useBoardActions, useBoardData } from "@/presentation/board/BoardContext";
import { SimpleDropdown } from "@/presentation/shared/dropdowns/SimpleDropdown";
import type { Sprint } from "@/domain/analyst";

type Weeks = 1 | 2 | 3 | 4;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addWeeks(start: Date, weeks: number): Date {
  const d = new Date(start);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

// Calculate weeks between two ISO date strings
function weeksFromDates(startStr: string, endStr: string): Weeks {
  if (!startStr || !endStr) return 2;
  const start = new Date(startStr + "T00:00:00Z");
  const end = new Date(endStr + "T00:00:00Z");
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const w = Math.round(days / 7) as Weeks;
  return [1, 2, 3, 4].includes(w) ? w : 2;
}

/**
 * Outer switch: mounts the form once the modal is open AND a sprint is
 * selected. Form state initializes from the sprint at mount, so reopening on
 * a different sprint cleanly remounts with that sprint's data — no
 * effect-based re-sync.
 */
export function EditSprintModal() {
  const { activeModal, selectedSprint } = useBoardData();
  if (activeModal !== "editSprint" || !selectedSprint) return null;
  return <EditSprintModalInner sprint={selectedSprint} key={selectedSprint.id} />;
}

function EditSprintModalInner({ sprint }: { sprint: Sprint }) {
  const { sprints } = useBoardData();
  const { updateSprint, closeModal } = useBoardActions();

  const [description, setDescription] = useState(sprint.description || "");
  const [goal, setGoal] = useState(sprint.goal || "");
  const [startDate, setStartDate] = useState(sprint.startDate);
  const [weeks, setWeeks] = useState<Weeks>(weeksFromDates(sprint.startDate, sprint.endDate));
  const [capacityPoints, setCapacityPoints] = useState(String(sprint.capacityPoints));
  const [submitting, setSubmitting] = useState(false);
  const [showOverlapWarning, setShowOverlapWarning] = useState(false);
  const [conflictingSprints, setConflictingSprints] = useState<typeof sprints>([]);

  const selectedSprint = sprint;

  const endDate = startDate ? isoDate(addWeeks(new Date(startDate + "T00:00:00Z"), weeks)) : "";

  // Check for overlaps with other sprints (excluding self)
  const overlappingSprints = sprints.filter((s) => {
    if (s.id === selectedSprint.id) return false;
    return startDate <= s.endDate && endDate >= s.startDate;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (overlappingSprints.length > 0) {
      setConflictingSprints(overlappingSprints);
      setShowOverlapWarning(true);
      return;
    }
    setSubmitting(true);
    await updateSprint(selectedSprint.id, {
      description: description.trim(),
      goal: goal.trim(),
      startDate,
      endDate,
      capacityPoints: Number(capacityPoints) || 0,
    });
    closeModal();
  };

  const handleConfirmOverlap = async () => {
    setShowOverlapWarning(false);
    setSubmitting(true);
    await updateSprint(selectedSprint.id, {
      description: description.trim(),
      goal: goal.trim(),
      startDate,
      endDate,
      capacityPoints: Number(capacityPoints) || 0,
    });
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
        onSubmit={handleSubmit}
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl max-h-[90dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 sticky top-0 bg-white dark:bg-zinc-900 z-10 border-b border-zinc-100 dark:border-zinc-800">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-zinc-500">Edit sprint</p>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{selectedSprint.name}</h2>
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
              Duration
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

          <label className="grid gap-1 text-xs text-zinc-500">
            Capacity (story points)
            <input
              type="number"
              min="0"
              step="1"
              value={capacityPoints}
              onChange={(e) => setCapacityPoints(e.target.value)}
              placeholder="0"
              className="rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>

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
              disabled={submitting}
              className="rounded-md bg-indigo-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </motion.form>

      {/* Overlap warning modal */}
      {showOverlapWarning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.15 }}
          onClick={(e) => {
            e.stopPropagation();
            setShowOverlapWarning(false);
          }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 dark:bg-zinc-950/70 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-sm rounded-xl border border-amber-200 dark:border-amber-800 bg-white dark:bg-zinc-900 shadow-2xl p-5"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-300">⚠️</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Date conflict</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  This sprint&apos;s dates overlap with {conflictingSprints.length} other sprint{conflictingSprints.length !== 1 ? "s" : ""}:
                </p>
                <div className="mt-2 space-y-1">
                  {conflictingSprints.map((s) => (
                    <p key={s.id} className="text-xs text-zinc-500 dark:text-zinc-400">
                      • <span className="font-medium">{s.name}</span> ({s.startDate} → {s.endDate})
                    </p>
                  ))}
                </div>
                <p className="mt-3 text-sm text-amber-700 dark:text-amber-200">
                  Overlapping sprints can make planning confusing. Proceed only if intentional.
                </p>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOverlapWarning(false)}
                className="rounded-md border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={handleConfirmOverlap}
                disabled={submitting}
                className="rounded-md bg-amber-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Saving…" : "Save anyway"}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  );
}
