"use client";

import React from "react";
import { useBoardContext } from "@/presentation/board/BoardContext";

/**
 * Placeholder shell for the AI Orchestrator panel.
 *
 * The XState orchestration machine and LangGraph integration land in the
 * dedicated AI implementation slice. Until then this modal is a stub that
 * confirms the open/close flow is wired correctly.
 */
export function OrchestratorModal() {
  const { orchestratorOpen, closeModal } = useBoardContext();

  if (!orchestratorOpen) return null;

  return (
    <div
      onClick={closeModal}
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/50 dark:bg-zinc-950/70 backdrop-blur-sm p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-indigo-500/30 bg-white dark:bg-zinc-900 p-6"
      >
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">AI Orchestrator</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          The Analyst, Architect, and Controller agents will appear here once the
          LangGraph integration is wired up.
        </p>
        <div className="mt-6 flex justify-end">
          <button
            onClick={closeModal}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
