"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EpicDraft } from "@/domain/orchestrator/types";
import type { OrchestratorEvent } from "@/domain/orchestrator";
import { ProseTurn } from "./shared/ProseTurn";

interface Props {
  draft: EpicDraft;
  /** True while the Analyst actor is running. */
  isThinking: boolean;
  /** True only when the Analyst has produced a usable summary. */
  canAdvance: boolean;
  send: (event: OrchestratorEvent) => void;
}

function uid(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function Phase1Brainstorm({ draft, isThinking, canAdvance, send }: Props) {
  const [draftMessage, setDraftMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the chat to the bottom when new turns arrive or thinking starts.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [draft.transcript.length, isThinking]);

  // Auto-scroll on mount (when navigating back to this phase).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  const handleSend = () => {
    const text = draftMessage.trim();
    if (!text || isThinking) return;
    setDraftMessage("");
    send({
      type: "USER_MESSAGE",
      text,
      now: new Date().toISOString(),
      turnId: uid("turn"),
    });
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const empty = draft.transcript.length === 0;

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {empty && !isThinking && (
          <div className="max-w-2xl mx-auto pt-12 text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 text-2xl text-white mb-4">
              ✦
            </div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
              Tell me about your Epic
            </h2>
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto leading-relaxed">
              Describe the problem, the user, and roughly what success looks like. The
              Analyst will ask follow-ups, then summarize so the Architect can plan the
              backlog.
            </p>
          </div>
        )}

        <div className="max-w-2xl mx-auto flex flex-col gap-4">
          <AnimatePresence initial={false}>
            {draft.transcript.map((turn) => (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {turn.role === "user" ? (
                  <div className="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-indigo-500 text-white">
                    {turn.text}
                  </div>
                ) : (
                  <ProseTurn text={turn.text} className="max-w-[80%] text-sm leading-relaxed" />
                )}
              </motion.div>
            ))}
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

          {draft.brainstormSummary && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              className="mt-2 rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-indigo-50/60 dark:bg-indigo-950/20 p-4"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 mb-2">
                Analyst summary
              </p>
              <p className="text-sm text-zinc-800 dark:text-zinc-100 leading-relaxed">
                {draft.brainstormSummary.summary}
              </p>
              <div className="mt-3">
                <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Goals</p>
                <ul className="text-xs text-zinc-600 dark:text-zinc-400 space-y-0.5 list-disc list-inside">
                  {draft.brainstormSummary.goals.map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2">
            <textarea
              value={draftMessage}
              onChange={(e) => setDraftMessage(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
              placeholder={isThinking ? "Analyst is thinking — keep typing your next message…" : "Describe your Epic, or reply…"}
              className="flex-1 resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
              style={{ minHeight: "42px", maxHeight: "160px" }}
            />
            <button
              onClick={handleSend}
              disabled={isThinking || !draftMessage.trim()}
              className="h-[42px] rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 disabled:text-zinc-500 px-4 text-sm font-medium text-white transition-colors"
            >
              Send
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-400 dark:text-zinc-600">
              {canAdvance
                ? "Summary ready — continue to the backlog whenever you are."
                : "Tip: type “ready” when you've shared enough context."}
            </p>
            <button
              onClick={() => send({ type: "STRUCTURE_REQUESTED", now: new Date().toISOString() })}
              disabled={!canAdvance}
              className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-700 dark:disabled:to-zinc-700 px-4 py-2 text-sm font-semibold text-white disabled:text-zinc-500 transition-all"
            >
              Continue to backlog →
            </button>
          </div>
        </div>
      </div>
    </div>
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
