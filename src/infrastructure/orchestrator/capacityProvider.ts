/**
 * Capacity provider — server-side wrapper around the pure `computeCapacities`
 * domain policy. Fetches the velocity inputs (completed sprints, done-column
 * tickets, columns) from Mongo and delegates the math to `capacityPolicy`.
 *
 * The presentation layer skips this wrapper entirely and calls `computeCapacities`
 * directly with already-loaded Apollo data — no extra round-trip when entering
 * Phase 4. Kept here for the future LangGraph backend (and any server-side
 * planner that needs to derive velocity without going through Apollo).
 */

import type { MemberSnapshot } from "@/domain/orchestrator/types";
import {
  computeCapacities,
  type TeamMemberCapacity,
} from "@/domain/orchestrator/policies/capacityPolicy";
import {
  getBoardColumns,
  getSprints,
  getTickets,
} from "@/infrastructure/persistence/repository";

export async function deriveCapacities(
  orgId: string,
  boardId: string,
  members: MemberSnapshot[],
): Promise<TeamMemberCapacity[]> {
  if (members.length === 0) return [];

  const [sprints, columns, tickets] = await Promise.all([
    getSprints(orgId, boardId),
    getBoardColumns(orgId, boardId),
    getTickets(orgId, boardId),
  ]);

  return computeCapacities({ members, sprints, tickets, columns });
}
