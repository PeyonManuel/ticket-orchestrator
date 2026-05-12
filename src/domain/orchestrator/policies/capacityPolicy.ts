/**
 * Capacity policy — pure domain math for the 80% buffer rule and per-discipline
 * capacity aggregation. No DB access. The infrastructure-layer `capacityProvider`
 * is responsible for deriving each member's `pointsPerSprint` from real velocity
 * history; this file is the policy that decides what to *do* with those numbers.
 */

import type { OrgMemberRole } from "../../analyst/types";

/**
 * Default buffer percentage applied to raw team velocity when proposing a plan.
 * "Never book a member over 80%" — leaves room for ceremonies, code review,
 * interruptions, and the natural noise of an iteration.
 */
export const DEFAULT_BUFFER_PERCENT = 80;

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
