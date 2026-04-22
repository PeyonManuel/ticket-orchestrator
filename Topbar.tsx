"use client";

import React from "react";
import { PanelLeftClose, PanelLeftOpen, Search, Plus } from "lucide-react";

interface TopbarProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

/**
 * Topbar Component
 * @description Handles logo, sidebar toggle, and the centered Search + Create group.
 */
export default function Topbar({
  onToggleSidebar,
  isSidebarOpen,
}: TopbarProps) {
  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950 flex items-center px-4 shrink-0">
      {/* Left Section: Logo & Toggle */}
      <div className="flex items-center gap-4 w-1/4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-sm flex items-center justify-center font-bold text-lg italic shadow-[0_0_15px_rgba(79,70,229,0.4)]">
            O
          </div>
          <span className="font-bold tracking-tighter text-xl hidden md:block">
            ORION
          </span>
        </div>

        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-zinc-900 rounded-md transition-colors text-zinc-400 hover:text-zinc-100"
          title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
        >
          {isSidebarOpen ? (
            <PanelLeftClose size={20} />
          ) : (
            <PanelLeftOpen size={20} />
          )}
        </button>
      </div>

      {/* Middle Section: Search + Create (Centered) */}
      <div className="flex-1 flex justify-center items-center gap-3">
        <div className="relative w-full max-w-md group">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors"
            size={16}
          />
          <input
            type="text"
            placeholder="Search tickets, agents, or commands..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-full py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all placeholder:text-zinc-600"
          />
        </div>

        <button className="flex items-center gap-2 bg-zinc-100 text-zinc-950 px-4 py-2 rounded-full text-sm font-semibold hover:bg-zinc-300 transition-all shrink-0">
          <Plus size={16} />
          <span>Create</span>
        </button>
      </div>

      {/* Right Section: Placeholder for User/Settings */}
      <div className="w-1/4 flex justify-end">
        <div className="w-8 h-8 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center text-[10px] text-zinc-500">
          N/A
        </div>
      </div>
    </header>
  );
}
