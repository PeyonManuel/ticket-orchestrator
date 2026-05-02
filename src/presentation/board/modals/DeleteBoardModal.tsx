"use client";

import React, { useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import type { Board } from "@/domain/analyst";
import { useBoardActions } from "@/presentation/board/BoardContext";

interface DeleteBoardModalProps {
  board: Board;
  onClose: () => void;
}

/**
 * GitHub-style destructive confirmation modal for soft-deleting a board.
 * The Delete button stays disabled until the user types the board's exact
 * name. Soft-delete is recoverable for 30 days from the Trash section.
 */
export function DeleteBoardModal({ board, onClose }: DeleteBoardModalProps) {
  const { archiveBoard } = useBoardActions();
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const matches = typed.trim() === board.name;

  async function handleDelete() {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      await archiveBoard(board.id);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-zinc-950/80 backdrop-blur-sm p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-red-500/40 bg-white dark:bg-zinc-900 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 dark:border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-red-500" />
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              Delete board
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
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-900 dark:text-red-100">
            <p className="font-semibold">
              This will archive <span className="font-mono">{board.name}</span> and hide every ticket, column, and comment inside it.
            </p>
            <p className="mt-2 text-red-800 dark:text-red-200/90">
              The board can be restored from <strong>Trash</strong> for the next <strong>30 days</strong>. After that it will be permanently deleted along with all of its tickets and comments.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
              To confirm, type the board name:{" "}
              <span className="font-mono text-zinc-900 dark:text-zinc-100">{board.name}</span>
            </label>
            <input
              autoFocus
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={submitting}
              placeholder={board.name}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!matches || submitting}
              className="rounded-md bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Deleting…" : "Delete board"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
