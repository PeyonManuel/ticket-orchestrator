"use client";

import React from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation } from "@apollo/client/react";
import {
  GET_EPIC_DRAFTS,
  GET_COMMITTED_EPICS,
  CREATE_EPIC_DRAFT,
  DELETE_EPIC_DRAFT,
} from "@/infrastructure/graphql/operations";
import type {
  EpicDraft,
  EpicDraftIndexEntry,
  EpicSnapshotIndexEntry,
  OrchestratorPhase,
} from "@/domain/orchestrator/types";

const PHASE_LABEL: Record<OrchestratorPhase, string> = {
  phase1Brainstorming: "Discovery",
  phase2Structuring: "Blueprint",
  phase3Refining: "Deep Dive",
  phase4SprintPlanning: "Sprint Plan",
  committing: "Committing…",
  committed: "Committed",
  abandoned: "Abandoned",
};

const PHASE_COLOR: Record<OrchestratorPhase, string> = {
  phase1Brainstorming: "bg-indigo-500",
  phase2Structuring: "bg-violet-500",
  phase3Refining: "bg-fuchsia-500",
  phase4SprintPlanning: "bg-cyan-500",
  committing: "bg-amber-500",
  committed: "bg-emerald-500",
  abandoned: "bg-zinc-400",
};

interface Props {
  boardId: string;
  onSelect: (draftId: string) => void;
  onOpenCommittedEpic: (snapshotId: string) => void;
  onClose: () => void;
}

export function DraftPicker({ boardId, onSelect, onOpenCommittedEpic, onClose }: Props) {
  const { data, loading, refetch } = useQuery<{ epicDrafts: EpicDraftIndexEntry[] }>(
    GET_EPIC_DRAFTS,
    { variables: { boardId }, fetchPolicy: "cache-and-network" },
  );
  const { data: committedData, loading: committedLoading } = useQuery<{
    committedEpics: EpicSnapshotIndexEntry[];
  }>(GET_COMMITTED_EPICS, {
    variables: { boardId },
    fetchPolicy: "cache-and-network",
  });
  const [createDraft, { loading: creating }] = useMutation<{
    createEpicDraft: EpicDraft;
  }>(CREATE_EPIC_DRAFT);
  const [deleteDraft] = useMutation(DELETE_EPIC_DRAFT);

  // Committed drafts are now represented by their snapshot in the dedicated
  // "Committed" section — keep History to abandoned drafts only.
  const drafts = (data?.epicDrafts ?? []).filter(
    (d) => d.phase !== "committed" && d.phase !== "abandoned",
  );
  const archived = (data?.epicDrafts ?? []).filter(
    (d) => d.phase === "abandoned",
  );
  const committed = committedData?.committedEpics ?? [];

  const handleNew = async () => {
    const result = await createDraft({
      variables: { boardId },
      refetchQueries: [{ query: GET_EPIC_DRAFTS, variables: { boardId } }],
    });
    const created = result.data?.createEpicDraft;
    if (created) onSelect(created.id);
  };

  const handleDelete = async (id: string) => {
    await deleteDraft({
      variables: { id },
      refetchQueries: [{ query: GET_EPIC_DRAFTS, variables: { boardId } }],
    });
    refetch();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-sm font-semibold">
            ◐
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              AI Orchestrator
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Draft a new Epic, or resume one you started earlier.
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
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleNew}
            disabled={creating}
            className="w-full rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700/50 hover:border-indigo-500 dark:hover:border-indigo-500 px-5 py-6 text-left transition-colors group disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white text-lg shrink-0 group-hover:scale-105 transition-transform">
                +
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Start a new Epic
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {creating
                    ? "Creating…"
                    : "Brainstorm with the Analyst, then plan and refine."}
                </p>
              </div>
            </div>
          </button>

          {loading && (
            <p className="mt-6 text-xs text-zinc-400 text-center">Loading drafts…</p>
          )}

          {!loading && drafts.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">
                In progress
              </h2>
              <div className="space-y-2">
                {drafts.map((d) => (
                  <DraftRow
                    key={d.id}
                    entry={d}
                    onSelect={onSelect}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </div>
          )}

          {!committedLoading && committed.length > 0 && (
            <div className="mt-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3">
                Committed Epics · {committed.length}
              </h2>
              <div className="space-y-2">
                {committed.map((e) => (
                  <CommittedEpicRow
                    key={e.id}
                    entry={e}
                    onOpen={onOpenCommittedEpic}
                  />
                ))}
              </div>
            </div>
          )}

          {!loading && archived.length > 0 && (
            <details className="mt-8">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-3 hover:text-zinc-700 dark:hover:text-zinc-200">
                History · {archived.length}
              </summary>
              <div className="space-y-2 mt-3">
                {archived.map((d) => (
                  <DraftRow
                    key={d.id}
                    entry={d}
                    onSelect={onSelect}
                    onDelete={handleDelete}
                    muted
                  />
                ))}
              </div>
            </details>
          )}

          {!loading && drafts.length === 0 && archived.length === 0 && committed.length === 0 && (
            <p className="mt-8 text-xs text-zinc-400 text-center">
              No drafts yet. Start your first Epic above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftRow({
  entry,
  onSelect,
  onDelete,
  muted = false,
}: {
  entry: EpicDraftIndexEntry;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  muted?: boolean;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => onSelect(entry.id)}
          className="flex-1 text-left min-w-0"
        >
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
            {entry.title}
          </p>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span className={`h-1.5 w-1.5 rounded-full ${PHASE_COLOR[entry.phase]}`} />
            <span>{PHASE_LABEL[entry.phase]}</span>
            <span>·</span>
            <span>{relativeTime(entry.updatedAt)}</span>
          </div>
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          aria-label="Delete draft"
          className="opacity-0 group-hover:opacity-100 h-7 w-7 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-all"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}

function CommittedEpicRow({
  entry,
  onOpen,
}: {
  entry: EpicSnapshotIndexEntry;
  onOpen: (snapshotId: string) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="group rounded-lg border border-emerald-200/60 dark:border-emerald-900/30 bg-emerald-50/40 dark:bg-emerald-950/10 px-4 py-3 hover:border-emerald-400 dark:hover:border-emerald-700 transition-colors"
    >
      <button
        onClick={() => onOpen(entry.id)}
        className="w-full text-left min-w-0"
      >
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
          {entry.title}
        </p>
        <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Committed</span>
          <span>·</span>
          <span>
            {entry.ticketCount} ticket{entry.ticketCount === 1 ? "" : "s"}
          </span>
          <span>·</span>
          <span>{relativeTime(entry.createdAt)}</span>
        </div>
      </button>
    </motion.div>
  );
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
