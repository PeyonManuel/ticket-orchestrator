/**
 * Slicing policy — Phase 4's fit-first + slide-rest allocation algorithm.
 *
 * Inputs: refined backlog, planning sprints (in chronological order),
 * per-member capacity (from `capacityProvider`), buffer percentage.
 *
 * Output: `SprintPlan` with assignments, overflow, narrative reasoning, and
 * the buffer rule that was applied. Honors `blockedBy` dependency order
 * (a ticket cannot be placed before its blockers).
 */

import type { OrgMemberRole } from "../../analyst/types";
import type {
  BacklogProposal,
  ProposalId,
  ProposedSprint,
  SprintPlan,
  SprintSnapshot,
  TicketAssignment,
  TicketProposal,
} from "../types";
import {
  DEFAULT_BUFFER_PERCENT,
  disciplineCapacity,
  membersByDiscipline,
  type TeamMemberCapacity,
} from "./capacityPolicy";
import { topologicalSort } from "./dependencyPolicy";

/**
 * Fallback mapping from `TicketProposal.label` to discipline when the proposal
 * predates the `discipline` field. New proposals should set `discipline` explicitly.
 */
const ROLE_FOR_LABEL: Record<string, OrgMemberRole> = {
  developer: "developer",
  ux: "ux",
  qa: "tester",
  po: "po",
};

/**
 * Resolve a ticket's discipline for capacity-matching purposes. Prefer the
 * explicit `discipline` field; fall back to the legacy `label`-derived role
 * (for proposals predating Slice A.1); finally default to `developer`.
 *
 * Exported so the Phase 4 UI can mirror the planner's discipline math when
 * rendering per-sprint per-discipline usage breakdowns.
 */
export function ticketDiscipline(t: TicketProposal): OrgMemberRole {
  return t.discipline ?? ROLE_FOR_LABEL[t.label] ?? "developer";
}

const ALL_DISCIPLINES: OrgMemberRole[] = ["developer", "ux", "tester", "po"];

export interface SlicingInput {
  backlog: BacklogProposal;
  sprints: SprintSnapshot[];
  capacities: TeamMemberCapacity[];
  bufferPercent?: number;
}

export interface SlicingResult {
  plan: SprintPlan;
  /** Cycle ids, when the dependency graph was cyclic. Empty when clean. */
  cycles: ProposalId[][];
}

/**
 * Produces a `SprintPlan` from a backlog + planning sprints + per-member capacity.
 *
 * Algorithm:
 *  1. Topologically sort tickets by `blockedBy`. Cyclic graphs fall back to
 *     insertion order with a note in `reasoning`; cycles are also returned for UI.
 *  2. For each ticket in order, walk sprints chronologically and place it into
 *     the first sprint where:
 *       - the discipline still has post-buffer capacity for this ticket's points
 *       - all of the ticket's `blockedBy` deps are already placed in same-or-earlier
 *         sprint (or unplaced — they overflowed too).
 *  3. Picks the least-loaded member of the matching discipline as the assignee.
 *  4. Tickets that don't fit anywhere become `overflow` (`sprintId: null`).
 */
/**
 * Build a proposed sprint that picks up where the previous sprint ends.
 * Duration matches the previous sprint's duration; falls back to 14 days.
 * Capacity matches the previous sprint's capacityPoints; falls back to 30.
 */
function buildProposedSprint(
  previous: SprintSnapshot | ProposedSprint,
  index: number,
): ProposedSprint {
  const prevStart = new Date(previous.startDate);
  const prevEnd = new Date(previous.endDate);
  const durationMs =
    !isNaN(prevStart.getTime()) && !isNaN(prevEnd.getTime()) && prevEnd > prevStart
      ? prevEnd.getTime() - prevStart.getTime()
      : 14 * 24 * 60 * 60 * 1000;
  const startMs = !isNaN(prevEnd.getTime())
    ? prevEnd.getTime() + 24 * 60 * 60 * 1000
    : Date.now() + 14 * 24 * 60 * 60 * 1000;
  const start = new Date(startMs);
  const end = new Date(startMs + durationMs);
  return {
    id: `proposed-${index}-${Math.random().toString(36).slice(2, 10)}`,
    name: `Proposed Sprint ${index}`,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    capacityPoints: previous.capacityPoints > 0 ? previous.capacityPoints : 30,
  };
}

export function produceSprintPlan(input: SlicingInput): SlicingResult {
  const { backlog, sprints, capacities, bufferPercent = DEFAULT_BUFFER_PERCENT } = input;

  const targetSprints = sprints
    .filter((s) => s.status !== "completed")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const bufferRule = { percent: bufferPercent, applied: true };

  let ordered: TicketProposal[];
  let cycles: ProposalId[][] = [];
  let cycleNote = "";
  try {
    ordered = topologicalSort(backlog.tickets);
  } catch (err) {
    const cycle = (err as { cycle?: ProposalId[] }).cycle;
    if (cycle) cycles = [cycle];
    cycleNote = ` Note: dependency cycle detected (${cycle?.join(" → ") ?? "unknown"}); fell back to insertion order.`;
    ordered = backlog.tickets;
  }

  // sprintId + discipline → committed points
  const committedByDiscipline = new Map<string, number>();
  // sprintId + memberId → committed points (for least-loaded assignee pick)
  const committedByMember = new Map<string, number>();

  // Unified slot list: real sprints first, then proposed sprints appended on demand.
  // Each entry carries enough info for capacity tracking + the assignment.
  type Slot =
    | { kind: "real"; ref: SprintSnapshot }
    | { kind: "proposed"; ref: ProposedSprint };
  const slots: Slot[] = targetSprints.map((s) => ({ kind: "real", ref: s }));
  const proposedSprints: ProposedSprint[] = [];

  const tryPlace = (
    ticket: TicketProposal,
    discipline: OrgMemberRole,
    points: number,
    capForDiscipline: number,
  ): { sprintIdx: number; assignee: TeamMemberCapacity | null } | null => {
    for (let sprintIdx = 0; sprintIdx < slots.length; sprintIdx++) {
      const slot = slots[sprintIdx];
      const sprintId = slot.ref.id;

      const disciplineKey = `${sprintId}|${discipline}`;
      const used = committedByDiscipline.get(disciplineKey) ?? 0;
      if (used + points > capForDiscipline) continue;

      const blockers = (ticket.dependencies ?? []).filter((d) => d.kind === "blockedBy");
      const blockersOk = blockers.every((b) => {
        const depAssignment = assignments.find((a) => a.ticketId === b.targetProposalId);
        if (!depAssignment || depAssignment.sprintId === null) return true;
        const depIdx = slots.findIndex((s) => s.ref.id === depAssignment.sprintId);
        return depIdx >= 0 && depIdx <= sprintIdx;
      });
      if (!blockersOk) continue;

      const candidates = membersByDiscipline(capacities, discipline);
      let assignee: TeamMemberCapacity | null = null;
      if (candidates.length > 0) {
        const sorted = [...candidates].sort((a, b) => {
          const aLoad = committedByMember.get(`${sprintId}|${a.memberId}`) ?? 0;
          const bLoad = committedByMember.get(`${sprintId}|${b.memberId}`) ?? 0;
          return aLoad - bLoad;
        });
        assignee = sorted[0] ?? null;
      }

      committedByDiscipline.set(disciplineKey, used + points);
      if (assignee) {
        const memberKey = `${sprintId}|${assignee.memberId}`;
        committedByMember.set(memberKey, (committedByMember.get(memberKey) ?? 0) + points);
      }
      return { sprintIdx, assignee };
    }
    return null;
  };

  const assignments: TicketAssignment[] = [];
  const overflow: TicketProposal[] = [];

  for (const ticket of ordered) {
    const discipline = ticketDiscipline(ticket);
    const points = ticket.storyPoints ?? 3;
    const capForDiscipline = disciplineCapacity(capacities, discipline, bufferPercent);

    // If the discipline has no capacity at all (no members of that role),
    // we can't schedule this ticket — even a new sprint won't help.
    if (capForDiscipline <= 0) {
      assignments.push({ ticketId: ticket.id, sprintId: null, assigneeUserId: null });
      overflow.push(ticket);
      continue;
    }

    let result = tryPlace(ticket, discipline, points, capForDiscipline);

    // Doesn't fit in any existing slot — propose a new sprint and retry.
    // Bounded attempts so we can't blow up if the ticket is larger than a whole sprint.
    let attempts = 0;
    while (!result && attempts < 8) {
      const previous = slots[slots.length - 1]?.ref;
      if (!previous) break;
      const proposed = buildProposedSprint(previous, proposedSprints.length + 1);
      proposedSprints.push(proposed);
      slots.push({ kind: "proposed", ref: proposed });
      result = tryPlace(ticket, discipline, points, capForDiscipline);
      attempts++;
    }

    if (result) {
      assignments.push({
        ticketId: ticket.id,
        sprintId: slots[result.sprintIdx].ref.id,
        assigneeUserId: result.assignee?.memberId ?? null,
      });
    } else {
      assignments.push({ ticketId: ticket.id, sprintId: null, assigneeUserId: null });
      overflow.push(ticket);
    }
  }

  const placedCount = backlog.tickets.length - overflow.length;
  const sprintBreakdown = slots
    .map((slot) => {
      const s = slot.ref;
      const parts = ALL_DISCIPLINES.map((d) => {
        const used = committedByDiscipline.get(`${s.id}|${d}`) ?? 0;
        if (used === 0) return null;
        const cap = disciplineCapacity(capacities, d, bufferPercent);
        return `${d} ${used}/${cap}`;
      })
        .filter((x): x is string => x !== null)
        .join(", ");
      const label = slot.kind === "proposed" ? `${s.name} (proposed)` : s.name;
      return parts.length > 0 ? `${label} [${parts}]` : `${label} [empty]`;
    })
    .join("; ");

  const proposedNote =
    proposedSprints.length > 0
      ? ` Proposed ${proposedSprints.length} new sprint(s) to schedule overflow — these will be created when you commit the epic.`
      : "";
  const overflowNote =
    overflow.length > 0
      ? ` ${overflow.length} ticket(s) still couldn't be scheduled (missing discipline coverage).`
      : "";

  const usingDefaults = capacities.some((c) => c.isDefaultVelocity);
  const defaultsNote = usingDefaults
    ? " Capacity is based on cold-start defaults (no completed-sprint history yet); refine after the first sprint completes."
    : "";

  return {
    plan: {
      assignments,
      reasoning:
        `Allocated ${placedCount} of ${backlog.tickets.length} tickets across ${slots.length} sprint(s). ${sprintBreakdown}.` +
        `${proposedNote}${overflowNote}${defaultsNote}${cycleNote} Sequenced by blockedBy dependencies with a ${bufferPercent}% per-discipline buffer.`,
      overflow,
      proposedSprints,
      bufferRule,
    },
    cycles,
  };
}
