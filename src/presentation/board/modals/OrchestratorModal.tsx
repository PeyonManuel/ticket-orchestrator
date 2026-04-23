"use client";

import React from "react";
import { useBoardContext } from "@/presentation/board/BoardContext";

export function OrchestratorModal() {
  const { orchestratorOpen, closeModal, dispatchOrchestratorEvent } = useBoardContext();

  if (!orchestratorOpen) return null;

  return (
    <div
      onClick={closeModal}
      className="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-2xl rounded-xl border border-indigo-500/30 bg-zinc-900 p-6"
      >
        <h2 className="text-xl font-semibold text-zinc-100">AI Orchestrator</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Quick simulation controls while we prepare LangGraph integration.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={() =>
              dispatchOrchestratorEvent({
                type: "START_ANALYSIS",
                requirement: "Split quarterly roadmap into executable slices.",
              })
            }
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
          >
            Start Analysis
          </button>
          <button
            onClick={() =>
              dispatchOrchestratorEvent({
                type: "ANALYSIS_COMPLETED",
                refinementDraft: "Edge cases expanded with technical caveats.",
                planDraft: "Ticket decomposition by role and sprint capacity.",
                suggestion: {
                  id: "s-2",
                  summary: "De-scope low-value scope to protect deadline.",
                  riskLevel: "high",
                  suggestedAction: "deScope",
                },
              })
            }
            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-200"
          >
            Complete Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
