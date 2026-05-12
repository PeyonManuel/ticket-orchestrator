/**
 * Capacity provider — derives per-member `TeamMemberCapacity` from real
 * board history (completed sprints + done-column tickets) so the Phase 4
 * planner has measured velocity, not just defaults.
 *
 * Falls back to `defaultCapacityFor(...)` when a member has no completed
 * sprints to learn from (cold-start). Defaults flag themselves via
 * `isDefaultVelocity: true` so the planner's reasoning can disclose it.
 */

import type { MemberSnapshot } from "@/domain/orchestrator/types";
import {
  defaultCapacityFor,
  type TeamMemberCapacity,
} from "@/domain/orchestrator/policies/capacityPolicy";
import {
  getBoardColumns,
  getSprints,
  getTickets,
} from "@/infrastructure/persistence/repository";

/**
 * Number of most-recent completed sprints used to compute a member's average
 * velocity. Short enough that stale data drops off, long enough to smooth
 * single-sprint anomalies.
 */
const VELOCITY_WINDOW_SPRINTS = 5;

export async function deriveCapacities(
  orgId: string,
  boardId: string,
  members: MemberSnapshot[],
): Promise<TeamMemberCapacity[]> {
  if (members.length === 0) return [];

  const [allSprints, columns, tickets] = await Promise.all([
    getSprints(orgId, boardId),
    getBoardColumns(orgId, boardId),
    getTickets(orgId, boardId),
  ]);

  const completedSprints = allSprints
    .filter((s) => s.status === "completed")
    .sort((a, b) => b.endDate.localeCompare(a.endDate))
    .slice(0, VELOCITY_WINDOW_SPRINTS);

  if (completedSprints.length === 0) {
    return members.map((m) =>
      defaultCapacityFor({ memberId: m.userId, fullName: m.fullName, role: m.role }),
    );
  }

  const doneColumnIds = new Set(columns.filter((c) => c.isDone).map((c) => c.id));
  const completedSprintIds = new Set(completedSprints.map((s) => s.id));

  // For each member, sum the story points of done-column tickets currently
  // assigned to them that lived in any of the windowed completed sprints.
  // This is approximate (uses *current* assignee + column, not state-at-sprint-end),
  // but it's the best signal available without a per-sprint snapshot history.
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
