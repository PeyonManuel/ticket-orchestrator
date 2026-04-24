"use client";

import React, { useRef, useState } from "react";
import { X } from "lucide-react";

interface StatesTagInputProps {
  value: string[];
  onChange: (states: string[]) => void;
  placeholder?: string;
}

/**
 * Tag-based input for workflow states. Existing states render as removable
 * chips. Typing a unique value and pressing Enter/comma adds it as a new tag.
 */
export function StatesTagInput({ value, onChange, placeholder = "Type a state and press Enter…" }: StatesTagInputProps) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addState = (raw: string) => {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed || value.includes(trimmed)) return;
    onChange([...value, trimmed]);
    setInputValue("");
  };

  const removeState = (state: string) => {
    onChange(value.filter((s) => s !== state));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addState(inputValue);
    } else if (e.key === "Backspace" && inputValue === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const isDuplicate = inputValue.trim() !== "" && value.includes(inputValue.trim().toLowerCase());
  const isNew = inputValue.trim() !== "" && !isDuplicate;

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="flex min-h-[34px] w-full flex-wrap items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200 cursor-text transition-colors focus-within:border-indigo-500/60"
    >
      {value.map((state) => (
        <span
          key={state}
          className="flex items-center gap-1 rounded bg-zinc-800 pl-2 pr-1 py-0.5 font-medium text-zinc-200"
        >
          {state}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); removeState(state); }}
            className="text-zinc-500 hover:text-red-400 transition-colors"
          >
            <X size={10} />
          </button>
        </span>
      ))}
      <div className="relative flex-1 min-w-[120px]">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (inputValue.trim()) addState(inputValue); }}
          placeholder={value.length === 0 ? placeholder : ""}
          className="w-full bg-transparent outline-none placeholder:text-zinc-600"
        />
        {isNew && (
          <span className="absolute right-0 top-0 text-[10px] text-indigo-400 pointer-events-none">
            press Enter to add
          </span>
        )}
        {isDuplicate && (
          <span className="absolute right-0 top-0 text-[10px] text-amber-500 pointer-events-none">
            already exists
          </span>
        )}
      </div>
    </div>
  );
}
