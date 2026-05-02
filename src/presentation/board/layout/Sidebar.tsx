"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Columns, ChevronRight, ChevronDown, Plus, X, Trash2, RotateCcw } from "lucide-react";
import { useQuery } from "@apollo/client/react";
import type { Board } from "@/domain/analyst";
import { useBoardActions, useBoardData } from "@/presentation/board/BoardContext";
import { useIsAdmin } from "@/presentation/shared/hooks/useIsAdmin";
import { GET_ARCHIVED_BOARDS } from "@/infrastructure/graphql/operations";
import { DeleteBoardModal } from "@/presentation/board/modals/DeleteBoardModal";

const RETENTION_DAYS = 30;

/**
 * Returns days remaining until permanent purge, given an ISO `deletedAt` string.
 * Floored, never negative — a 0 means "purged on next cleanup tick."
 */
function daysLeft(deletedAt: string | null | undefined): number {
  if (!deletedAt) return RETENTION_DAYS;
  const elapsedMs = Date.now() - new Date(deletedAt).getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return Math.max(0, RETENTION_DAYS - elapsedDays);
}

interface ArchivedBoardsResult {
  archivedBoards: Board[];
}

export default function Sidebar() {
  const { boards, activeBoardId } = useBoardData();
  const { selectBoard, createBoard, restoreBoard } = useBoardActions();
  const isAdmin = useIsAdmin();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState<Board | null>(null);
  const [trashExpanded, setTrashExpanded] = useState(false);

  // Only fetch archived boards when admin is viewing the sidebar.
  const { data: archivedData } = useQuery<ArchivedBoardsResult>(GET_ARCHIVED_BOARDS, {
    skip: !isAdmin,
  });
  const archived = archivedData?.archivedBoards ?? [];

  async function handleCreate(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    await createBoard(name);
    setName("");
    setCreating(false);
    setLoading(false);
  }

  return (
    <>
      <motion.aside
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: 280, opacity: 1 }}
        exit={{ width: 0, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="h-full border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 pb-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Boards
          </h2>
          <button
            onClick={() => setCreating((v) => !v)}
            className="rounded-md p-1 text-zinc-400 hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
            title="New board"
          >
            {creating ? <X size={14} /> : <Plus size={14} />}
          </button>
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="px-3 pb-3 flex flex-col gap-2">
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Board name"
              disabled={loading}
              className="w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Creating…" : "Create board"}
            </button>
          </form>
        )}

        <div className="flex-1 px-3 space-y-1 overflow-y-auto">
          {boards.length === 0 && !creating && (
            <p className="px-3 py-4 text-xs text-zinc-500 text-center">
              No boards yet.{" "}
              <button
                onClick={() => setCreating(true)}
                className="text-indigo-400 hover:underline"
              >
                Create one
              </button>
            </p>
          )}

          {boards.map((board) => {
            const isActive = board.id === activeBoardId;
            return (
              <div
                key={board.id}
                className="w-full flex items-center group rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all duration-200 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
              >
                <button
                  onClick={() => selectBoard(board.id)}
                  className="flex-1 flex items-center justify-between px-3 py-2 min-w-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-1.5 rounded transition-colors flex-shrink-0 ${
                        isActive
                          ? "bg-indigo-500/20"
                          : "bg-zinc-100 dark:bg-zinc-900 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-800"
                      }`}
                    >
                      <Columns
                        size={14}
                        className={`${
                          isActive
                            ? "text-indigo-300"
                            : "text-zinc-400 group-hover:text-indigo-400"
                        }`}
                      />
                    </div>
                    <div className="flex flex-col items-start min-w-0">
                      <span
                        className={`text-sm font-medium truncate ${
                          isActive
                            ? "text-zinc-900 dark:text-zinc-100"
                            : "text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
                        }`}
                      >
                        {board.name}
                      </span>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-zinc-700 -translate-x-2 transition-all flex-shrink-0 ${
                      isActive
                        ? "opacity-100 translate-x-0"
                        : "opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                    }`}
                  />
                </button>
                {isAdmin && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setBoardToDelete(board);
                    }}
                    className="opacity-0 group-hover:opacity-100 mr-2 rounded p-1.5 text-zinc-400 hover:bg-red-500/10 hover:text-red-500 transition-all"
                    title="Delete board"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {isAdmin && archived.length > 0 && (
          <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-2">
            <button
              onClick={() => setTrashExpanded((v) => !v)}
              className="w-full flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Trash2 size={11} />
                Trash ({archived.length})
              </span>
              {trashExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </button>

            {trashExpanded && (
              <div className="mt-1 space-y-1 max-h-48 overflow-y-auto">
                {archived.map((b) => {
                  const left = daysLeft(b.deletedAt);
                  return (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-900 group/trash"
                    >
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs text-zinc-600 dark:text-zinc-400 truncate">
                          {b.name}
                        </span>
                        <span
                          className={`text-[10px] ${
                            left <= 3 ? "text-red-500" : "text-zinc-500"
                          }`}
                        >
                          {left === 0 ? "purges next sweep" : `${left}d left`}
                        </span>
                      </div>
                      <button
                        onClick={() => restoreBoard(b.id)}
                        className="opacity-0 group-hover/trash:opacity-100 rounded p-1 text-zinc-400 hover:bg-indigo-500/10 hover:text-indigo-400 transition-all"
                        title="Restore"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-400 dark:text-zinc-600 text-center font-mono">
          ORION // v1.0.0
        </div>
      </motion.aside>

      {boardToDelete && (
        <DeleteBoardModal
          board={boardToDelete}
          onClose={() => setBoardToDelete(null)}
        />
      )}
    </>
  );
}
