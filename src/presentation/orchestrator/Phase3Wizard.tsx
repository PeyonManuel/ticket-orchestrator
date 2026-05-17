"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type {
  BrainstormTurn,
  EpicDraft,
  ProposalId,
  ProposalLabel,
  ProposalStoryPoints,
  RefinementMutation,
  TicketProposal,
} from "@/domain/orchestrator/types";
import type { OrchestratorEvent } from "@/domain/orchestrator";
import { BackNavigationModal } from "./BackNavigationModal";
import { ProseTurn } from "./shared/ProseTurn";
import { RichMarkdownEditor } from "./shared/RichMarkdownEditor";

interface Props {
  draft: EpicDraft;
  isAnalyzing: boolean;
  isAwaitingRefinementReply: boolean;
  /** True once the cursor is past the last ticket. */
  atSummary: boolean;
  aiMode: "execute" | "confirm";
  aiTouchedTicketIds: ProposalId[];
  pendingRefinementMutations: RefinementMutation[];
  send: (event: OrchestratorEvent) => void;
  onAdvanceToPlan: () => void;
}

const STORY_POINT_OPTIONS: ProposalStoryPoints[] = [1, 2, 3, 5, 8, 13];

function uid(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function Phase3Wizard({
  draft,
  isAnalyzing,
  isAwaitingRefinementReply,
  atSummary,
  aiMode,
  aiTouchedTicketIds,
  pendingRefinementMutations,
  send,
  onAdvanceToPlan,
}: Props) {
  const backlog = draft.backlog;

  // Clear AI-touch flag 2s after it lights up, so the editor pulse fires once.
  useEffect(() => {
    if (aiTouchedTicketIds.length === 0) return;
    const t = setTimeout(() => send({ type: "CLEAR_AI_TOUCH" }), 1500);
    return () => clearTimeout(t);
  }, [aiTouchedTicketIds, send]);

  if (!backlog) return null;

  if (atSummary) {
    return <CommitSummary draft={draft} onAdvanceToPlan={onAdvanceToPlan} send={send} />;
  }

  const ticket = backlog.tickets[draft.refinementCursor];
  if (!ticket) return null;
  const total = backlog.tickets.length;
  const cursor = draft.refinementCursor;
  const now = () => new Date().toISOString();
  const isThinking = isAnalyzing || isAwaitingRefinementReply;
  const aiTouched = aiTouchedTicketIds.includes(ticket.id);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
              Ticket {cursor + 1} of {total}
            </span>
            <div className="h-1.5 w-32 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
              <motion.div
                animate={{ width: `${((cursor + 1) / total) * 100}%` }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
              />
            </div>
          </div>
          <BackToBulkButton send={send} now={now} />
        </div>
      </div>

      <div className="flex-1 min-h-0 px-6 py-6">
        <div className="max-w-5xl mx-auto h-full flex flex-col">
          {isAnalyzing ? (
            <div className="rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/20 p-8 text-center">
              <p className="text-sm font-medium text-indigo-800 dark:text-indigo-300">
                Controller is analyzing this ticket…
              </p>
              <p className="mt-1 text-xs text-indigo-700/70 dark:text-indigo-400/70">
                Acceptance criteria, story points, and risks coming up.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 h-full min-h-0">
              <TicketEditor
                ticket={ticket}
                aiTouched={aiTouched}
                onPatch={(patch) =>
                  send({
                    type: "PATCH_TICKET",
                    ticketId: ticket.id,
                    patch,
                    now: now(),
                  })
                }
              />
              <RefinementPanel
                ticket={ticket}
                isThinking={isAwaitingRefinementReply}
                aiMode={aiMode}
                pendingMutations={pendingRefinementMutations}
                onModeChange={(mode) => send({ type: "SET_AI_MODE", mode })}
                onApplyPending={() =>
                  send({ type: "APPLY_PENDING_REFINEMENT_MUTATIONS", now: now() })
                }
                onDiscardPending={() =>
                  send({ type: "DISCARD_PENDING_REFINEMENT_MUTATIONS" })
                }
                onSend={(text) =>
                  send({
                    type: "REFINEMENT_USER_MESSAGE",
                    text,
                    now: new Date().toISOString(),
                    turnId: uid("rt"),
                  })
                }
              />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => send({ type: "PREVIOUS_TICKET", now: now() })}
            disabled={cursor === 0}
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 disabled:opacity-30 disabled:hover:text-zinc-500"
          >
            ← Previous
          </button>
          <button
            onClick={() => send({ type: "APPROVE_TICKET", now: now() })}
            disabled={isThinking}
            className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-700 dark:disabled:to-zinc-700 px-4 py-2 text-sm font-semibold text-white disabled:text-zinc-500 transition-all"
          >
            {cursor === total - 1 ? "Approve & finish" : "Approve & next →"}
          </button>
        </div>
      </div>
    </div>
  );

  function TicketEditor({
    ticket,
    aiTouched,
    onPatch,
  }: {
    ticket: TicketProposal;
    aiTouched: boolean;
    onPatch: (patch: Partial<TicketProposal>) => void;
  }) {
    return (
      <div className="flex flex-col gap-3 rounded-xl p-2 h-full min-h-0">
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">
            Title
          </label>
          <input
            value={ticket.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
          />
        </div>

        <div className="flex-1 min-h-0 flex flex-col">
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">
            Description & Acceptance Criteria
          </label>
          <RichMarkdownEditor
            value={ticket.description}
            onChange={(value) => onPatch({ description: value })}
            aiTouched={aiTouched}
          />
        </div>

        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-1.5">
            Story points
          </label>
          <div className="flex gap-1.5">
            {STORY_POINT_OPTIONS.map((p) => {
              const active = ticket.storyPoints === p;
              return (
                <button
                  key={p}
                  onClick={() => onPatch({ storyPoints: p })}
                  className={`h-9 w-9 rounded-lg text-sm font-semibold tabular-nums transition-all ${
                    active
                      ? "bg-indigo-500 text-white shadow-sm"
                      : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
}

function RefinementPanel({
  ticket,
  isThinking,
  aiMode,
  pendingMutations,
  onModeChange,
  onApplyPending,
  onDiscardPending,
  onSend,
}: {
  ticket: TicketProposal;
  isThinking: boolean;
  aiMode: "execute" | "confirm";
  pendingMutations: RefinementMutation[];
  onModeChange: (mode: "execute" | "confirm") => void;
  onApplyPending: () => void;
  onDiscardPending: () => void;
  onSend: (text: string) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the chat container to bottom on mount (navigation back).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  // Auto-scroll when new turns arrive or thinking starts (chat container only).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [ticket.transcript.length, isThinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isThinking) return;
    onSend(text);
    setInput("");
  };

  return (
    <aside className="flex flex-col gap-4 h-full min-h-0">
      {/* Refinement chat — h-full + min-h-0 so the message list scrolls internally
          rather than pushing the whole page. */}
      <div className="flex flex-col rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex-1 min-h-0">
        <div className="px-3 py-2.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Refinement
          </p>
          <ChatModeToggle mode={aiMode} onChange={onModeChange} />
        </div>

        <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
          {ticket.transcript.length === 0 && !isThinking && (
            <p className="text-[10px] text-zinc-400 dark:text-zinc-600 text-center mt-4">
              Keep refining — adjust scope, points, risks, or criteria.
            </p>
          )}
          {ticket.transcript.map((turn: BrainstormTurn) =>
            turn.role === "user" ? (
              <div key={turn.id} className="flex justify-end">
                <div className="max-w-[90%] rounded-xl rounded-br-sm bg-indigo-500 text-white px-2.5 py-1.5 text-[11px] leading-relaxed">
                  {turn.text}
                </div>
              </div>
            ) : (
              <ProseTurn
                key={turn.id}
                text={turn.text}
                className="text-[11px] leading-relaxed text-zinc-700 dark:text-zinc-300 space-y-2 pr-1"
              />
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
          <div ref={bottomRef} />
        </div>

        {pendingMutations.length > 0 && (
          <PendingRefinementPreview
            mutations={pendingMutations}
            ticket={ticket}
            onApply={onApplyPending}
            onDiscard={onDiscardPending}
            mode={aiMode}
          />
        )}

        <div className="border-t border-zinc-100 dark:border-zinc-800 p-2.5">
          <div className="flex items-end gap-1.5">
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
              placeholder={isThinking ? "Controller is thinking — keep typing…" : "Keep refining — scope, points, risks, criteria…"}
              className="flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-[11px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:border-indigo-400 transition-colors"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isThinking}
              className="h-8 w-8 shrink-0 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:text-zinc-400 text-white transition-colors flex items-center justify-center text-sm"
              aria-label="Send"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ChatModeToggle({
  mode,
  onChange,
}: {
  mode: "execute" | "confirm";
  onChange: (mode: "execute" | "confirm") => void;
}) {
  return (
    <div
      className="flex rounded-md border border-zinc-200 dark:border-zinc-700 overflow-hidden text-[9px] font-medium"
      title={
        mode === "execute"
          ? "AI applies changes immediately"
          : "AI proposes; you approve before they land"
      }
    >
      <button
        onClick={() => onChange("execute")}
        className={`px-1.5 py-0.5 transition-colors ${
          mode === "execute"
            ? "bg-indigo-500 text-white"
            : "bg-transparent text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        }`}
      >
        Execute
      </button>
      <button
        onClick={() => onChange("confirm")}
        className={`px-1.5 py-0.5 border-l border-zinc-200 dark:border-zinc-700 transition-colors ${
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

function describeRefinementMutation(
  m: RefinementMutation,
  ticket: TicketProposal,
): string {
  switch (m.kind) {
    case "setDescription": {
      const before = ticket.description?.slice(0, 60) ?? "(empty)";
      return `Rewrite description (was: "${before}${ticket.description.length > 60 ? "…" : ""}")`;
    }
    case "setStoryPoints":
      return `Set story points: ${ticket.storyPoints ?? "—"} → ${m.storyPoints}`;
    case "setLabel":
      return `Relabel: ${ticket.label} → ${m.label as ProposalLabel}`;
    case "setDiscipline":
      return `Set discipline: ${ticket.discipline ?? "(unset)"} → ${m.discipline}`;
    case "replaceRisks":
      return `Replace risks (${ticket.risks.length} → ${m.risks.length} items)`;
  }
}

function PendingRefinementPreview({
  mutations,
  ticket,
  onApply,
  onDiscard,
  mode,
}: {
  mutations: RefinementMutation[];
  ticket: TicketProposal;
  onApply: () => void;
  onDiscard: () => void;
  mode: "execute" | "confirm";
}) {
  const isConfirm = mode === "confirm";
  return (
    <div className={`border-t px-3 py-2.5 space-y-1.5 ${
      isConfirm
        ? "border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30"
        : "border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/60 dark:bg-emerald-950/30"
    }`}>
      <p className={`text-[9px] font-semibold uppercase tracking-wide ${
        isConfirm
          ? "text-indigo-700 dark:text-indigo-300"
          : "text-emerald-700 dark:text-emerald-300"
      }`}>
        {isConfirm ? `Proposed changes (${mutations.length})` : `Applied changes (${mutations.length})`}
      </p>
      <ul className="space-y-1 text-[11px] text-zinc-700 dark:text-zinc-300 max-h-32 overflow-y-auto">
        {mutations.map((m, i) => (
          <li key={i} className="flex gap-1.5">
            <span className={`shrink-0 ${isConfirm ? "text-indigo-500" : "text-emerald-500"}`}>•</span>
            <span>{describeRefinementMutation(m, ticket)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 pt-0.5">
        {isConfirm && (
          <>
            <button
              onClick={onApply}
              className="rounded bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-semibold px-2.5 py-0.5 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={onDiscard}
              className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-1"
            >
              Reject
            </button>
          </>
        )}
        {!isConfirm && (
          <button
            onClick={onDiscard}
            className="text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 px-1"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function CommitSummary({
  draft,
  onAdvanceToPlan,
  send,
}: {
  draft: EpicDraft;
  onAdvanceToPlan: () => void;
  send: (event: OrchestratorEvent) => void;
}) {
  const backlog = draft.backlog!;
  const totalPoints = backlog.tickets.reduce(
    (sum, t) => sum + (t.storyPoints ?? 0),
    0,
  );
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-6">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-xl mb-3">
              ✓
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Ready to commit
            </h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Review the final plan, then commit to write tickets to the board.
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {backlog.epicTitle}
            </h3>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
              {backlog.epicDescription}
            </p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              <Stat label="Tickets" value={backlog.tickets.length} />
              <Stat label="Story points" value={totalPoints} />
              <Stat label="Stories" value={backlog.tickets.filter((t) => t.hierarchyType === "story").length} />
            </div>

            <ul className="mt-5 divide-y divide-zinc-100 dark:divide-zinc-800">
              {backlog.tickets.map((t, i) => (
                <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-6 text-xs tabular-nums text-zinc-400">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate text-zinc-900 dark:text-zinc-100">
                    {t.title}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                    {t.storyPoints ?? "—"} pts
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <button
            onClick={() => send({ type: "PREVIOUS_TICKET", now: new Date().toISOString() })}
            className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          >
            ← Review last ticket
          </button>
          <button
            onClick={onAdvanceToPlan}
            className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 hover:from-indigo-600 hover:to-violet-600 px-5 py-2 text-sm font-semibold text-white transition-all"
          >
            Plan Sprints →
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950 p-3 text-center">
      <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
        {value}
      </p>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
    </div>
  );
}

function BackToBulkButton({
  send,
  now,
}: {
  send: (event: OrchestratorEvent) => void;
  now: () => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
      >
        ← Back to bulk list
      </button>
      <BackNavigationModal
        isOpen={open}
        fromPhase="Phase 3"
        toPhase="Phase 2"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          send({ type: "BACK_TO_BULK", now: now() });
        }}
      />
    </>
  );
}
