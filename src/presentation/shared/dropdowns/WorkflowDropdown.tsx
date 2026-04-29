"use client";

import React, { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/presentation/shared/hooks/useClickOutside";

export interface WorkflowColumnChoice {
  columnId: string;
  columnName: string;
  color: string;
  states: string[];
}

interface WorkflowDropdownProps {
  selectedState: string;
  choices: WorkflowColumnChoice[];
  onSelect: (state: string) => void;
}

/**
 * Workflow state dropdown grouped by column. Clicking a state moves the
 * ticket to the mapped column automatically.
 */
export function WorkflowDropdown({ selectedState, choices, onSelect }: WorkflowDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, open, () => setOpen(false));

  const activeEntry = choices.find((entry) => entry.states.includes(selectedState));

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-indigo-400/40 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:border-indigo-400/70 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: activeEntry?.color ?? "#64748b" }}
          />
          <span className="truncate">{selectedState}</span>
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-zinc-500 transition-transform duration-150 dark:text-zinc-400 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-52 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
          <div className="p-1">
            {choices.map((entry) => (
              <div key={entry.columnId} className="mb-1 last:mb-0">
                <p
                  className="px-2 pb-0.5 pt-1.5 text-[10px] font-bold uppercase tracking-widest"
                  style={{ color: entry.color }}
                >
                  {entry.columnName}
                </p>
                {entry.states.map((stateName) => {
                  const isActive = stateName === selectedState;
                  return (
                    <button
                      key={`${entry.columnId}-${stateName}`}
                      type="button"
                      onClick={() => {
                        onSelect(stateName);
                        setOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                        isActive
                          ? "text-zinc-900 dark:text-zinc-50"
                          : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-50"
                      }`}
                      style={{
                        backgroundColor: isActive ? `${entry.color}33` : undefined,
                      }}
                    >
                      <span
                        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="flex-1">{stateName}</span>
                      {isActive && <Check size={11} className="shrink-0 text-zinc-500 dark:text-zinc-400" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
