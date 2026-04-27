"use client";

import React, { memo, useState } from "react";
import type { BoardColumn } from "@/domain/analyst";
import { StatesTagInput } from "@/presentation/shared/inputs/StatesTagInput";

interface ColumnFormProps {
  activeBoardId: string | null;
  boardColumns: BoardColumn[];
  columnCount: number;
  onAddColumn: (boardId: string, name: string, states: string[]) => void;
}

function ColumnFormImpl({ activeBoardId, boardColumns, columnCount, onAddColumn }: ColumnFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [states, setStates] = useState<string[]>([]);

  const trimmed = name.trim();
  const nameExists =
    trimmed.length > 0 &&
    boardColumns.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="rounded-md border border-indigo-400/40 px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-200 hover:border-indigo-400 dark:hover:border-indigo-300"
        >
          {open ? "Close Column Form" : "Add Column"}
        </button>
        <span className="text-[11px] text-zinc-500">Columns: {columnCount}/6</span>
      </div>
      {open && (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Column name"
              className={`w-full rounded-md border bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-200 md:w-1/2 ${
                nameExists ? "border-amber-500/60" : "border-zinc-300 dark:border-zinc-700"
              }`}
            />
            {nameExists && (
              <p className="mt-1 text-[10px] text-amber-500">
                A column named &quot;{trimmed}&quot; already exists.
              </p>
            )}
          </div>
          <div>
            <p className="mb-1 text-[10px] text-zinc-500">
              Workflow states — type and press Enter to add
            </p>
            <StatesTagInput value={states} onChange={setStates} />
          </div>
          <button
            onClick={() => {
              if (!activeBoardId || !trimmed || nameExists) return;
              onAddColumn(activeBoardId, trimmed, states);
              setName("");
              setStates([]);
              setOpen(false);
            }}
            disabled={columnCount >= 6 || nameExists}
            className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:border-zinc-500 disabled:opacity-40"
          >
            Save Column
          </button>
        </div>
      )}
    </div>
  );
}

export const ColumnForm = memo(ColumnFormImpl);
