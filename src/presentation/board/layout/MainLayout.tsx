"use client";

import React, { useCallback, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BoardProvider } from "@/presentation/board/BoardContext";
import Sidebar from "@/presentation/board/layout/Sidebar";
import Topbar from "@/presentation/board/layout/Topbar";
import { TicketModal } from "@/presentation/board/modals/TicketModal";
import { CreateTicketModal } from "@/presentation/board/modals/CreateTicketModal";
import { OrchestratorModal } from "@/presentation/board/modals/OrchestratorModal";
import { SearchModal } from "@/presentation/board/modals/SearchModal";
import { useIsMobile } from "@/presentation/shared/hooks/useIsMobile";

const SIDEBAR_W = 280;

/**
 * Two sidebar strategies:
 *
 * Desktop: the full [sidebar | content] row translates together via a single
 *   CSS transform. Both pieces move in perfect sync — no separate layout
 *   animations that can desync.
 *
 * Mobile: sidebar is a fixed overlay that animates in independently while
 *   the content column translates right to create the "push" feel.
 */
export default function MainLayout({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  return (
    <BoardProvider>
      {/*
       * overflow-hidden clips the sidebar that is translated off-screen
       * to the left (desktop) or the content shifted off-screen to the
       * right (mobile). Neither case should produce a scrollbar.
       */}
      <div className="h-screen w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/30">

        {/* ── Modals — rendered once at root, fixed position ─────────────
            All modal components use `position: fixed` so their DOM parent
            doesn't affect placement. Rendering them here avoids duplicating
            them inside the desktop/mobile branches below. */}
        <TicketModal />
        <CreateTicketModal />
        <OrchestratorModal />
        <SearchModal />

        {/* ── Desktop ──────────────────────────────────────────────────── */}
        {!isMobile && (
          /*
           * Standard compress layout: sidebar is a flex sibling whose wrapper
           * transitions width 0↔280px via CSS. The content column (flex-1)
           * naturally fills the remaining space — no explicit animation needed
           * on the content side. Both happen in the same CSS recalculation so
           * they're perfectly in sync without Framer Motion layout animations.
           */
          <div className="flex h-full w-full">
            <div
              className="shrink-0 h-full overflow-hidden"
              aria-hidden={!isSidebarOpen}
              style={{
                width: isSidebarOpen ? SIDEBAR_W : 0,
                transition: "width 220ms cubic-bezier(0.25,0.46,0.45,0.94)",
              }}
            >
              <Sidebar />
            </div>

            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <Topbar onToggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />
              <main className="flex-1 overflow-y-auto bg-zinc-100 dark:bg-zinc-900/50 p-6 relative">
                {children}
              </main>
            </div>
          </div>
        )}

        {/* ── Mobile ───────────────────────────────────────────────────── */}
        {isMobile && (
          <>
            {/* Sidebar overlay + backdrop */}
            <AnimatePresence>
              {isSidebarOpen && (
                <>
                  <motion.div
                    key="mobile-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    onClick={closeSidebar}
                    className="fixed inset-0 z-30 bg-black/40"
                    style={{ touchAction: "none" }}
                  />
                  <Sidebar
                    key="sidebar-mobile"
                    onBoardSelect={closeSidebar}
                    isMobileOverlay
                  />
                </>
              )}
            </AnimatePresence>

            {/* Content column — translates right when sidebar opens */}
            <motion.div
              className="flex flex-col h-full overflow-hidden"
              animate={{ x: isSidebarOpen ? SIDEBAR_W : 0 }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              style={{ pointerEvents: isSidebarOpen ? "none" : undefined }}
            >
              <Topbar onToggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />
              <main className="flex-1 overflow-y-auto bg-zinc-100 dark:bg-zinc-900/50 p-3 relative">
                {children}
              </main>
            </motion.div>
          </>
        )}
      </div>
    </BoardProvider>
  );
}
