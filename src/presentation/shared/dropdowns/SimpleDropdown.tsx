"use client";

import React, { useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useClickOutside } from "@/presentation/shared/hooks/useClickOutside";

export interface DropdownOption {
  label: string;
  value: string;
  dot?: string;
  meta?: string;
}

interface SimpleDropdownProps {
  value: string;
  options: DropdownOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * Generic single-select dropdown matching the Orion design system.
 * Use for Story Points, Priority, Hierarchy, Column, Fix Version, etc.
 */
export function SimpleDropdown({
  value,
  options,
  onChange,
  placeholder = "Select...",
  className = "",
}: SimpleDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, open, () => setOpen(false));

  const selected = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-500"
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.dot && (
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: selected.dot }}
            />
          )}
          <span className="truncate">{selected?.label ?? placeholder}</span>
          {selected?.meta && (
            <span className="shrink-0 text-[11px] text-zinc-500">{selected.meta}</span>
          )}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-zinc-500 transition-transform duration-150 dark:text-zinc-400 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-52 overflow-y-auto rounded-md border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-950">
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-semibold transition-colors ${
                  isActive
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-50"
                }`}
              >
                {opt.dot && (
                  <span
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: opt.dot }}
                  />
                )}
                <span className="flex-1">{opt.label}</span>
                {opt.meta && <span className="text-[10px] text-zinc-500">{opt.meta}</span>}
                {isActive && <Check size={11} className="shrink-0 text-zinc-500 dark:text-zinc-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
