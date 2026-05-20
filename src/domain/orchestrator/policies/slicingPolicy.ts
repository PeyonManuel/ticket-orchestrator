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
  SprintPreAllocation,
  SprintSnapshot,
  TicketAssignment,
  TicketProposal,
} from "../types";
import {
  DEFAULT_BUFFER_PERCENT,
  DEFAULT_VELOCITY_BY_ROLE,
  applyBuffer,
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


export interface SlicingInput {
  backlog: BacklogProposal;
  sprints: SprintSnapshot[];
  capacities: TeamMemberCapacity[];
  bufferPercent?: number;
  /** Story-point allocations already committed by existing board tickets. Pre-seeds capacity maps. */
  initialAllocations?: SprintPreAllocation[];
  /** Board name, used to name proposed sprints `{boardName} {N+1}` matching the convention used by `createSprint`. */
  boardName?: string;
  /**
   * Next sprint number to use when naming proposed sprints. Should equal
   * `(max parseable sprint number on this board) + 1` so proposed sprints
   * extend the existing numbering without collisions. When omitted, falls
   * back to the slot-relative `Proposed Sprint N` naming.
   */
  nextSprintNumber?: number;
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
 *     insertion order; cycles are returned for UI highlighting.
 *  2. For each ticket in order, walk sprints chronologically and place it into
 *     the first sprint where:
 *       - the discipline still has post-buffer capacity for this ticket's points
 *       - all of the ticket's `blockedBy` deps are already placed in same-or-earlier sprint
 *  3. Picks the least-loaded member of the matching discipline as the assignee.
 *  4. If no existing sprint fits, proposed sprints are created until the ticket can be placed.
 *     Oversized tickets (points > per-sprint discipline cap) are force-placed in their own
 *     proposed sprint rather than left unscheduled. Every ticket is always scheduled.
 */
/**
 * Build a proposed sprint that picks up where the previous sprint ends.
 * Duration matches the previous sprint's duration; falls back to 14 days.
 * Capacity matches the previous sprint's capacityPoints; falls back to 30.
 */
function buildProposedSprint(
  previous: SprintSnapshot | ProposedSprint,
  index: number,
  opts: { boardName?: string; nextSprintNumber?: number } = {},
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
  // Match `createSprint`'s `{boardName} {N+1}` convention so existing + proposed
  // sprints share a single numbering line. Fallback (no boardName/nextNumber):
  // a generic "Proposed Sprint N" — slot-relative, not board-relative.
  const name =
    opts.boardName && typeof opts.nextSprintNumber === "number"
      ? `${opts.boardName} ${opts.nextSprintNumber + index - 1}`
      : `Proposed Sprint ${index}`;
  return {
    id: `proposed-${index}-${Math.random().toString(36).slice(2, 10)}`,
    name,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    capacityPoints: previous.capacityPoints > 0 ? previous.capacityPoints : 30,
  };
}

export function produceSprintPlan(input: SlicingInput): SlicingResult {
  const {
    backlog,
    sprints,
    capacities,
    bufferPercent = DEFAULT_BUFFER_PERCENT,
    initialAllocations,
    boardName,
    nextSprintNumber,
  } = input;

  const targetSprints = sprints
    .filter((s) => s.status !== "completed")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const bufferRule = { percent: bufferPercent, applied: true };

  let ordered: TicketProposal[];
  let cycles: ProposalId[][] = [];
  try {
    ordered = topologicalSort(backlog.tickets);
  } catch (err) {
    const cycle = (err as { cycle?: ProposalId[] }).cycle;
    if (cycle) cycles = [cycle];
    ordered = backlog.tickets;
  }

  // sprintId + discipline → committed points (pre-seeded with existing board tickets)
  const committedByDiscipline = new Map<string, number>();
  // sprintId + memberId → committed points (pre-seeded with existing board tickets)
  const committedByMember = new Map<string, number>();

  for (const alloc of initialAllocations ?? []) {
    const dk = `${alloc.sprintId}|${alloc.discipline}`;
    committedByDiscipline.set(dk, (committedByDiscipline.get(dk) ?? 0) + alloc.points);
    const mk = `${alloc.sprintId}|${alloc.memberId}`;
    committedByMember.set(mk, (committedByMember.get(mk) ?? 0) + alloc.points);
  }

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

  for (const ticket of ordered) {
    const discipline = ticketDiscipline(ticket);
    const points = ticket.storyPoints ?? 3;
    // When the team has no members for this discipline, fall back to the
    // role's cold-start default so the ticket can still be placed.
    const rawCap = disciplineCapacity(capacities, discipline, bufferPercent);
    const effectiveCap =
      rawCap > 0 ? rawCap : applyBuffer(DEFAULT_VELOCITY_BY_ROLE[discipline], bufferPercent);

    let result = tryPlace(ticket, discipline, points, effectiveCap);

    // No existing slot fits — keep proposing new sprints until the ticket lands.
    // A fresh proposed sprint always has zero committed points, so tryPlace will
    // succeed as long as points ≤ effectiveCap. For oversized tickets (points >
    // effectiveCap), force-place into the new sprint after one failed attempt.
    while (!result) {
      const previous = slots[slots.length - 1]?.ref;
      if (!previous) break;
      const proposed = buildProposedSprint(previous, proposedSprints.length + 1, {
        boardName,
        nextSprintNumber,
      });
      proposedSprints.push(proposed);
      slots.push({ kind: "proposed", ref: proposed });
      result = tryPlace(ticket, discipline, points, effectiveCap);

      if (!result) {
        // Oversized ticket: force-place into this new proposed sprint.
        const sprintId = proposed.id;
        const dk = `${sprintId}|${discipline}`;
        committedByDiscipline.set(dk, (committedByDiscipline.get(dk) ?? 0) + points);
        const candidates = [...membersByDiscipline(capacities, discipline)].sort(
          (a, b) =>
            (committedByMember.get(`${sprintId}|${a.memberId}`) ?? 0) -
            (committedByMember.get(`${sprintId}|${b.memberId}`) ?? 0),
        );
        const assignee = candidates[0] ?? null;
        if (assignee) {
          const mk = `${sprintId}|${assignee.memberId}`;
          committedByMember.set(mk, (committedByMember.get(mk) ?? 0) + points);
        }
        result = { sprintIdx: slots.length - 1, assignee };
        break;
      }
    }

    assignments.push({
      ticketId: ticket.id,
      sprintId: result ? slots[result.sprintIdx].ref.id : null,
      assigneeUserId: result?.assignee?.memberId ?? null,
    });
  }

  return {
    plan: {
      assignments,
      proposedSprints,
      bufferRule,
    },
    cycles,
  };
}
