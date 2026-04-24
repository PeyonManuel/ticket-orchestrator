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

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((p) => !p)}
          className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500"
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
                  className="group relative rounded-md border border-zinc-700 bg-zinc-900/60 px-2.5 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => onDeleteVersion(v.id)}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-red-400 group-hover:flex"
                  >
                    <X size={9} />
                  </button>
                  <p className="text-xs font-semibold text-zinc-100">{v.name}</p>
                  <p className="text-[10px] text-zinc-500">{v.releaseDate}</p>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Version name (e.g. v1.4.0)"
              className="rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
            />
            <div className="relative">
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-full w-40 cursor-pointer rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-200 [color-scheme:dark]"
              />
              <button
                type="button"
                onClick={() => dateInputRef.current?.showPicker?.()}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500"
              >
                <Calendar size={13} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!name.trim()) return;
                onCreateVersion(name.trim(), date);
                setName("");
                setDate("");
              }}
              className="rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-300 hover:border-zinc-500"
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
