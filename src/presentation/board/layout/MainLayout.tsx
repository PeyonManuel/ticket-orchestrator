"use client";

import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BoardProvider } from "@/presentation/board/BoardContext";
import Sidebar from "@/presentation/board/layout/Sidebar";
import Topbar from "@/presentation/board/layout/Topbar";
import { TicketModal } from "@/presentation/board/modals/TicketModal";
import { CreateTicketModal } from "@/presentation/board/modals/CreateTicketModal";
import { OrchestratorModal } from "@/presentation/board/modals/OrchestratorModal";
import { SearchModal } from "@/presentation/board/modals/SearchModal";

/**
 * MainLayout — wraps the app with BoardProvider and the global chrome
 * (sidebar, topbar, overlays).
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  return (
    <BoardProvider>
      <div className="flex h-screen w-full bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/30">
        <AnimatePresence mode="wait">
          {isSidebarOpen && <Sidebar key="sidebar" />}
        </AnimatePresence>

        <div className="flex flex-col flex-1 overflow-hidden">
          <Topbar
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            isSidebarOpen={isSidebarOpen}
          />

          <motion.main layout className="flex-1 overflow-y-auto bg-zinc-100 dark:bg-zinc-900/50 p-6 relative">
            {children}
            <TicketModal />
            <CreateTicketModal />
            <OrchestratorModal />
            <SearchModal />
          </motion.main>
        </div>
      </div>
    </BoardProvider>
  );
}
