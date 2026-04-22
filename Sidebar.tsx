"use client";

import React from "react";
import { motion } from "framer-motion";
import { Columns, ChevronRight } from "lucide-react";

const MOCK_BOARDS = [
  { id: "1", name: "Engineering Sprint", type: "Scrum" },
  { id: "2", name: "Product Roadmap", type: "Kanban" },
  { id: "3", name: "AI Research Agents", type: "Task" },
];

/**
 * Sidebar Component
 * @description Collapsible navigation panel with a minimalist tech edge.
 */
export default function Sidebar() {
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 280, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="h-full border-r border-zinc-800 bg-zinc-950 flex flex-col overflow-hidden"
    >
      <div className="p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Navigation
        </h2>
      </div>

      <div className="flex-1 px-3 space-y-1">
        {MOCK_BOARDS.map((board) => (
          <button
            key={board.id}
            className="w-full flex items-center justify-between group px-3 py-2 rounded-md hover:bg-zinc-900 transition-all duration-200 border border-transparent hover:border-zinc-800"
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 rounded bg-zinc-900 group-hover:bg-zinc-800 transition-colors">
                <Columns
                  size={14}
                  className="text-zinc-400 group-hover:text-indigo-400"
                />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100">
                  {board.name}
                </span>
                <span className="text-[10px] text-zinc-600 uppercase tracking-tighter">
                  {board.type}
                </span>
              </div>
            </div>
            <ChevronRight
              size={14}
              className="text-zinc-700 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all"
            />
          </button>
        ))}
      </div>

      <div className="p-4 border-t border-zinc-800 text-[10px] text-zinc-600 text-center font-mono">
        ORION // v1.0.0
      </div>
    </motion.aside>
  );
}
