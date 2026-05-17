"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBoardData, useBoardActions } from "@/presentation/board/BoardContext";
import { OrchestratorRoot } from "@/presentation/orchestrator/OrchestratorRoot";

/**
 * Full-height sheet hosting the AI Orchestrator workflow.
 *
 * The orchestrator workflow is too dense for a centered card; we use a
 * slide-up sheet on mobile and a centered tall panel on desktop. Animation
 * follows the Animation Contract: backdrop 150ms linear, panel 160ms cubic.
 */
export function OrchestratorModal() {
  const { orchestratorOpen } = useBoardData();
  const { closeModal } = useBoardActions();

  // Close on Escape — feels faster than reaching for the button.
  useEffect(() => {
    if (!orchestratorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [orchestratorOpen, closeModal]);

  return (
    <AnimatePresence>
      {orchestratorOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "linear" }}
          onClick={closeModal}
          className="fixed inset-0 z-40 bg-black/60 dark:bg-zinc-950/80 backdrop-blur-sm flex items-stretch sm:items-center justify-center sm:p-6"
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-5xl h-full sm:h-[90vh] sm:rounded-2xl overflow-hidden bg-zinc-50 dark:bg-zinc-950 shadow-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col"
          >
            <OrchestratorRoot onClose={closeModal} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
