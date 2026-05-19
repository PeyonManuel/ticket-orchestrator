"use client";

import { memo, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  BlueprintMutation,
  BrainstormTurn,
  EpicDraft,
  LinkKind,
  ProposalDependency,
  ProposalLabel,
  ProposalId,
  TicketProposal,
} from "@/domain/orchestrator/types";
import type { OrchestratorEvent } from "@/domain/orchestrator";
import { detectCycles } from "@/domain/orchestrator/policies/dependencyPolicy";
import { BackNavigationModal } from "./BackNavigationModal";
import { DependencyGraphView } from "./DependencyGraphView";
import { ProseTurn } from "./shared/ProseTurn";
import { ErrorMessage } from "./shared/ErrorMessage";

interface Props {
  draft: EpicDraft;
  isGenerating: boolean;
  isAwaitingBlueprintReply: boolean;
  aiMode: "execute" | "confirm";
  aiTouchedTicketIds: ProposalId[];
  pendingBlueprintMutations: BlueprintMutation[];
  error?: string | null;
  send: (event: OrchestratorEvent) => void;
}

const LABELS: ProposalLabel[] = ["developer", "ux", "qa", "po"];
const KINDS: LinkKind[] = ["blockedBy", "relatedTo", "duplicates"];

const KIND_LABEL: Record<LinkKind, string> = {
  blockedBy: "blocked by",
  relatedTo: "related to",
  duplicates: "duplicates",
};
const KIND_COLOR: Record<LinkKind, string> = {
  blockedBy: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300",
  relatedTo: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
  duplicates: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
};

const LABEL_COLORS: Record<ProposalLabel, string> = {
  developer: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  ux: "bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-300",
  qa: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300",
  po: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300",
};

function uid(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function Phase2BulkList({
  draft,
  isGenerating,
  isAwaitingBlueprintReply,
  aiMode,
  aiTouchedTicketIds,
  pendingBlueprintMutations,
  error,
  send,
}: Props) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [backModalOpen, setBackModalOpen] = useState(false);
  const [view, setView] = useState<"list" | "graph">("list");
  const backlog = draft.backlog;

  // Clear AI-touch highlights 2s after they appear so the pulse animation
  // fires once per round-trip and stops accumulating across replies.
  useEffect(() => {
    if (aiTouchedTicketIds.length === 0) return;
    const t = setTimeout(() => send({ type: "CLEAR_AI_TOUCH" }), 2000);
    return () => clearTimeout(t);
  }, [aiTouchedTicketIds, send]);

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
                    <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        Goals
                      </p>
                      <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
                        {draft.brainstormSummary.goals.map((g, i) => (
                          <li key={i}>{g}</li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Tickets header + view toggle */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Backlog · {backlog.tickets.length} tickets
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Redraft the entire backlog? This discards the current tickets and asks the Architect for a new draft, taking your blueprint chat feedback into account.",
                      )
                    ) {
                      send({ type: "REDRAFT_BACKLOG", now: now() });
                    }
                  }}
                  className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1"
                  title="Discard this draft and ask the Architect for a new one"
                >
                  ↻ Redraft
                </button>
                <span className="h-3 w-px bg-zinc-200 dark:bg-zinc-700" />
                <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs">
                  <button
                    onClick={() => setView("list")}
                    className={`px-2.5 py-1 transition-colors ${view === "list" ? "bg-indigo-500 text-white" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                  >
                    List
                  </button>
                  <button
                    onClick={() => setView("graph")}
                    className={`px-2.5 py-1 transition-colors border-l border-zinc-200 dark:border-zinc-700 ${view === "graph" ? "bg-indigo-500 text-white" : "text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                  >
                    Graph
                  </button>
                </div>
              </div>
            </div>

            {view === "graph" ? (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden" style={{ height: 400 }}>
                <DependencyGraphView tickets={backlog.tickets} />
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {backlog.tickets.map((t, idx) => (
                    <TicketRow
                      key={t.id}
                      ticket={t}
                      index={idx}
                      total={backlog.tickets.length}
                      allTickets={backlog.tickets}
                      aiTouched={aiTouchedTicketIds.includes(t.id)}
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
                        label: "developer",
                        hierarchyType: "task",
                      },
                    })
                  }
                  className="w-full rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400 hover:border-indigo-400 hover:text-indigo-500 dark:hover:border-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  + Add ticket
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <button
              onClick={() => setBackModalOpen(true)}
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
        aiMode={aiMode}
        pendingMutations={pendingBlueprintMutations}
        backlog={backlog}
        error={error}
        onModeChange={(mode) => send({ type: "SET_AI_MODE", mode })}
        onApplyPending={() => send({ type: "APPLY_PENDING_BLUEPRINT_MUTATIONS", now: now() })}
        onDiscardPending={() => send({ type: "DISCARD_PENDING_BLUEPRINT_MUTATIONS" })}
        onRetry={() => send({ type: "RETRY", now: now() })}
        onSend={(text) =>
          send({
            type: "BLUEPRINT_USER_MESSAGE",
            text,
            now: new Date().toISOString(),
            turnId: uid("bt"),
          })
        }
      />

      <BackNavigationModal
        isOpen={backModalOpen}
        fromPhase="Phase 2"
        toPhase="Phase 1"
        onCancel={() => setBackModalOpen(false)}
        onConfirm={() => {
          setBackModalOpen(false);
          send({ type: "BACK_TO_BRAINSTORM", now: now() });
        }}
      />
    </div>
  );
}

function BlueprintChatPanel({
  transcript,
  isThinking,
  aiMode,
  pendingMutations,
  backlog,
  error,
  onModeChange,
  onApplyPending,
  onDiscardPending,
  onRetry,
  onSend,
}: {
  transcript: BrainstormTurn[];
  isThinking: boolean;
  aiMode: "execute" | "confirm";
  pendingMutations: BlueprintMutation[];
  backlog: { tickets: TicketProposal[]; epicTitle: string; epicDescription: string };
  error?: string | null;
  onModeChange: (mode: "execute" | "confirm") => void;
  onApplyPending: () => void;
  onDiscardPending: () => void;
  onRetry: () => void;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on mount (when navigating back to this phase).
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  // Auto-scroll when new turns arrive or thinking starts.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length, isThinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isThinking) return;
    onSend(text);
    setInput("");
  };

  return (
    // h-full + min-h-0 lets the inner overflow container scroll independently of
    // the page; without min-h-0 the flex child grows to fit its content and the
    // whole window scrolls instead.
    <div className="w-80 xl:w-96 shrink-0 h-full min-h-0 flex flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">Blueprint Assistant</p>
          <p className="text-[10px] text-zinc-500 dark:text-zinc-500 mt-0.5">
            Ask about structure, scope, or request changes
          </p>
        </div>
        <ModeToggle mode={aiMode} onChange={onModeChange} />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {transcript.length === 0 && !isThinking && (
          <p className="text-xs text-zinc-400 dark:text-zinc-600 text-center mt-8">
            Ask the AI about the backlog structure or request changes.
          </p>
        )}

        {transcript.map((turn) =>
          turn.role === "user" ? (
            <div key={turn.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-500 text-white px-3 py-2 text-xs leading-relaxed">
                {turn.text}
              </div>
            </div>
          ) : (
            <ProseTurn key={turn.id} text={turn.text} />
          ),
        )}

        {isThinking && (
          <div className="flex items-center gap-1.5 pl-1">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500 animate-bounce"
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        )}

        {error && transcript.length > 0 && transcript[transcript.length - 1]?.role === "user" && (
          <ErrorMessage
            message={error || "Something went wrong."}
            onRetry={onRetry}
          />
        )}

        <div ref={bottomRef} />
      </div>

      {pendingMutations.length > 0 && (
        <PendingMutationsPreview
          mutations={pendingMutations}
          backlog={backlog}
          onApply={onApplyPending}
          onDiscard={onDiscardPending}
          mode={aiMode}
        />
      )}

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
            placeholder={isThinking ? "Architect is thinking — keep typing…" : "Ask about the backlog…"}
            className="flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-400 transition-colors"
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

const TicketRow = memo(function TicketRow({
  ticket,
  index,
  total,
  allTickets,
  aiTouched,
  onPatch,
  onRemove,
  onMove,
}: {
  ticket: TicketProposal;
  index: number;
  total: number;
  allTickets: TicketProposal[];
  aiTouched: boolean;
  onPatch: (patch: Partial<TicketProposal>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const [addingDep, setAddingDep] = useState(false);
  const [pickTarget, setPickTarget] = useState("");
  const [pickKind, setPickKind] = useState<LinkKind>("blockedBy");
  const [cycleError, setCycleError] = useState<string | null>(null);

  const deps = ticket.dependencies ?? [];
  const others = allTickets.filter((t) => t.id !== ticket.id);

  const removeDep = (i: number) => {
    const next = deps.filter((_, di) => di !== i);
    onPatch({ dependencies: next });
  };

  const confirmDep = () => {
    if (!pickTarget) return;
    const newDep: ProposalDependency = { kind: pickKind, targetProposalId: pickTarget };
    const candidate = { ...ticket, dependencies: [...deps, newDep] };
    const allWithCandidate = allTickets.map((t) => (t.id === ticket.id ? candidate : t));
    const cycles = detectCycles(allWithCandidate);
    if (cycles.length > 0) {
      setCycleError("This would create a dependency cycle.");
      return;
    }
    onPatch({ dependencies: [...deps, newDep] });
    setAddingDep(false);
    setPickTarget("");
    setPickKind("blockedBy");
    setCycleError(null);
  };

  // AI-touch flash is delegated to the shared `.ai-touched-glow` CSS animation
  // (indigo→violet pulse + sweep). Keeps the visual language consistent with
  // Phase 3's MDX editor and avoids re-running framer-motion bg/border tweens
  // on every parent render.
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className={`group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors ${
        aiTouched ? "ai-touched-glow" : ""
      }`}
    >
      {/* Main row */}
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
            onClick={() => { setAddingDep((v) => !v); setCycleError(null); }}
            title="Add dependency"
            className="h-7 w-7 rounded text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors text-xs font-bold"
          >
            ⊕
          </button>
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

      {/* Existing deps chips */}
      {deps.length > 0 && (
        <div className="ml-8 mt-2 flex flex-wrap gap-1">
          {deps.map((dep, di) => {
            const target = allTickets.find((t) => t.id === dep.targetProposalId);
            return (
              <span
                key={di}
                className="inline-flex items-center gap-1 rounded text-[10px] px-1.5 py-0.5 border border-zinc-200 dark:border-zinc-700"
              >
                <span className={`rounded px-1 py-px text-[9px] font-semibold uppercase ${KIND_COLOR[dep.kind]}`}>
                  {KIND_LABEL[dep.kind]}
                </span>
                <span className="text-zinc-600 dark:text-zinc-400 max-w-[120px] truncate">
                  {target?.title ?? "unknown"}
                </span>
                <button
                  onClick={() => removeDep(di)}
                  className="ml-0.5 text-zinc-400 hover:text-rose-600 leading-none"
                  aria-label="Remove dependency"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Add dep inline form */}
      <AnimatePresence initial={false}>
        {addingDep && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="ml-8 mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">This ticket is</span>
              <select
                value={pickKind}
                onChange={(e) => { setPickKind(e.target.value as LinkKind); setCycleError(null); }}
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300 focus:outline-none"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
              <select
                value={pickTarget}
                onChange={(e) => { setPickTarget(e.target.value); setCycleError(null); }}
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs px-1.5 py-0.5 text-zinc-700 dark:text-zinc-300 focus:outline-none max-w-[160px]"
              >
                <option value="">— pick ticket —</option>
                {others.map((o, oi) => (
                  <option key={o.id} value={o.id}>
                    {oi + 1 < index ? oi + 1 : oi + 2}. {o.title.slice(0, 40)}
                  </option>
                ))}
              </select>
              <button
                onClick={confirmDep}
                disabled={!pickTarget}
                className="rounded bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 text-white px-2.5 py-0.5 text-xs transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => { setAddingDep(false); setCycleError(null); }}
                className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Cancel
              </button>
              {cycleError && (
                <span className="text-xs text-rose-600 dark:text-rose-400">{cycleError}</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ────────────────────────────────────────────────────────────────────────
// Slice Q helper components
// ────────────────────────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "execute" | "confirm";
  onChange: (mode: "execute" | "confirm") => void;
}) {
  return (
    <div
      className="flex rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden text-[10px] font-medium"
      title={
        mode === "execute"
          ? "AI applies changes immediately"
          : "AI proposes; you approve before they land"
      }
    >
      <button
        onClick={() => onChange("execute")}
        className={`px-2 py-0.5 transition-colors ${
          mode === "execute"
            ? "bg-indigo-500 text-white"
            : "bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
      >
        Execute
      </button>
      <button
        onClick={() => onChange("confirm")}
        className={`px-2 py-0.5 border-l border-zinc-200 dark:border-zinc-700 transition-colors ${
          mode === "confirm"
            ? "bg-indigo-500 text-white"
            : "bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
      >
        Confirm
      </button>
    </div>
  );
}

function describeBlueprintMutation(
  m: BlueprintMutation,
  backlog: { tickets: TicketProposal[] },
): string {
  const titleOf = (id: string) =>
    backlog.tickets.find((t) => t.id === id)?.title ?? "(unknown)";
  switch (m.kind) {
    case "addTicket":
      return `Add ${m.hierarchyType} [${m.label}]: ${m.title}`;
    case "removeTicket":
      return `Remove: ${titleOf(m.ticketId)}`;
    case "renameTicket":
      return `Rename: ${titleOf(m.ticketId)} → ${m.title ?? "(title unchanged)"}`;
    case "changeLabel":
      return `Relabel ${titleOf(m.ticketId)} → ${m.label}`;
    case "reorderTicket":
      return `Move ${titleOf(m.ticketId)} to position ${m.newIndex + 1}`;
    case "editEpicTitle":
      return `Set Epic title: ${m.title}`;
    case "editEpicDescription":
      return `Edit Epic description`;
    case "addDependency":
      return `Link: ${titleOf(m.sourceTicketId)} ${m.linkKind} ${titleOf(m.targetTicketId)}`;
    case "removeDependency":
      return `Unlink: ${titleOf(m.sourceTicketId)} from ${titleOf(m.targetTicketId)}`;
  }
}

function PendingMutationsPreview({
  mutations,
  backlog,
  onApply,
  onDiscard,
  mode,
}: {
  mutations: BlueprintMutation[];
  backlog: { tickets: TicketProposal[]; epicTitle: string; epicDescription: string };
  onApply: () => void;
  onDiscard: () => void;
  mode: "execute" | "confirm";
}) {
  const isConfirm = mode === "confirm";
  return (
    <div className={`border-t px-4 py-3 space-y-2 ${
      isConfirm
        ? "border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30"
        : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30"
    }`}>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${
        isConfirm
          ? "text-indigo-700 dark:text-indigo-300"
          : "text-emerald-700 dark:text-emerald-300"
      }`}>
        {isConfirm ? `Proposed changes (${mutations.length})` : `Applied changes (${mutations.length})`}
      </p>
      <ul className="space-y-1 text-xs text-zinc-700 dark:text-zinc-300 max-h-40 overflow-y-auto">
        {mutations.map((m, i) => (
          <li key={i} className="flex gap-1.5">
            <span className={`shrink-0 ${isConfirm ? "text-indigo-500" : "text-emerald-500"}`}>•</span>
            <span>{describeBlueprintMutation(m, backlog)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 pt-1">
        {isConfirm && (
          <>
            <button
              onClick={onApply}
              className="rounded bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold px-3 py-1 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={onDiscard}
              className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-1"
            >
              Reject
            </button>
          </>
        )}
        {!isConfirm && (
          <button
            onClick={onDiscard}
            className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-1"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
