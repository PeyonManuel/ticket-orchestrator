"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Users,
  Zap,
  Send,
  Loader2,
  AlertTriangle,
  Gauge,
  Info,
} from "lucide-react";
import { ProseTurn } from "./shared/ProseTurn";
import type {
  BrainstormTurn,
  EpicDraft,
  MemberSnapshot,
  ProposedSprint,
  TeamMemberCapacity,
  TicketAssignment,
  TicketProposal,
} from "@/domain/orchestrator/types";
import type { OrchestratorEvent } from "@/domain/orchestrator";
import type { OrgMemberRole } from "@/domain/analyst";
import {
  DEFAULT_BUFFER_PERCENT,
  disciplineCapacity,
} from "@/domain/orchestrator/policies/capacityPolicy";
import { ticketDiscipline } from "@/domain/orchestrator/policies/slicingPolicy";
import { BackNavigationModal } from "./BackNavigationModal";

interface Props {
  draft: EpicDraft;
  capacities: TeamMemberCapacity[];
  isGeneratingPlan: boolean;
  isAwaitingPlannerReply: boolean;
  send: (event: OrchestratorEvent) => void;
  onCommit: () => void;
  isCommitting?: boolean;
}

const ROLE_LABEL: Record<OrgMemberRole, string> = {
  developer: "Dev",
  ux: "UX",
  tester: "QA",
  po: "PO",
};

const ROLE_BADGE: Record<OrgMemberRole, string> = {
  developer: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  ux: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  tester: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  po: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const LABEL_COLOR: Record<string, string> = {
  developer: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  ux: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  qa: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  po: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
};

function uid(prefix: string): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function Phase4SprintPlan({
  draft,
  capacities,
  isGeneratingPlan,
  isAwaitingPlannerReply,
  send,
  onCommit,
  isCommitting,
}: Props) {
  const { sprintPlan, planningSprints, planningMembers, backlog, plannerTranscript } = draft;
  const now = () => new Date().toISOString();
  const [backModalOpen, setBackModalOpen] = useState(false);

  if (isGeneratingPlan || !sprintPlan) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Analyzing sprints and capacity…</span>
      </div>
    );
  }

  const assignments = sprintPlan.assignments;
  const overflow: TicketProposal[] = sprintPlan.overflow ?? [];
  const proposedSprints: ProposedSprint[] = sprintPlan.proposedSprints ?? [];
  const bufferPercent = sprintPlan.bufferRule?.percent ?? DEFAULT_BUFFER_PERCENT;

  const ticketsForSprint = (sprintId: string | null) =>
    assignments
      .filter((a) => a.sprintId === sprintId)
      .map((a) => {
        const ticket = backlog?.tickets.find((t) => t.id === a.ticketId);
        return ticket ? { ticket, assignment: a } : null;
      })
      .filter(Boolean) as Array<{ ticket: NonNullable<typeof backlog>["tickets"][number]; assignment: TicketAssignment }>;

  const sprintUsedSP = (sprintId: string) =>
    ticketsForSprint(sprintId).reduce((sum, { ticket }) => sum + (ticket.storyPoints ?? 0), 0);

  const backlogTickets = ticketsForSprint(null);
  const memberById = (userId: string | null): MemberSnapshot | undefined =>
    planningMembers.find((m) => m.userId === userId);

  return (
    <div className="flex h-full">
      {/* ── Left: Sprint lanes ──────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden border-r border-zinc-200 dark:border-zinc-800">
        {/* Sub-header */}
        <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-3 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                Sprint Assignment Plan
              </p>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                {assignments.length} tickets across {planningSprints.length + proposedSprints.length} sprint{(planningSprints.length + proposedSprints.length) !== 1 ? "s" : ""}
                {proposedSprints.length > 0 && (
                  <span className="text-violet-600 dark:text-violet-400">
                    {" "}({proposedSprints.length} proposed)
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setBackModalOpen(true)}
              className="text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              ← Back to Deep Dive
            </button>
          </div>
        </div>

        {/* Reasoning banner */}
        {sprintPlan.reasoning && (
          <div className="mx-6 mt-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/40 px-4 py-2.5 text-xs text-indigo-800 dark:text-indigo-300 max-w-3xl self-center w-full">
            <span className="font-medium">AI reasoning: </span>
            {sprintPlan.reasoning}
          </div>
        )}

        {/* Sprint lanes */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Capacity panel — per-discipline budget at the buffer rule */}
            <CapacityPanel capacities={capacities} bufferPercent={bufferPercent} />

            {/* Overflow callout — tickets the planner couldn't fit */}
            {overflow.length > 0 && <OverflowBanner overflow={overflow} />}

            {planningSprints.map((sprint) => {
              const used = sprintUsedSP(sprint.id);
              const pct = sprint.capacityPoints > 0 ? Math.min((used / sprint.capacityPoints) * 100, 100) : 0;
              const over = used > sprint.capacityPoints;
              const tickets = ticketsForSprint(sprint.id);
              return (
                <SprintLane
                  key={sprint.id}
                  sprint={sprint}
                  tickets={tickets}
                  usedSP={used}
                  pct={pct}
                  over={over}
                  memberById={memberById}
                  capacities={capacities}
                  bufferPercent={bufferPercent}
                />
              );
            })}

            {/* Proposed sprints — created on commit if the user approves. */}
            {proposedSprints.length > 0 && (
              <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/40 px-4 py-2.5 text-xs text-violet-800 dark:text-violet-300">
                <span className="font-medium">{proposedSprints.length} new sprint{proposedSprints.length === 1 ? "" : "s"} suggested</span>
                {" — "}these will be created when you commit the epic so the planner has room for everything.
              </div>
            )}
            {proposedSprints.map((sprint) => {
              const used = sprintUsedSP(sprint.id);
              const pct = sprint.capacityPoints > 0 ? Math.min((used / sprint.capacityPoints) * 100, 100) : 0;
              const over = used > sprint.capacityPoints;
              const tickets = ticketsForSprint(sprint.id);
              return (
                <SprintLane
                  key={sprint.id}
                  sprint={sprint}
                  tickets={tickets}
                  usedSP={used}
                  pct={pct}
                  over={over}
                  memberById={memberById}
                  capacities={capacities}
                  bufferPercent={bufferPercent}
                  proposed
                />
              );
            })}

            {/* Backlog lane */}
            {backlogTickets.length > 0 && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Backlog (unscheduled)</span>
                  <span className="text-xs text-zinc-400">{backlogTickets.length} ticket{backlogTickets.length !== 1 ? "s" : ""}</span>
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {backlogTickets.map(({ ticket, assignment }) => (
                    <TicketRow key={ticket.id} ticket={ticket} assignment={assignment} memberById={memberById} />
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Commit footer — approve (commit) + revise (regenerate) pair */}
        <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-6 py-4 shrink-0">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {overflow.length > 0
                ? `${overflow.length} ticket${overflow.length === 1 ? "" : "s"} couldn't be scheduled — review before approving.`
                : proposedSprints.length > 0
                  ? `${proposedSprints.length} new sprint${proposedSprints.length === 1 ? "" : "s"} will be created on commit.`
                  : "Tickets will be created and assigned to sprints."}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={onCommit}
                disabled={isCommitting}
                className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:from-zinc-300 disabled:to-zinc-300 dark:disabled:from-zinc-700 dark:disabled:to-zinc-700 px-5 py-2 text-sm font-semibold text-white disabled:text-zinc-500 transition-all"
              >
                {isCommitting ? "Committing…" : "Approve & commit →"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Planner chat ──────────────────────────────────── */}
      <PlannerChatPanel
        transcript={plannerTranscript}
        isThinking={isAwaitingPlannerReply}
        send={send}
      />

      <BackNavigationModal
        isOpen={backModalOpen}
        fromPhase="Phase 4"
        toPhase="Phase 3"
        onCancel={() => setBackModalOpen(false)}
        onConfirm={() => {
          setBackModalOpen(false);
          send({ type: "BACK_TO_REFINE", now: now() });
        }}
      />
    </div>
  );
}

function CapacityPanel({
  capacities,
  bufferPercent,
}: {
  capacities: TeamMemberCapacity[];
  bufferPercent: number;
}) {
  if (capacities.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <Info size={12} />
          No team capacity available. Assign roles to org members to plan against real velocity.
        </div>
      </div>
    );
  }

  const roles: OrgMemberRole[] = ["developer", "ux", "tester", "po"];
  const anyDefault = capacities.some((c) => c.isDefaultVelocity);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
        <Gauge size={13} className="text-indigo-500 shrink-0" />
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Capacity per sprint
        </span>
        <span className="text-[11px] text-zinc-400">
          at {bufferPercent}% buffer
        </span>
        {anyDefault && (
          <span
            title="Some members have no completed-sprint history — cold-start defaults applied"
            className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          >
            <Info size={10} />
            using defaults
          </span>
        )}
      </div>
      <div className="grid grid-cols-4 gap-px bg-zinc-100 dark:bg-zinc-800">
        {roles.map((role) => {
          const roleMembers = capacities.filter((c) => c.role === role);
          const budget = disciplineCapacity(capacities, role, bufferPercent);
          const memberCount = roleMembers.length;
          return (
            <div
              key={role}
              className="bg-white dark:bg-zinc-900 px-3 py-2.5 flex flex-col gap-1"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${ROLE_BADGE[role]}`}
                >
                  {ROLE_LABEL[role]}
                </span>
                <span className="text-[10px] text-zinc-400 tabular-nums">
                  {memberCount} {memberCount === 1 ? "member" : "members"}
                </span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {budget}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                  SP / sprint
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OverflowBanner({ overflow }: { overflow: TicketProposal[] }) {
  const totalSP = overflow.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  return (
    <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-900/40 flex items-center gap-2">
        <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Sliding to later sprints
        </span>
        <span className="text-[11px] text-amber-700 dark:text-amber-400 ml-auto tabular-nums">
          {overflow.length} ticket{overflow.length === 1 ? "" : "s"} · {totalSP} SP
        </span>
      </div>
      <ul className="divide-y divide-amber-200/60 dark:divide-amber-900/40">
        {overflow.map((t) => (
          <li
            key={t.id}
            className="flex items-center gap-3 px-4 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <span className="flex-1 truncate">{t.title}</span>
            <span className="text-amber-700 dark:text-amber-400 tabular-nums shrink-0">
              {t.storyPoints ?? "—"} SP
            </span>
            {t.discipline && (
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${ROLE_BADGE[t.discipline]}`}
              >
                {ROLE_LABEL[t.discipline]}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SprintLane({
  sprint,
  tickets,
  usedSP,
  pct,
  over,
  memberById,
  capacities,
  bufferPercent,
  proposed,
}: {
  sprint: { id: string; name: string; startDate: string; endDate: string; capacityPoints: number };
  tickets: Array<{ ticket: NonNullable<EpicDraft["backlog"]>["tickets"][number]; assignment: TicketAssignment }>;
  usedSP: number;
  pct: number;
  over: boolean;
  memberById: (id: string | null) => MemberSnapshot | undefined;
  capacities: TeamMemberCapacity[];
  bufferPercent: number;
  proposed?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-white dark:bg-zinc-900 overflow-hidden ${
        proposed
          ? "border-violet-300 dark:border-violet-800"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      {/* Sprint header */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <div className="flex items-center gap-3 mb-2">
          <CalendarDays size={13} className={`shrink-0 ${proposed ? "text-violet-500" : "text-indigo-500"}`} />
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{sprint.name}</span>
          {proposed && (
            <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              Proposed
            </span>
          )}
          <span className="text-[11px] text-zinc-400">
            {sprint.startDate.slice(0, 10)} → {sprint.endDate.slice(0, 10)}
          </span>
          <span className={`ml-auto text-[11px] font-semibold tabular-nums ${over ? "text-rose-500" : "text-zinc-500 dark:text-zinc-400"}`}>
            {usedSP} / {sprint.capacityPoints} SP{over ? " ⚠" : ""}
          </span>
        </div>
        <div className="h-1 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              over ? "bg-rose-500" : proposed ? "bg-violet-500" : "bg-indigo-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <DisciplineUsageRow
          tickets={tickets}
          capacities={capacities}
          bufferPercent={bufferPercent}
        />
      </div>

      {tickets.length === 0 ? (
        <p className="px-4 py-3 text-xs text-zinc-400 dark:text-zinc-600 italic">No tickets assigned to this sprint.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {tickets.map(({ ticket, assignment }) => (
            <TicketRow key={ticket.id} ticket={ticket} assignment={assignment} memberById={memberById} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Compact per-discipline used/cap row beneath the sprint capacity bar. Mirrors
 * the planner's discipline math (via the shared `ticketDiscipline` helper) so
 * the PO sees the same partition the slicing policy used. Hidden disciplines:
 * roles with zero capacity AND zero usage stay off the row to avoid noise on
 * small teams.
 */
function DisciplineUsageRow({
  tickets,
  capacities,
  bufferPercent,
}: {
  tickets: Array<{ ticket: NonNullable<EpicDraft["backlog"]>["tickets"][number]; assignment: TicketAssignment }>;
  capacities: TeamMemberCapacity[];
  bufferPercent: number;
}) {
  const roles: OrgMemberRole[] = ["developer", "ux", "tester", "po"];
  const rows = roles
    .map((role) => {
      const used = tickets
        .filter(({ ticket }) => ticketDiscipline(ticket) === role)
        .reduce((sum, { ticket }) => sum + (ticket.storyPoints ?? 0), 0);
      const cap = disciplineCapacity(capacities, role, bufferPercent);
      return { role, used, cap };
    })
    .filter((r) => r.used > 0 || r.cap > 0);

  if (rows.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {rows.map(({ role, used, cap }) => {
        const pct = cap > 0 ? (used / cap) * 100 : used > 0 ? 100 : 0;
        const tone =
          pct >= 100
            ? "text-rose-600 dark:text-rose-400"
            : pct >= 80
              ? "text-amber-600 dark:text-amber-400"
              : "text-zinc-500 dark:text-zinc-400";
        return (
          <span
            key={role}
            className="inline-flex items-center gap-1 text-[10px]"
            title={
              cap === 0
                ? `${ROLE_LABEL[role]}: ${used} SP assigned but no team capacity for this discipline`
                : `${ROLE_LABEL[role]}: ${used} of ${cap} SP used (${Math.round(pct)}%)`
            }
          >
            <span
              className={`text-[9px] font-semibold px-1 py-0.5 rounded ${ROLE_BADGE[role]}`}
            >
              {ROLE_LABEL[role]}
            </span>
            <span className={`tabular-nums ${tone}`}>
              {used}/{cap}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function TicketRow({
  ticket,
  assignment,
  memberById,
}: {
  ticket: NonNullable<EpicDraft["backlog"]>["tickets"][number];
  assignment: TicketAssignment;
  memberById: (id: string | null) => MemberSnapshot | undefined;
}) {
  const member = memberById(assignment.assigneeUserId);
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${LABEL_COLOR[ticket.label] ?? "bg-zinc-100 text-zinc-600"}`}>
        {ticket.label}
      </span>
      <span className="flex-1 truncate text-zinc-800 dark:text-zinc-200">{ticket.title}</span>
      <span className="text-xs text-zinc-400 tabular-nums shrink-0">{ticket.storyPoints ?? "—"} SP</span>
      {member ? (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="h-5 w-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
            {member.fullName.charAt(0).toUpperCase()}
          </div>
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400 max-w-[80px] truncate">{member.fullName}</span>
        </div>
      ) : (
        <span className="text-[11px] text-zinc-400 shrink-0 flex items-center gap-1">
          <Users size={11} />
          Unassigned
        </span>
      )}
    </li>
  );
}

function PlannerChatPanel({
  transcript,
  isThinking,
  send,
}: {
  transcript: BrainstormTurn[];
  isThinking: boolean;
  send: (event: OrchestratorEvent) => void;
}) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const now = () => new Date().toISOString();

  // Auto-scroll on mount (when navigating back to this phase) and on every new
  // turn arriving — replaces the prior post-send setTimeout(50ms) which leaked
  // if the user navigated away mid-scroll.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length, isThinking]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput("");
    send({
      type: "PLANNER_USER_MESSAGE",
      text,
      now: now(),
      turnId: uid("pt"),
    });
  };

  return (
    <aside className="w-72 xl:w-80 shrink-0 flex flex-col bg-white dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
        <Zap size={13} className="text-indigo-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Sprint Planner
        </p>
      </div>

      {/* Chat bubbles */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {transcript.length === 0 && !isThinking && (
          <p className="text-[10px] text-zinc-400 dark:text-zinc-600 text-center mt-4">
            The plan is ready. Keep refining — ask about capacity, reassignments, or trade-offs.
          </p>
        )}
        {transcript.map((turn) => (
          <div
            key={turn.id}
            className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {turn.role === "user" ? (
              <div className="max-w-[90%] rounded-xl px-2.5 py-1.5 text-[11px] leading-relaxed bg-indigo-500 text-white rounded-br-sm">
                {turn.text}
              </div>
            ) : (
              <ProseTurn
                text={turn.text}
                className="max-w-[90%] text-[11px] leading-relaxed text-zinc-800 dark:text-zinc-200"
              />
            )}
          </div>
        ))}
        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-2.5 shrink-0">
        <div className="flex gap-1.5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={isThinking ? "Planner is thinking — keep typing…" : "Ask about capacity or assignments…"}
            rows={2}
            className="flex-1 resize-none rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1.5 text-[11px] text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isThinking}
            className="h-8 w-8 shrink-0 mt-auto rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-zinc-200 dark:disabled:bg-zinc-700 flex items-center justify-center transition-colors"
          >
            <Send size={12} className="text-white disabled:text-zinc-400" />
          </button>
        </div>
      </div>
    </aside>
  );
}
