"use client";

import React, { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  BrainstormTurn,
  EpicDraft,
  ProposalLabel,
  TicketProposal,
} from "@/domain/orchestrator/types";
import type { OrchestratorEvent } from "@/domain/orchestrator";

interface Props {
  draft: EpicDraft;
  isGenerating: boolean;
  isAwaitingBlueprintReply: boolean;
  send: (event: OrchestratorEvent) => void;
}

const LABELS: ProposalLabel[] = [
  "frontend", "backend", "api", "qa", "ux",
  "ai", "infra", "devops", "security", "observability",
];

const LABEL_COLORS: Record<ProposalLabel, string> = {
  frontend: "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  backend: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  api: "bg-violet-100 text-violet-800 dark:bg-violet-950/40 dark:text-violet-300",
  qa: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  ux: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300",
  ai: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
  infra: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
  devops: "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300",
  security: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300",
  observability: "bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300",
};

function uid(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function Phase2BulkList({ draft, isGenerating, isAwaitingBlueprintReply, send }: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const backlog = draft.backlog;

  if (isGenerating || !backlog) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 animate-pulse" />
        <div className="text-center">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            Architect is drafting the backlog…
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            This usually takes a moment.
          </p>
        </div>
      </div>
    );
  }

  const now = () => new Date().toISOString();

  return (
    <div className="flex h-full">
      {/* ── Left: bulk edit ───────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-zinc-200 dark:border-zinc-800">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-2xl mx-auto">
            {/* Epic header card */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 mb-6">
              <input
                value={backlog.epicTitle}
                onChange={(e) =>
                  send({ type: "EDIT_EPIC_TITLE", title: e.target.value, now: now() })
                }
                className="w-full bg-transparent text-xl font-semibold text-zinc-900 dark:text-zinc-100 focus:outline-none"
                placeholder="Epic title"
              />
              <textarea
                value={backlog.epicDescription}
                onChange={(e) =>
                  send({
                    type: "EDIT_EPIC_DESCRIPTION",
                    description: e.target.value,
                    now: now(),
                  })
                }
                rows={2}
                className="mt-2 w-full bg-transparent text-sm text-zinc-600 dark:text-zinc-400 focus:outline-none resize-none"
                placeholder="One-paragraph description"
              />

              {draft.brainstormSummary && (
                <button
                  onClick={() => setSummaryOpen((v) => !v)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  <span className={`transition-transform ${summaryOpen ? "rotate-90" : ""}`}>
                    ▸
                  </span>
                  Show brainstorm summary
                </button>
              )}

              <AnimatePresence initial={false}>
                {summaryOpen && draft.brainstormSummary && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <div>
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                          Goals
                        </p>
                        <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
                          {draft.brainstormSummary.goals.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                          Out of scope
                        </p>
                        <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
                          {draft.brainstormSummary.outOfScope.map((g, i) => (
                            <li key={i}>{g}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tickets list */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Backlog · {backlog.tickets.length} tickets
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Edit titles, drop unwanted tickets, reorder.
              </p>
            </div>

            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {backlog.tickets.map((t, idx) => (
                  <TicketRow
                    key={t.id}
                    ticket={t}
                    index={idx}
                    total={backlog.tickets.length}
                    onPatch={(patch) =>
                      send({ type: "PATCH_TICKET", ticketId: t.id, patch, now: now() })
                    }
                    onRemove={() =>
                      send({ type: "REMOVE_TICKET", ticketId: t.id, now: now() })
                    }
                    onMove={(direction) => {
                      const next = backlog.tickets.slice();
                      const target = idx + direction;
                      if (target < 0 || target >= next.length) return;
                      [next[idx], next[target]] = [next[target], next[idx]];
                      send({
                        type: "REORDER_TICKETS",
                        orderedIds: next.map((x) => x.id),
                        now: now(),
                      });
                    }}
                  />
                ))}
              </AnimatePresence>

              <button
                onClick={() =>
                  send({
                    type: "ADD_TICKET",
                    now: now(),
                    ticket: {
                      id: uid("prop"),
                      title: "New ticket",
                      label: "frontend",
                      hierarchyType: "task",
                    },
                  })
                }
                className="w-full rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hover:border-indigo-400 hover:text-indigo-500 dark:hover:border-indigo-600 dark:hover:text-indigo-400 transition-colors"
              >
                + Add ticket
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <button
              onClick={() => send({ type: "BACK_TO_BRAINSTORM", now: now() })}
              className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              ← Back to brainstorm
            </button>
            <button
              onClick={() => send({ type: "ADVANCE_TO_REFINE", now: now() })}
              disabled={backlog.tickets.length === 0}
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-700 dark:disabled:to-zinc-700 px-4 py-2 text-sm font-semibold text-white disabled:text-zinc-500 transition-all"
            >
              Refine each ticket →
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: blueprint chat ─────────────────────────────────── */}
      <BlueprintChatPanel
        transcript={draft.blueprintTranscript}
        isThinking={isAwaitingBlueprintReply}
        onSend={(text) =>
          send({
            type: "BLUEPRINT_USER_MESSAGE",
            text,
            now: new Date().toISOString(),
            turnId: uid("bt"),
          })
        }
      />
    </div>
  );
}

function BlueprintChatPanel({
  transcript,
  isThinking,
  onSend,
}: {
  transcript: BrainstormTurn[];
  isThinking: boolean;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isThinking) return;
    onSend(text);
    setInput("");
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  return (
    <div className="w-80 xl:w-96 shrink-0 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Blueprint Assistant</p>
        <p className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-0.5">
          Ask about structure, scope, or ticket sizing
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {transcript.length === 0 && !isThinking && (
          <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center mt-8">
            Ask the AI about the backlog structure or request changes.
          </p>
        )}

        {transcript.map((turn) => (
          <div
            key={turn.id}
            className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                turn.role === "user"
                  ? "bg-indigo-500 text-white rounded-br-sm"
                  : "bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 rounded-bl-sm"
              }`}
            >
              {turn.text}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-2xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            disabled={isThinking}
            placeholder="Ask about the backlog…"
            className="flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-400 disabled:opacity-50 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="h-9 w-9 shrink-0 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 text-white transition-colors flex items-center justify-center"
            aria-label="Send"
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  index,
  total,
  onPatch,
  onRemove,
  onMove,
}: {
  ticket: TicketProposal;
  index: number;
  total: number;
  onPatch: (patch: Partial<TicketProposal>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="w-6 shrink-0 text-xs tabular-nums text-zinc-400 dark:text-zinc-600">
          {index + 1}
        </span>
        <span
          className={`shrink-0 inline-flex h-5 px-1.5 rounded items-center text-[10px] font-medium uppercase tracking-wide ${
            ticket.hierarchyType === "story"
              ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          {ticket.hierarchyType}
        </span>
        <input
          value={ticket.title}
          onChange={(e) => onPatch({ title: e.target.value })}
          className="flex-1 min-w-0 bg-transparent text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
        />
        <select
          value={ticket.label}
          onChange={(e) => onPatch({ label: e.target.value as ProposalLabel })}
          className={`shrink-0 text-[10px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 ${LABEL_COLORS[ticket.label]} cursor-pointer focus:outline-none`}
        >
          {LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            className="h-7 w-7 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            ↑
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Move down"
            className="h-7 w-7 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            aria-label="Remove ticket"
            className="h-7 w-7 rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
      {ticket.oneLiner && (
        <p className="ml-8 mt-1 text-xs text-zinc-500 dark:text-zinc-400 truncate">
          {ticket.oneLiner}
        </p>
      )}
    </motion.div>
  );
}
