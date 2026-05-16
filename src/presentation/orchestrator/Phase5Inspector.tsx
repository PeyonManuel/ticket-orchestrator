"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useBoardData } from "@/presentation/board/BoardContext";
import { useInspector } from "./useInspector";
import type { DriftReport } from "@/domain/analyst";
import type { EpicMemory, InspectorTurn } from "@/domain/orchestrator/types";
import { ProseTurn } from "./shared/ProseTurn";

interface Props {
  snapshotId: string;
  onClose: () => void;
  onBackToPicker: () => void;
}

function uid(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function Phase5Inspector({ snapshotId, onClose, onBackToPicker }: Props) {
  const { allTickets, boardColumns, orgMembers } = useBoardData();
  const memberById = React.useMemo(
    () => new Map(orgMembers.map((m) => [m.userId, m] as const)),
    [orgMembers],
  );
  const { state, send } = useInspector({
    epicSnapshotId: snapshotId,
    allTickets,
    columns: boardColumns,
  });

  if (state.matches("loadingContext")) {
    return (
      <Shell onClose={onClose} onBackToPicker={onBackToPicker} title="Loading Epic…">
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-zinc-400">Loading committed Epic…</p>
        </div>
      </Shell>
    );
  }

  if (state.matches("failed")) {
    return (
      <Shell onClose={onClose} onBackToPicker={onBackToPicker} title="Inspector">
        <div className="flex h-full flex-col items-center justify-center gap-3">
          <p className="text-sm text-zinc-500">
            {state.context.error ?? "Couldn't load this Epic."}
          </p>
          <button
            onClick={() => send({ type: "RETRY" })}
            className="rounded-md bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
          >
            Retry
          </button>
        </div>
      </Shell>
    );
  }

  const { snapshot, drift, transcript, memories } = state.context;
  if (!snapshot || !drift) {
    return (
      <Shell onClose={onClose} onBackToPicker={onBackToPicker} title="Inspector">
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-zinc-500">No snapshot loaded.</p>
        </div>
      </Shell>
    );
  }

  const title = snapshot.backlog?.epicTitle ?? "Untitled Epic";
  const subtitle = `Committed ${new Date(snapshot.createdAt).toLocaleDateString()}`;
  const isThinking = state.matches("awaitingInspector");

  const handleSend = (text: string) => {
    send({
      type: "SEND_MESSAGE",
      text,
      now: new Date().toISOString(),
      turnId: uid("turn"),
    });
  };

  return (
    <Shell
      onClose={onClose}
      onBackToPicker={onBackToPicker}
      title={title}
      subtitle={subtitle}
    >
      <div className="flex h-full min-h-0">
        <div className="flex-1 flex flex-col min-w-0">
          <ChatPane
            transcript={transcript}
            drift={drift}
            isThinking={isThinking}
            error={state.context.error}
            onSend={handleSend}
            resolveAuthor={(turn) => {
              const name =
                turn.authorName ??
                (turn.authorId ? memberById.get(turn.authorId)?.fullName : null);
              return name ?? null;
            }}
          />
        </div>
        <MemoriesSidebar memories={memories} />
      </div>
    </Shell>
  );
}

// ── Shell ────────────────────────────────────────────────────────────

function Shell({
  title,
  subtitle,
  onClose,
  onBackToPicker,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  onBackToPicker: () => void;
  children: React.ReactNode;
}) {
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
            {subtitle && (
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{subtitle}</p>
            )}
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
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

// ── Chat pane ───────────────────────────────────────────────────────

function ChatPane({
  transcript,
  drift,
  isThinking,
  error,
  onSend,
  resolveAuthor,
}: {
  transcript: InspectorTurn[];
  drift: DriftReport;
  isThinking: boolean;
  error: string | null;
  onSend: (text: string) => void;
  resolveAuthor: (turn: InspectorTurn) => string | null;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript.length, isThinking]);

  // Auto-scroll on mount (when navigating back to this phase).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || isThinking) return;
    setDraft("");
    onSend(text);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          <DriftCard drift={drift} />

          {transcript.length === 0 && !isThinking && (
            <div className="text-center pt-6">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Ask me anything about this Epic — what changed, how it's tracking,
                or whether the original plan still holds.
              </p>
            </div>
          )}

          <AnimatePresence initial={false}>
            {transcript.map((turn) => {
              const authorName = turn.role === "user" ? resolveAuthor(turn) : null;
              return (
                <motion.div
                  key={turn.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                  className={`flex flex-col gap-1 ${turn.role === "user" ? "items-end" : "items-start"}`}
                >
                  {authorName && (
                    <p className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400 px-2">
                      {authorName}
                    </p>
                  )}
                  {turn.role === "user" ? (
                    <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap bg-indigo-500 text-white">
                      {turn.text}
                    </div>
                  ) : (
                    <ProseTurn text={turn.text} className="max-w-[80%] text-sm leading-relaxed" />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {isThinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 px-4 py-3 flex items-center gap-1.5">
                <Dot delay={0} />
                <Dot delay={0.15} />
                <Dot delay={0.3} />
              </div>
            </div>
          )}

          {error && !isThinking && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 px-3 py-2 text-xs text-rose-800 dark:text-rose-300">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder={isThinking ? "Inspector is thinking — keep typing your next message…" : "Ask about this Epic…"}
              className="flex-1 resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
              style={{ minHeight: "42px", maxHeight: "160px" }}
            />
            <button
              onClick={handleSend}
              disabled={isThinking || !draft.trim()}
              className="h-[42px] rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:text-zinc-500 px-4 text-sm font-medium text-white transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Drift card ──────────────────────────────────────────────────────

function DriftCard({ drift }: { drift: DriftReport }) {
  const { hasDrift, completionPercent, addedTickets, removedTickets, changedTickets } = drift;
  const total =
    addedTickets.length + removedTickets.length + changedTickets.length;

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Plan vs. live
        </p>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {completionPercent}% complete
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Pill label="Added" count={addedTickets.length} tone="emerald" />
        <Pill label="Removed" count={removedTickets.length} tone="rose" />
        <Pill label="Changed" count={changedTickets.length} tone="amber" />
      </div>
      {!hasDrift && total === 0 && (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          No drift detected — live tickets match the committed plan.
        </p>
      )}
    </div>
  );
}

function Pill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "emerald" | "rose" | "amber";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300"
      : tone === "rose"
        ? "border-rose-200 dark:border-rose-900/40 bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300"
        : "border-amber-200 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300";
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
        {label}
      </p>
      <p className="text-base font-semibold mt-0.5">{count}</p>
    </div>
  );
}

// ── Memories sidebar ────────────────────────────────────────────────

function MemoriesSidebar({ memories }: { memories: EpicMemory[] }) {
  return (
    <aside className="hidden md:flex w-80 shrink-0 flex-col border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 min-h-0">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Memories ({memories.length})
        </p>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
          Insights the Inspector saved from prior turns.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {memories.length === 0 ? (
          <p className="text-xs text-zinc-400 dark:text-zinc-600">
            No memories yet. Say things like &ldquo;remember this&rdquo; and the
            Inspector will save them.
          </p>
        ) : (
          memories.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2"
            >
              <p className="text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap">
                {m.content}
              </p>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1">
                  {m.tags.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="text-[10px] rounded bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-1.5 py-0.5 text-zinc-600 dark:text-zinc-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-600 shrink-0">
                  {new Date(m.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <motion.span
      animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay }}
      className="block h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500"
    />
  );
}
