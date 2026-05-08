"use client";

import React, { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, User, Pencil } from "lucide-react";
import { useBoardActions, useBoardData } from "@/presentation/board/BoardContext";
import { useIsAdmin } from "@/presentation/shared/hooks/useIsAdmin";
import { TICKET_TYPE_COLORS } from "@/presentation/shared/utils/ticketTypeColors";
import type { OrgMember, Sprint, Ticket } from "@/domain/analyst/types";

// ── Ticket row ────────────────────────────────────────────────────────────────

const PRIORITY_DOT: Record<"low" | "medium" | "high", string> = {
  high: "bg-red-500",
  medium: "bg-amber-400",
  low: "bg-sky-400",
};

interface TicketRowProps {
  ticket: Ticket;
  orgMembers: OrgMember[];
  onDragStart: (e: React.DragEvent, ticketId: string) => void;
  onClick: () => void;
}

function TicketRow({ ticket, orgMembers, onDragStart, onClick }: TicketRowProps) {
  const assignee = orgMembers.find((m) => m.userId === ticket.assigneeIds[0]) ?? null;
  const typeColors = TICKET_TYPE_COLORS[ticket.hierarchyType];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, ticket.id)}
      onClick={onClick}
      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer select-none hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
    >
      <span
        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${typeColors.border} ${typeColors.bg} ${typeColors.text}`}
      >
        {typeColors.label}
      </span>
      <span className="shrink-0 w-14 font-mono text-[11px] text-zinc-400">
        #{ticket.ticketNumber}
      </span>

      <span className="flex-1 min-w-0 truncate text-sm text-zinc-900 dark:text-zinc-100">
        {ticket.title}
      </span>

      <span
        className={`shrink-0 h-2 w-2 rounded-full ${PRIORITY_DOT[ticket.priority]}`}
        title={ticket.priority}
      />

      <span className="shrink-0 hidden sm:block max-w-[120px] truncate rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {ticket.workflowState}
      </span>

      <div className="shrink-0 h-6 w-6 rounded-full overflow-hidden">
        {assignee?.imageUrl ? (
          <img
            src={assignee.imageUrl}
            alt={assignee.fullName}
            title={assignee.fullName}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center">
            <User size={12} className="text-zinc-400" />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sprint section ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<Sprint["status"], { text: string; cls: string }> = {
  active: {
    text: "Active",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  planning: {
    text: "Planning",
    cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  },
  completed: {
    text: "Completed",
    cls: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  },
};

interface SectionProps {
  sectionId: string;
  label: string;
  sprint?: Sprint;
  tickets: Ticket[];
  orgMembers: OrgMember[];
  defaultOpen: boolean;
  isDragTarget: boolean;
  onDragOver: (e: React.DragEvent, sectionId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, sectionId: string) => void;
  onDragStart: (e: React.DragEvent, ticketId: string) => void;
  onTicketClick: (ticketId: string) => void;
  onEditSprint?: (sprintId: string) => void;
}

function SprintSection({
  sectionId,
  label,
  sprint,
  tickets,
  orgMembers,
  defaultOpen,
  isDragTarget,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onTicketClick,
  onEditSprint,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isAdmin = useIsAdmin();
  const badge = sprint ? STATUS_BADGE[sprint.status] : null;
  const totalSP = tickets.reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  return (
    <div
      onDragOver={(e) => onDragOver(e, sectionId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, sectionId)}
      className={`rounded-xl border overflow-hidden transition-colors ${
        isDragTarget
          ? "border-indigo-400 dark:border-indigo-500"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Enter" && setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 bg-white dark:bg-zinc-900/70 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left cursor-pointer select-none"
      >
        {open ? (
          <ChevronDown size={14} className="shrink-0 text-zinc-400" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-zinc-400" />
        )}
        <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">{label}</span>
        {badge && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
            {badge.text}
          </span>
        )}
        {sprint && (
          <span className="text-xs text-zinc-400">
            {sprint.startDate} → {sprint.endDate}
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-zinc-400 shrink-0">
          {totalSP > 0 && <span>{totalSP} SP</span>}
          <span>
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
          </span>
          {sprint && isAdmin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditSprint?.(sprint.id);
              }}
              className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors shrink-0"
              title="Edit sprint"
            >
              <Pencil size={14} />
            </button>
          )}
        </span>
      </div>

      {/* Ticket list */}
      {open && (
        <div
          className={`divide-y divide-zinc-100 dark:divide-zinc-800 transition-colors ${
            isDragTarget ? "bg-indigo-50/50 dark:bg-indigo-900/10" : ""
          }`}
        >
          {tickets.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              orgMembers={orgMembers}
              onDragStart={onDragStart}
              onClick={() => onTicketClick(ticket.id)}
            />
          ))}
          {tickets.length === 0 && (
            <p className="px-4 py-5 text-center text-xs text-zinc-400">
              {isDragTarget ? "Drop here to assign to this sprint" : "No tickets"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── BacklogView ───────────────────────────────────────────────────────────────

export function BacklogView() {
  const { sprints, allTickets, orgMembers } = useBoardData();
  const { setTicketSprints, openTicket, openEditSprint } = useBoardActions();

  const [dragOverSection, setDragOverSection] = useState<string | null>(null);

  const orderedSprints = useMemo(() => {
    return [...sprints].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [sprints]);

  const ticketsBySprint = useMemo(() => {
    const map = new Map<string, Ticket[]>(sprints.map((s) => [s.id, []]));
    for (const ticket of allTickets) {
      for (const sid of ticket.sprintIds) {
        map.get(sid)?.push(ticket);
      }
    }
    return map;
  }, [sprints, allTickets]);

  const backlogTickets = useMemo(
    () => allTickets.filter((t) => t.sprintIds.length === 0),
    [allTickets],
  );

  const handleDragStart = (e: React.DragEvent, ticketId: string) => {
    e.dataTransfer.setData("text/plain", ticketId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSection(sectionId);
  };

  // Only clear if we've truly left the section container (not just moved between children).
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverSection(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, sectionId: string) => {
    e.preventDefault();
    setDragOverSection(null);
    const ticketId = e.dataTransfer.getData("text/plain");
    if (!ticketId) return;
    await setTicketSprints(ticketId, sectionId === "backlog" ? [] : [sectionId]);
  };

  const sectionProps = {
    orgMembers,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onDragStart: handleDragStart,
    onTicketClick: openTicket,
    onEditSprint: openEditSprint,
  };

  return (
    <div className="flex flex-col gap-3">
      {orderedSprints.map((sprint) => (
        <SprintSection
          key={sprint.id}
          sectionId={sprint.id}
          label={sprint.name}
          sprint={sprint}
          tickets={ticketsBySprint.get(sprint.id) ?? []}
          defaultOpen={sprint.status !== "completed"}
          isDragTarget={dragOverSection === sprint.id}
          {...sectionProps}
        />
      ))}

      <SprintSection
        sectionId="backlog"
        label="Backlog"
        tickets={backlogTickets}
        defaultOpen
        isDragTarget={dragOverSection === "backlog"}
        {...sectionProps}
      />
    </div>
  );
}
