"use client";

import React, { useEffect } from "react";
import { PanelLeftClose, PanelLeftOpen, Search, Plus } from "lucide-react";
import { useBoardContext } from "@/presentation/board/BoardContext";

interface TopbarProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

/**
 * Global topbar: brand, sidebar toggle, centered search + create.
 */
export default function Topbar({ onToggleSidebar, isSidebarOpen }: TopbarProps) {
  const { openCreateTicket, openSearch } = useBoardContext();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openSearch]);

  return (
    <header className="h-16 border-b border-zinc-800 bg-zinc-950 flex items-center px-4 shrink-0">
      <div className="flex items-center gap-4 w-1/4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-sm flex items-center justify-center font-bold text-lg italic shadow-[0_0_15px_rgba(79,70,229,0.4)]">
            O
          </div>
          <span className="font-bold tracking-tighter text-xl hidden md:block">ORION</span>
        </div>

        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-zinc-900 rounded-md transition-colors text-zinc-400 hover:text-zinc-100"
          title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
        >
          {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
      </div>

      <div className="flex-1 flex justify-center items-center gap-3">
        <button
          onClick={openSearch}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-300 hover:border-indigo-500/50 hover:text-zinc-100"
        >
          <Search className="text-zinc-500" size={15} />
          <span>Search</span>
          <span className="text-xs text-zinc-500">Ctrl+K</span>
        </button>

        <button
          onClick={openCreateTicket}
          className="flex items-center gap-2 bg-indigo-300 text-zinc-950 px-4 py-2 rounded-full text-sm font-semibold hover:bg-indigo-200 transition-all shrink-0"
        >
          <Plus size={16} />
          <span>Create</span>
        </button>
      </div>

      <div className="w-1/4 flex justify-end">
        <div className="w-8 h-8 rounded-full border border-zinc-800 bg-zinc-900 flex items-center justify-center text-[10px] text-zinc-500">
          N/A
        </div>
      </div>
    </header>
  );
}
