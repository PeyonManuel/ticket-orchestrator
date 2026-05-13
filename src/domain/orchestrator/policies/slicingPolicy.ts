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

function ticketDiscipline(t: TicketProposal): OrgMemberRole {
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
export function produceSprintPlan(input: SlicingInput): SlicingResult {
  const { backlog, sprints, capacities, bufferPercent = DEFAULT_BUFFER_PERCENT } = input;

  const targetSprints = sprints
    .filter((s) => s.status !== "completed")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const bufferRule = { percent: bufferPercent, applied: true };

  if (targetSprints.length === 0) {
    return {
      plan: {
        assignments: backlog.tickets.map((t) => ({
          ticketId: t.id,
          sprintId: null,
          assigneeUserId: null,
        })),
        reasoning:
          "No active or planning sprints found. All tickets placed in the backlog.",
        overflow: [...backlog.tickets],
        bufferRule,
      },
      cycles: [],
    };
  }

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

  const assignments: TicketAssignment[] = [];
  const overflow: TicketProposal[] = [];

  for (const ticket of ordered) {
    const discipline = ticketDiscipline(ticket);
    const points = ticket.storyPoints ?? 3;
    const capForDiscipline = disciplineCapacity(capacities, discipline, bufferPercent);

    let placedSprintIndex = -1;
    let assignee: TeamMemberCapacity | null = null;

    for (let sprintIdx = 0; sprintIdx < targetSprints.length; sprintIdx++) {
      const sprint = targetSprints[sprintIdx];

      // 1) does this discipline have room in this sprint?
      const disciplineKey = `${sprint.id}|${discipline}`;
      const used = committedByDiscipline.get(disciplineKey) ?? 0;
      if (used + points > capForDiscipline) continue;

      // 2) are all blockers placed in this or an earlier sprint?
      const blockers = (ticket.dependencies ?? []).filter((d) => d.kind === "blockedBy");
      const blockersOk = blockers.every((b) => {
        const depAssignment = assignments.find((a) => a.ticketId === b.targetProposalId);
        if (!depAssignment || depAssignment.sprintId === null) return true; // unplaced — best-effort
        const depIdx = targetSprints.findIndex((s) => s.id === depAssignment.sprintId);
        return depIdx >= 0 && depIdx <= sprintIdx;
      });
      if (!blockersOk) continue;

      // 3) pick the least-loaded member of the discipline in this sprint
      const candidates = membersByDiscipline(capacities, discipline);
      if (candidates.length > 0) {
        const sorted = [...candidates].sort((a, b) => {
          const aLoad = committedByMember.get(`${sprint.id}|${a.memberId}`) ?? 0;
          const bLoad = committedByMember.get(`${sprint.id}|${b.memberId}`) ?? 0;
          return aLoad - bLoad;
        });
        assignee = sorted[0] ?? null;
      }

      placedSprintIndex = sprintIdx;
      committedByDiscipline.set(disciplineKey, used + points);
      if (assignee) {
        const memberKey = `${sprint.id}|${assignee.memberId}`;
        committedByMember.set(memberKey, (committedByMember.get(memberKey) ?? 0) + points);
      }
      break;
    }

    if (placedSprintIndex >= 0) {
      assignments.push({
        ticketId: ticket.id,
        sprintId: targetSprints[placedSprintIndex].id,
        assigneeUserId: assignee?.memberId ?? null,
      });
    } else {
      assignments.push({ ticketId: ticket.id, sprintId: null, assigneeUserId: null });
      overflow.push(ticket);
    }
  }

  const placedCount = backlog.tickets.length - overflow.length;
  const sprintBreakdown = targetSprints
    .map((s) => {
      const parts = ALL_DISCIPLINES.map((d) => {
        const used = committedByDiscipline.get(`${s.id}|${d}`) ?? 0;
        if (used === 0) return null;
        const cap = disciplineCapacity(capacities, d, bufferPercent);
        return `${d} ${used}/${cap}`;
      })
        .filter((x): x is string => x !== null)
        .join(", ");
      return parts.length > 0 ? `${s.name} [${parts}]` : `${s.name} [empty]`;
    })
    .join("; ");

  const overflowNote =
    overflow.length > 0
      ? ` ${overflow.length} ticket(s) didn't fit at the ${bufferPercent}% buffer and slid to a later sprint.`
      : "";

  const usingDefaults = capacities.some((c) => c.isDefaultVelocity);
  const defaultsNote = usingDefaults
    ? " Capacity is based on cold-start defaults (no completed-sprint history yet); refine after the first sprint completes."
    : "";

  return {
    plan: {
      assignments,
      reasoning:
        `Allocated ${placedCount} of ${backlog.tickets.length} tickets across ${targetSprints.length} sprint(s). ${sprintBreakdown}.` +
        `${overflowNote}${defaultsNote}${cycleNote} Sequenced by blockedBy dependencies with a ${bufferPercent}% per-discipline buffer.`,
      overflow,
      bufferRule,
    },
    cycles,
  };
}
