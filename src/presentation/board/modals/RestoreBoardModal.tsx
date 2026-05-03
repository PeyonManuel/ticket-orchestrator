"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { RotateCcw, X } from "lucide-react";
import type { Board } from "@/domain/analyst";
import { useBoardActions } from "@/presentation/board/BoardContext";

interface RestoreBoardModalProps {
  board: Board;
  onClose: () => void;
}

export function RestoreBoardModal({ board, onClose }: RestoreBoardModalProps) {
  const { restoreBoard } = useBoardActions();
  const [restoring, setRestoring] = useState(false);

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    try {
      await restoreBoard(board.id);
      onClose();
    } finally {
      setRestoring(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-zinc-950/80 backdrop-blur-sm p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <RotateCcw size={16} className="text-indigo-400" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Restore board
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Restore{" "}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100 font-mono">
              {board.name}
            </span>
            ? It will reappear in the sidebar with all its tickets and columns intact.
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={restoring}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoring}
              className="rounded-md bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {restoring ? "Restoring…" : "Restore"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
