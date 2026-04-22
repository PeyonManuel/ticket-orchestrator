"use client";

import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { AnimatePresence, motion } from "framer-motion";

/**
 * MainLayout
 * @description The structural wrapper for Orion. Manages sidebar state.
 */
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 selection:bg-indigo-500/30">
      {/* Sidebar - Animated presence for smooth entry/exit */}
      <AnimatePresence mode="wait">
        {isSidebarOpen && <Sidebar key="sidebar" />}
      </AnimatePresence>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Topbar - Always visible */}
        <Topbar
          onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)}
          isSidebarOpen={isSidebarOpen}
        />

        <motion.main
          layout
          className="flex-1 overflow-y-auto bg-zinc-900/50 p-6 relative"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
