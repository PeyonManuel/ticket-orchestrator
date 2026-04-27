"use client";

import React from "react";
import { motion } from "framer-motion";
import { Columns, ChevronRight } from "lucide-react";
import { useBoardContext } from "@/presentation/board/BoardContext";

/**
 * Collapsible navigation panel listing boards.
 */
export default function Sidebar() {
  const { boards, activeBoardId, selectBoard } = useBoardContext();

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-full border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col overflow-hidden"
    >
      <div className="p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Navigation
        </h2>
      </div>

      <div className="flex-1 px-3 space-y-1">
        {boards.map((board) => {
          const isActive = board.id === activeBoardId;
          return (
            <button
              key={board.id}
              onClick={() => selectBoard(board.id)}
              className="w-full flex items-center justify-between group px-3 py-2 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-all duration-200 border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-1.5 rounded transition-colors ${
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
                <div className="flex flex-col items-start">
                  <span
                    className={`text-sm font-medium ${
                      isActive
                        ? "text-zinc-900 dark:text-zinc-100"
                        : "text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
                    }`}
                  >
                    {board.name}
                  </span>
                  <span className="text-[10px] text-zinc-600 uppercase tracking-tighter">
                    {board.type}
                  </span>
                </div>
              </div>
              <ChevronRight
                size={14}
                className={`text-zinc-700 -translate-x-2 transition-all ${
                  isActive
                    ? "opacity-100 translate-x-0"
                    : "opacity-0 group-hover:opacity-100 group-hover:translate-x-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 text-[10px] text-zinc-400 dark:text-zinc-600 text-center font-mono">
        ORION // v1.0.0
      </div>
    </motion.aside>
  );
}
