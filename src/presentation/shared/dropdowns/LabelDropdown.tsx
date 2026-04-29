"use client";

import React, { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { useClickOutside } from "@/presentation/shared/hooks/useClickOutside";

interface LabelDropdownProps {
  value: string;
  labels: string[];
  onChange: (value: string) => void;
  onAddLabel: (label: string) => void;
}

/**
 * Searchable label dropdown. When the typed query doesn't match any known
 * label, offers a "Create '...'" option that appends the new label globally.
 */
export function LabelDropdown({ value, labels, onChange, onAddLabel }: LabelDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [prevOpen, setPrevOpen] = useState(open);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useClickOutside(containerRef, open, () => setOpen(false));

  // Adjust state while rendering when `open` toggles (React docs pattern)
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setSearch("");
  }

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  const trimmed = search.trim();
  const filtered = trimmed
    ? labels.filter((l) => l.toLowerCase().includes(trimmed.toLowerCase()))
    : labels;
  const hasExactMatch = labels.some((l) => l.toLowerCase() === trimmed.toLowerCase());
  const canCreate = trimmed.length > 0 && !hasExactMatch;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500"
      >
        <span className="truncate">{value || "Select label"}</span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-zinc-500 transition-transform duration-150 dark:text-zinc-400 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 rounded-md border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
          <div className="border-b border-zinc-200 p-1.5 dark:border-zinc-800">
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search labels..."
              className="w-full rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
          </div>
          <div className="max-h-44 overflow-y-auto p-1">
            {filtered.map((label) => {
              const isActive = label === value;
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    onChange(label);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                    isActive
                      ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-50"
                  }`}
                >
                  <span className="flex-1">{label}</span>
                  {isActive && <Check size={11} className="shrink-0 text-zinc-500 dark:text-zinc-400" />}
                </button>
              );
            })}
            {!filtered.length && !canCreate && (
              <p className="px-2 py-2 text-xs text-zinc-500">No labels found.</p>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => {
                  const newLabel = trimmed.toLowerCase();
                  onAddLabel(newLabel);
                  onChange(newLabel);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-500/10 dark:text-indigo-300"
              >
                <Plus size={11} />
                Create &quot;{trimmed}&quot;
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
