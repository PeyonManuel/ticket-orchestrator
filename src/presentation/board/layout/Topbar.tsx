"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { PanelLeftClose, PanelLeftOpen, Search, Plus, Sun, Moon } from "lucide-react";
import { dark } from "@clerk/themes";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { useBoardContext } from "@/presentation/board/BoardContext";
import { useTheme } from "@/presentation/shared/ThemeProvider";

interface TopbarProps {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
}

/**
 * Global topbar: brand, sidebar toggle, centered search + create.
 */
export default function Topbar({ onToggleSidebar, isSidebarOpen }: TopbarProps) {
  const { openCreateTicket, openSearch } = useBoardContext();
  const { theme, toggle } = useTheme();

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
    <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-center px-4 shrink-0">
      <div className="flex items-center gap-4 w-1/4">
        <Link href="/" className="flex items-center gap-2 select-none">
          <div className="w-8 h-8 bg-indigo-600 rounded-sm flex items-center justify-center font-bold text-lg italic shadow-[0_0_15px_rgba(79,70,229,0.4)]">
            O
          </div>
          <span className="font-bold tracking-tighter text-xl hidden md:block">ORION</span>
        </Link>

        <button
          onClick={onToggleSidebar}
          className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-md transition-colors text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
        >
          {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
        </button>
      </div>

      <div className="flex-1 flex justify-center items-center gap-3">
        <button
          onClick={openSearch}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:border-indigo-500/50 hover:text-zinc-900 dark:hover:text-zinc-100"
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

      <div className="w-1/4 flex justify-end items-center gap-3">
        <button
          onClick={toggle}
          className="p-2 rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        {/* Org switcher: lets users invite members, create new orgs, or switch */}
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
          appearance={theme === "dark" ? {
            baseTheme: dark,
            variables: {
              colorBackground: "#18181b",
              colorInputBackground: "#09090b",
              colorText: "#f4f4f5",
              colorTextSecondary: "#a1a1aa",
              colorTextOnPrimaryBackground: "#ffffff",
              colorPrimary: "#6366f1",
              colorDanger: "#f87171",
              colorInputText: "#f4f4f5",
              colorNeutral: "#71717a",
              borderRadius: "0.5rem",
            },
            elements: {
              organizationSwitcherTrigger:
                "!bg-transparent !border !border-zinc-700 !rounded-md !px-3 !py-1.5 !text-sm !text-zinc-300 hover:!border-zinc-500 hover:!text-zinc-100 !transition-colors",
              organizationSwitcherPopoverCard:
                "!bg-zinc-900 !border !border-zinc-700 !shadow-2xl",
              organizationPreviewMainIdentifier: "!text-zinc-100",
              organizationPreviewSecondaryIdentifier: "!text-zinc-400",
              organizationSwitcherPopoverActionButton: "hover:!bg-zinc-800",
              organizationSwitcherPopoverActionButtonText: "!text-zinc-200",
              organizationSwitcherPopoverActionButtonIcon: "!text-zinc-400",
              organizationSwitcherPreviewButton: "hover:!bg-zinc-800",
            },
          } : {
            variables: {
              colorBackground: "#ffffff",
              colorInputBackground: "#f4f4f5",
              colorText: "#18181b",
              colorTextSecondary: "#71717a",
              colorTextOnPrimaryBackground: "#ffffff",
              colorPrimary: "#6366f1",
              colorInputText: "#18181b",
              colorNeutral: "#71717a",
              borderRadius: "0.5rem",
            },
            elements: {
              organizationSwitcherTrigger:
                "!bg-transparent !border !border-zinc-300 !rounded-md !px-3 !py-1.5 !text-sm !text-zinc-800 hover:!border-zinc-400 hover:!text-zinc-900 !transition-colors",
              organizationSwitcherPopoverCard:
                "!bg-white !border !border-zinc-200 !shadow-xl",
              organizationPreviewMainIdentifier: "!text-zinc-900",
              organizationPreviewSecondaryIdentifier: "!text-zinc-500",
              organizationSwitcherPopoverActionButton: "hover:!bg-zinc-100",
              organizationSwitcherPopoverActionButtonText: "!text-zinc-800",
              organizationSwitcherPopoverActionButtonIcon: "!text-zinc-500",
              organizationSwitcherPreviewButton: "hover:!bg-zinc-100",
            },
          }}
        />
        {/* Clerk's pre-built avatar — opens a dropdown with sign-out, profile, etc. */}
        <UserButton
          appearance={theme === "dark" ? {
            baseTheme: dark,
            variables: {
              colorBackground: "#18181b",
              colorInputBackground: "#09090b",
              colorText: "#f4f4f5",
              colorTextSecondary: "#a1a1aa",
              colorPrimary: "#6366f1",
              colorInputText: "#f4f4f5",
              colorNeutral: "#71717a",
            },
            elements: {
              avatarBox: "w-8 h-8",
              userButtonPopoverCard: "!bg-zinc-900 !border !border-zinc-700 !shadow-2xl",
              userButtonPopoverActionButton: "!text-zinc-300 hover:!bg-zinc-800",
              userButtonPopoverActionButtonText: "!text-zinc-300",
              userButtonPopoverActionButtonIcon: "!text-zinc-400",
              userButtonPopoverFooter: "!border-zinc-700",
              userPreviewMainIdentifier: "!text-zinc-100",
              userPreviewSecondaryIdentifier: "!text-zinc-400",
            },
          } : {
            variables: {
              colorBackground: "#ffffff",
              colorInputBackground: "#f4f4f5",
              colorText: "#18181b",
              colorTextSecondary: "#71717a",
              colorPrimary: "#6366f1",
              colorInputText: "#18181b",
              colorNeutral: "#71717a",
            },
            elements: {
              avatarBox: "w-8 h-8",
              userButtonPopoverCard: "!bg-white !border !border-zinc-200 !shadow-xl",
              userButtonPopoverActionButton: "!text-zinc-700 hover:!bg-zinc-100",
              userButtonPopoverActionButtonText: "!text-zinc-700",
              userButtonPopoverActionButtonIcon: "!text-zinc-500",
              userButtonPopoverFooter: "!border-zinc-200",
              userPreviewMainIdentifier: "!text-zinc-900",
              userPreviewSecondaryIdentifier: "!text-zinc-500",
            },
          }}
        />
      </div>
    </header>
  );
}
