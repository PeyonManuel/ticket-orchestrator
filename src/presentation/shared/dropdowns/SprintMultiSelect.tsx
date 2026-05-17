"use client";

import { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/presentation/shared/hooks/useClickOutside";
import type { Sprint } from "@/domain/analyst";

interface SprintMultiSelectProps {
  /** Sprints from the ticket's board, in display order. */
  sprints: Sprint[];
  /** Currently-selected sprint ids. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Hide completed sprints by default — usually the user only assigns to active/planning. */
  showCompleted?: boolean;
  className?: string;
}

/**
 * Multi-select dropdown for assigning a ticket to one or more sprints.
 * Distinct component (not a generalised MultiSelect) because it needs
 * sprint-specific status badges and a "show completed" affordance.
 */
export function SprintMultiSelect({
  sprints,
  value,
  onChange,
  showCompleted = false,
  className = "",
}: SprintMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [showDone, setShowDone] = useState(showCompleted);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, open, () => setOpen(false));

  const visible = sprints.filter((s) => showDone || s.status !== "completed");
  const selected = sprints.filter((s) => value.includes(s.id));

  const summary =
    selected.length === 0
      ? "No sprint"
      : selected.length === 1
        ? selected[0].name
        : `${selected.length} sprints`;

  const toggle = (sprintId: string) => {
    if (value.includes(sprintId)) onChange(value.filter((v) => v !== sprintId));
    else onChange([...value, sprintId]);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500"
      >
        <span className="truncate">{summary}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-zinc-500 transition-transform duration-150 dark:text-zinc-400 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-72 overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
          {visible.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-zinc-500">No sprints available.</p>
          ) : (
            visible.map((s) => {
              const active = value.includes(s.id);
              const meta =
                s.status === "active" ? "active" : s.status === "completed" ? "done" : undefined;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-50"
                  }`}
                >
                  <span className="flex-1 truncate">{s.name}</span>
                  {meta && <span className="text-[10px] text-zinc-500">{meta}</span>}
                  {active && (
                    <Check size={11} className="shrink-0 text-indigo-500" />
                  )}
                </button>
              );
            })
          )}

          {sprints.some((s) => s.status === "completed") && (
            <button
              type="button"
              onClick={() => setShowDone((d) => !d)}
              className="mt-1 w-full rounded px-2 py-1.5 text-left text-[11px] text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
            >
              {showDone ? "Hide completed" : "Show completed"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
