"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { useClickOutside } from "@/presentation/shared/hooks/useClickOutside";
import { TICKET_TYPE_COLORS } from "@/presentation/shared/utils/ticketTypeColors";
import type { Ticket } from "@/domain/analyst";

interface ParentTicketSelectProps {
  /** Currently selected parent ID, or null. */
  value: string | null;
  /** Tickets eligible to be parents (epics on this board, excluding self). */
  options: Ticket[];
  onChange: (parentId: string | null) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Searchable dropdown for picking an epic as a ticket's parent.
 *
 * Filters options by ticket number or title as the user types. The selected
 * parent is shown as a violet chip with the epic title; clicking the X clears it.
 */
export function ParentTicketSelect({
  value,
  options,
  onChange,
  placeholder = "No parent",
  className = "",
}: ParentTicketSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, () => {
    setOpen(false);
    setQuery("");
  });

  const selected = useMemo(
    () => options.find((t) => t.id === value) ?? null,
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.ticketNumber.toLowerCase().includes(q),
    );
  }, [options, query]);

  const epicColors = TICKET_TYPE_COLORS.epic;

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full`} style={{ backgroundColor: epicColors.accent }} />
            <span className="truncate">
              <span className="font-mono text-[11px] text-zinc-400 mr-1.5">
                {selected.ticketNumber}
              </span>
              {selected.title}
            </span>
          </span>
        ) : (
          <span className="text-zinc-400">{placeholder}</span>
        )}
        <span className="flex shrink-0 items-center gap-1">
          {selected && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
              }}
              className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
              title="Clear parent"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={14} className="text-zinc-400" />
        </span>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2">
            <Search size={13} className="text-zinc-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search epics..."
              className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
            />
          </div>
          <ul className="max-h-60 overflow-y-auto py-1">
            {options.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-zinc-400">
                No epics on this board yet
              </li>
            ) : filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-xs text-zinc-400">No matches</li>
            ) : (
              filtered.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(t.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                      value === t.id ? "bg-violet-50 dark:bg-violet-900/20" : ""
                    }`}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: epicColors.accent }}
                    />
                    <span className="font-mono text-[10px] text-zinc-400 shrink-0 w-14 truncate">
                      {t.ticketNumber}
                    </span>
                    <span className="truncate text-zinc-900 dark:text-zinc-100">
                      {t.title}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
