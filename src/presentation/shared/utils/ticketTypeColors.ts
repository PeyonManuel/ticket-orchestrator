import type { TicketHierarchyType } from "@/domain/analyst";

/**
 * Color tokens for ticket hierarchy types.
 *  - epic: violet
 *  - story: emerald (green)
 *  - task: sky (blue)
 *
 * Each entry contains:
 *  - text/bg/border: Tailwind class strings for pills, badges, breadcrumb chips.
 *  - accent: hex color, used for inline styles (e.g. `border-left` on cards).
 *  - label: human-readable name.
 */
export const TICKET_TYPE_COLORS: Record<
  TicketHierarchyType,
  {
    text: string;
    bg: string;
    border: string;
    accent: string;
    label: string;
  }
> = {
  epic: {
    text: "text-violet-700 dark:text-violet-300",
    bg: "bg-violet-100 dark:bg-violet-900/30",
    border: "border-violet-400 dark:border-violet-500",
    accent: "#a855f7",
    label: "Epic",
  },
  story: {
    text: "text-emerald-700 dark:text-emerald-300",
    bg: "bg-emerald-100 dark:bg-emerald-900/30",
    border: "border-emerald-400 dark:border-emerald-500",
    accent: "#10b981",
    label: "Story",
  },
  task: {
    text: "text-sky-700 dark:text-sky-300",
    bg: "bg-sky-100 dark:bg-sky-900/30",
    border: "border-sky-400 dark:border-sky-500",
    accent: "#0ea5e9",
    label: "Task",
  },
};
