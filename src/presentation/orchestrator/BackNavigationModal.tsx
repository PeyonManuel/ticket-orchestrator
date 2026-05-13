"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  isOpen: boolean;
  fromPhase: "Phase 1" | "Phase 2" | "Phase 3" | "Phase 4";
  toPhase: "Phase 1" | "Phase 2" | "Phase 3";
  onConfirm: () => void;
  onCancel: () => void;
}

export function BackNavigationModal({
  isOpen,
  fromPhase,
  toPhase,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "linear" }}
            onClick={onCancel}
            className="fixed inset-0 bg-black/30 dark:bg-black/50 z-40"
          />
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto w-96 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl"
            >
              <div className="p-6">
                <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  Return to {toPhase}?
                </h2>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
                  Going back will clear your work from {fromPhase}. Your brainstorm and chat
                  history will be preserved, but any refinements, plan details, or assignments
                  will be reset.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={onCancel}
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Stay
                  </button>
                  <button
                    onClick={onConfirm}
                    className="flex-1 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors"
                  >
                    Go back
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
