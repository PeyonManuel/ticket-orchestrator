"use client";

import React from "react";
import type { OrchestratorPhase } from "@/domain/orchestrator/types";

const PHASE_ORDER: OrchestratorPhase[] = [
  "phase1Brainstorming",
  "phase2Structuring",
  "phase3Refining",
  "phase4SprintPlanning",
];

const PHASE_LABEL: Record<OrchestratorPhase, string> = {
  phase1Brainstorming: "Discovery",
  phase2Structuring: "Blueprint",
  phase3Refining: "Deep Dive",
  phase4SprintPlanning: "Sprint Plan",
  committing: "Committing",
  committed: "Committed",
  abandoned: "Abandoned",
};

interface Props {
  phase: OrchestratorPhase;
  title: string;
  saving: boolean;
  onClose: () => void;
  onBackToPicker: () => void;
}

export function PhaseHeader({ phase, title, saving, onClose, onBackToPicker }: Props) {
  const currentIndex = PHASE_ORDER.indexOf(phase);

  return (
    <div className="flex flex-col gap-3 border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold">
            ◐
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {title || "New Epic Draft"}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              AI Orchestrator · {PHASE_LABEL[phase]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-zinc-400 dark:text-zinc-500 mr-1 tabular-nums">
            {saving ? "Saving…" : "Saved"}
          </span>
          <button
            onClick={onBackToPicker}
            className="rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center"
          >
            ×
          </button>
        </div>
      </div>

      {currentIndex >= 0 && (
        <div className="flex items-center gap-2">
          {PHASE_ORDER.map((p, i) => {
            const reached = i <= currentIndex;
            const active = i === currentIndex;
            return (
              <React.Fragment key={p}>
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full transition-colors ${
                      active
                        ? "bg-indigo-500 ring-4 ring-indigo-500/20"
                        : reached
                          ? "bg-indigo-500"
                          : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                  />
                  <span
                    className={`text-xs font-medium ${
                      reached
                        ? "text-zinc-700 dark:text-zinc-200"
                        : "text-zinc-400 dark:text-zinc-600"
                    }`}
                  >
                    {PHASE_LABEL[p]}
                  </span>
                </div>
                {i < PHASE_ORDER.length - 1 && (
                  <div
                    className={`h-px flex-1 transition-colors ${
                      i < currentIndex
                        ? "bg-indigo-500"
                        : "bg-zinc-200 dark:bg-zinc-800"
                    }`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
