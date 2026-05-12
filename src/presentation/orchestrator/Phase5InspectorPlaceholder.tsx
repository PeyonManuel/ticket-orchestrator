"use client";

import React, { useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { GET_EPIC_SNAPSHOT_BY_ID } from "@/infrastructure/graphql/operations";
import type { EpicSnapshot } from "@/domain/orchestrator/types";

interface Props {
  snapshotId: string;
  onClose: () => void;
  onBackToPicker: () => void;
}

/**
 * Read-only preview of a committed Epic, shown when the PO clicks a card in
 * the Committed Epics section. Acts as Phase 5's landing page until Slice E
 * lands the real Inspector chat machine. Wired to the rich `EpicSnapshot`
 * so the data flow is exercised end-to-end.
 */
export function Phase5InspectorPlaceholder({
  snapshotId,
  onClose,
  onBackToPicker,
}: Props) {
  const { data, loading, error } = useQuery<{ epicSnapshotById: EpicSnapshot | null }>(
    GET_EPIC_SNAPSHOT_BY_ID,
    { variables: { id: snapshotId }, fetchPolicy: "cache-and-network" },
  );

  const snapshot = data?.epicSnapshotById ?? null;

  const totalPoints = useMemo(() => {
    if (!snapshot?.backlog) return 0;
    return snapshot.backlog.tickets.reduce(
      (sum, t) => sum + (t.storyPoints ?? 0),
      0,
    );
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-400">Loading committed Epic…</p>
      </div>
    );
  }
  if (error || !snapshot) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-500">
          Couldn&apos;t load this committed Epic.
        </p>
        <button
          onClick={onBackToPicker}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          ← Back to drafts
        </button>
      </div>
    );
  }

  const title = snapshot.backlog?.epicTitle ?? "Untitled Epic";
  const description = snapshot.backlog?.epicDescription ?? "";
  const tickets = snapshot.backlog?.tickets ?? [];

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBackToPicker}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Drafts
          </button>
          <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
              {title}
            </h1>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Committed {new Date(snapshot.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="h-8 w-8 rounded-md text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center justify-center"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20 px-4 py-3">
            <p className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
              AI Inspector — coming soon
            </p>
            <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80 mt-1">
              Chat over the full Epic history + live ticket state lands in the
              next slice. For now, here&apos;s a read-only summary of what was
              committed.
            </p>
          </div>

          {description && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
                Description
              </h2>
              <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                {description}
              </p>
            </section>
          )}

          <section className="grid grid-cols-3 gap-3">
            <Stat label="Tickets" value={String(snapshot.ticketIds.length)} />
            <Stat label="Story points" value={String(totalPoints)} />
            <Stat
              label="Sprints planned"
              value={String(snapshot.planningSprints.length)}
            />
          </section>

          {snapshot.planningMembers.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
                Team
              </h2>
              <div className="flex flex-wrap gap-2">
                {snapshot.planningMembers.map((m) => (
                  <span
                    key={m.userId}
                    className="text-[11px] rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-2.5 py-1 text-zinc-700 dark:text-zinc-300"
                  >
                    {m.fullName} · {m.role}
                  </span>
                ))}
              </div>
            </section>
          )}

          {tickets.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
                Tickets ({tickets.length})
              </h2>
              <div className="space-y-2">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {t.title}
                      </p>
                      {t.storyPoints != null && (
                        <span className="text-[11px] rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-zinc-600 dark:text-zinc-300 shrink-0">
                          {t.storyPoints} SP
                        </span>
                      )}
                    </div>
                    {t.oneLiner && (
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        {t.oneLiner}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-1">
        {value}
      </p>
    </div>
  );
}
