"use client";

import React, { memo } from "react";
import type { Ticket } from "@/domain/analyst";

interface TicketCardProps {
  ticket: Ticket;
  accentColor: string;
  isDragging: boolean;
  onOpen: (ticketId: string) => void;
  onDragStart: (ticketId: string, event: React.DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

function TicketCardImpl({
  ticket,
  accentColor,
  isDragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: TicketCardProps) {
  return (
    <article
      draggable
      role="button"
      tabIndex={0}
      onClick={() => onOpen(ticket.id)}
      onDragStart={(e) => onDragStart(ticket.id, e)}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(ticket.id);
        }
      }}
      className={`cursor-pointer rounded-md border border-zinc-800 bg-zinc-900/60 p-3 hover:border-indigo-500/50 ${
        isDragging ? "opacity-40" : ""
      }`}
      style={{ borderLeftColor: accentColor, borderLeftWidth: 3 }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-300/80">
        {ticket.hierarchyType}
      </p>
      <h4 className="text-sm font-semibold text-zinc-100">
        {ticket.ticketNumber} · {ticket.title}
      </h4>
      <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{ticket.description}</p>
      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">{ticket.label}</span>
        <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300">{ticket.fixVersion}</span>
      </div>
    </article>
  );
}

export const TicketCard = memo(TicketCardImpl);
