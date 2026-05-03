"use client";

import React, { memo, useRef, useState } from "react";
import { Calendar, X } from "lucide-react";
import type { ReleaseVersion } from "@/domain/analyst";

interface VersionPanelProps {
  releaseVersions: ReleaseVersion[];
  onCreateVersion: (name: string, releaseDate: string) => void;
  onDeleteVersion: (versionId: string) => void;
}

function VersionPanelImpl({ releaseVersions, onCreateVersion, onDeleteVersion }: VersionPanelProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const dateInputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    dateInputRef.current?.showPicker?.();
    dateInputRef.current?.focus();
  }

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:border-zinc-500 transition-colors"
        >
          {open ? "Close Version Manager" : "Manage Versions"}
        </button>
        {!open && releaseVersions.length > 0 && (
          <span className="text-[11px] text-zinc-500">
            {releaseVersions.length} version{releaseVersions.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {releaseVersions.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {releaseVersions.map((v) => (
                <div
                  key={v.id}
                  className="group relative rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => onDeleteVersion(v.id)}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-red-500 dark:hover:text-red-400 group-hover:flex"
                  >
                    <X size={9} />
                  </button>
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{v.name}</p>
                  <p className="text-[10px] text-zinc-500">{v.releaseDate}</p>
                </div>
              ))}
            </div>
          )}

          {/* Form — stacks vertically on mobile, row on md+ */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Version name (e.g. v1.4.0)"
              className="flex-1 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />

            {/*
             * Date field: a custom-styled wrapper that makes the invisible native
             * <input type="date"> fill its container, with a calendar icon on the
             * right. Tapping anywhere in the box (icon included) opens the native
             * picker, which is the most reliable cross-browser experience on mobile.
             */}
            <div
              onClick={openPicker}
              className="relative flex items-center rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 cursor-pointer md:w-44 gap-2"
            >
              <Calendar size={13} className="text-zinc-400 shrink-0 pointer-events-none" />
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 min-w-0 bg-transparent text-xs text-zinc-900 dark:text-zinc-200 outline-none cursor-pointer appearance-none"
                style={{ colorScheme: "auto" }}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                if (!name.trim()) return;
                onCreateVersion(name.trim(), date);
                setName("");
                setDate("");
              }}
              disabled={!name.trim()}
              className="rounded-md border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:border-zinc-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              Add Version
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export const VersionPanel = memo(VersionPanelImpl);
