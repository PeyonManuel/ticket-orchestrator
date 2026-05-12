/**
 * Capacity policy — pure domain math for the 80% buffer rule and per-discipline
 * capacity aggregation. No DB access. The infrastructure-layer `capacityProvider`
 * is responsible for deriving each member's `pointsPerSprint` from real velocity
 * history; this file is the policy that decides what to *do* with those numbers.
 */

import type { OrgMemberRole } from "../../analyst/types";
import type { MemberSnapshot } from "../types";

/**
 * Default buffer percentage applied to raw team velocity when proposing a plan.
 * "Never book a member over 80%" — leaves room for ceremonies, code review,
 * interruptions, and the natural noise of an iteration.
 */
export const DEFAULT_BUFFER_PERCENT = 80;

/**
 * Number of most-recent completed sprints used to compute a member's average
 * velocity. Short enough that stale data drops off, long enough to smooth
 * single-sprint anomalies.
 */
export const VELOCITY_WINDOW_SPRINTS = 5;

/**
 * Cold-start velocity defaults (story points / sprint / member) when a board
 * has no completed sprints to derive from. Conservative on purpose — the AI
 * should under-promise on the first plan rather than over-commit. Once even one
 * sprint completes, `capacityProvider` returns measured velocity instead.
 */
export const DEFAULT_VELOCITY_BY_ROLE: Record<OrgMemberRole, number> = {
  developer: 8,
  ux: 5,
  tester: 5,
  po: 3,
};

/**
 * Per-member capacity input to the slicing policy. Computed at runtime by
 * `capacityProvider`; never stored. A member has exactly one functional role,
 * so `pointsPerSprint` is scoped to that role implicitly.
 */
export interface TeamMemberCapacity {
  memberId: string;
  fullName: string;
  role: OrgMemberRole;
  /**
   * Average completed story points per sprint for this member, derived from
   * the last N completed sprints. Falls back to `DEFAULT_VELOCITY_BY_ROLE`
   * when history is empty.
   */
  pointsPerSprint: number;
  /**
   * `true` when this number came from the default table (no history yet).
   * Surfaces in the planner's reasoning so the PO knows when the estimate
   * is a guess vs measured.
   */
  isDefaultVelocity: boolean;
}

/**
 * Apply the buffer percentage to a raw point total and floor to integer.
 * Floor (not round) so the buffer is never accidentally exceeded by rounding.
 */
export function applyBuffer(raw: number, percent: number = DEFAULT_BUFFER_PERCENT): number {
  if (raw <= 0) return 0;
  return Math.floor((raw * percent) / 100);
}

/**
 * Returns the post-buffer capacity for a discipline in a single sprint, summed
 * across all members of that role. This is the budget that fresh allocations
 * compete for — it does NOT subtract already-committed work (the caller tracks
 * that). Returns 0 when no members of the discipline exist.
 */
export function disciplineCapacity(
  capacities: TeamMemberCapacity[],
  role: OrgMemberRole,
  percent: number = DEFAULT_BUFFER_PERCENT,
): number {
  const raw = capacities
    .filter((c) => c.role === role)
    .reduce((sum, c) => sum + c.pointsPerSprint, 0);
  return applyBuffer(raw, percent);
}

/**
 * Subset of `capacities` matching the given role. Order-preserving.
 * Slicing uses this list as the candidate pool when picking an assignee.
 */
export function membersByDiscipline(
  capacities: TeamMemberCapacity[],
  role: OrgMemberRole,
): TeamMemberCapacity[] {
  return capacities.filter((c) => c.role === role);
}

/**
 * Constructs a default-velocity `TeamMemberCapacity` for cold-start boards.
 * Used by `capacityProvider` when no completed-sprint history exists for a member.
 */
export function defaultCapacityFor(member: {
  memberId: string;
  fullName: string;
  role: OrgMemberRole;
}): TeamMemberCapacity {
  return {
    ...member,
    pointsPerSprint: DEFAULT_VELOCITY_BY_ROLE[member.role],
    isDefaultVelocity: true,
  };
}

/**
 * Pure capacity computation from already-loaded board data. Used by both the
 * presentation layer (client-side, when entering Phase 4) and the infrastructure
 * `capacityProvider` (server-side, after fetching from Mongo). Keeping the math
 * here means the client and the future LangGraph backend share one algorithm.
 *
 * Approximation: uses *current* assignee + column, not state-at-sprint-end —
 * the best signal available without a per-sprint snapshot history. A ticket
 * counts toward a member's velocity if it's currently in a done column AND
 * was scheduled in one of the windowed completed sprints AND that member is
 * still the assignee.
 */
export function computeCapacities(input: {
  members: MemberSnapshot[];
  sprints: ReadonlyArray<{ id: string; status: string; endDate: string }>;
  tickets: ReadonlyArray<{
    assigneeIds: string[];
    columnId: string;
    sprintIds: string[];
    storyPoints: number;
  }>;
  columns: ReadonlyArray<{ id: string; isDone: boolean }>;
  windowSize?: number;
}): TeamMemberCapacity[] {
  const { members, sprints, tickets, columns } = input;
  const windowSize = input.windowSize ?? VELOCITY_WINDOW_SPRINTS;

  if (members.length === 0) return [];

  const completedSprints = sprints
    .filter((s) => s.status === "completed")
    .slice()
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, windowSize);

  if (completedSprints.length === 0) {
    return members.map((m) =>
      defaultCapacityFor({ memberId: m.userId, fullName: m.fullName, role: m.role }),
    );
  }

  const doneColumnIds = new Set(columns.filter((c) => c.isDone).map((c) => c.id));
  const completedSprintIds = new Set(completedSprints.map((s) => s.id));

  return members.map((m) => {
    const memberTickets = tickets.filter(
      (t) =>
        t.assigneeIds.includes(m.userId) &&
        doneColumnIds.has(t.columnId) &&
        t.sprintIds.some((sid) => completedSprintIds.has(sid)),
    );
    const totalPoints = memberTickets.reduce((sum, t) => sum + t.storyPoints, 0);
    const pointsPerSprint = totalPoints / completedSprints.length;

    if (pointsPerSprint <= 0) {
      return defaultCapacityFor({
        memberId: m.userId,
        fullName: m.fullName,
        role: m.role,
      });
    }

    return {
      memberId: m.userId,
      fullName: m.fullName,
      role: m.role,
      pointsPerSprint: Math.round(pointsPerSprint),
      isDefaultVelocity: false,
    };
  });
}
