"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { useBoardContext } from "@/presentation/board/BoardContext";
import { fuzzyScore } from "@/presentation/shared/utils/fuzzyScore";

export function SearchModal() {
  const { activeModal, allTickets, closeModal, openTicket } = useBoardContext();
  const [query, setQuery] = useState("");

  if (activeModal !== "search") return null;

  const trimmedQuery = query.trim();
  const suggestions = allTickets
    .map((ticket) => {
      const hay = `${ticket.ticketNumber} ${ticket.title} ${ticket.description} ${ticket.label} ${ticket.fixVersion} ${ticket.workflowState}`;
      return { ticket, score: fuzzyScore(trimmedQuery, hay) };
    })
    .filter((item) => trimmedQuery.length > 0 && item.score >= 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return (
    <div
      onClick={closeModal}
      className="fixed inset-0 z-30 flex items-start justify-center bg-black/30 dark:bg-zinc-950/25 pt-16"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-indigo-500/30 bg-white dark:bg-zinc-900 p-4 shadow-2xl"
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" size={16} />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by number, title, label, version, or state"
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-950 py-2 pl-9 pr-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-500"
          />
        </div>
        {trimmedQuery.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            Type to search tickets by number, title, labels, version, or state.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {suggestions.map(({ ticket }) => (
              <button
                key={ticket.id}
                onClick={() => {
                  setQuery("");
                  closeModal();
                  openTicket(ticket.id);
                }}
                className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-left hover:border-indigo-400/40"
              >
                <p className="text-xs font-semibold text-indigo-500 dark:text-indigo-200">{ticket.ticketNumber}</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{ticket.title}</p>
                <p className="text-xs text-zinc-500">
                  {ticket.label} · {ticket.fixVersion} · {ticket.workflowState}
                </p>
              </button>
            ))}
            {!suggestions.length && (
              <p className="text-xs text-zinc-500">No matching tickets.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
