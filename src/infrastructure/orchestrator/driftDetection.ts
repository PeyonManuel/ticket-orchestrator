import type { BoardColumn, DriftReport, Ticket } from "@/domain/analyst";
import type { EpicSnapshot } from "@/domain/orchestrator/types";

/**
 * Fields the drift report tracks. Limited to attributes both the proposal (frozen
 * in the snapshot) and the live `Ticket` carry, so comparisons are meaningful.
 * Lifecycle attributes like columnId / workflowState live only on the live ticket
 * and are intentionally excluded — they describe ticket progress, not plan drift.
 */
const TRACKED_FIELDS = ["title", "storyPoints"] as const;

/**
 * Diffs an EpicSnapshot against the current board state for that epic's children.
 *
 * `currentTickets` should be pre-filtered to just the tickets under the epic
 * (i.e. those whose parentTicketId === epicTicketId, plus the epic itself).
 *
 * `columns` is the board's column set — used to resolve which tickets are "done"
 * via the `isDone` flag, instead of hardcoded English state names.
 */
export function computeDrift(
  snapshot: EpicSnapshot,
  currentTickets: Ticket[],
  columns: BoardColumn[],
): DriftReport {
  const doneColumnIds = new Set(columns.filter((c) => c.isDone).map((c) => c.id));
  const isDone = (t: Ticket) => doneColumnIds.has(t.columnId);

  const proposedTickets = snapshot.backlog?.tickets ?? [];
  const proposedById = new Map(proposedTickets.map((t) => [t.id, t]));
  const currentById = new Map(currentTickets.map((t) => [t.id, t]));

  const removedTickets: DriftReport["removedTickets"] = [];
  const changedTickets: DriftReport["changedTickets"] = [];

  for (const proposed of proposedTickets) {
    const current = currentById.get(proposed.id);
    if (!current) {
      removedTickets.push({ id: proposed.id, title: proposed.title });
      continue;
    }
    const changedFields: string[] = [];
    for (const field of TRACKED_FIELDS) {
      const proposedVal = proposed[field];
      const currentVal = current[field];
      if (proposedVal !== undefined && proposedVal !== null && String(proposedVal) !== String(currentVal)) {
        changedFields.push(field);
      }
    }
    if (changedFields.length > 0) {
      changedTickets.push({ id: current.id, title: current.title, changedFields });
    }
  }

  const addedTickets: DriftReport["addedTickets"] = currentTickets
    .filter((t) => !proposedById.has(t.id))
    .map((t) => ({ id: t.id, title: t.title }));

  const doneCount = currentTickets.filter(isDone).length;
  const completionPercent =
    currentTickets.length > 0 ? Math.round((doneCount / currentTickets.length) * 100) : 0;

  const hasDrift =
    removedTickets.length > 0 || addedTickets.length > 0 || changedTickets.length > 0;

  return {
    epicTicketId: snapshot.epicTicketId,
    snapshotCreatedAt: snapshot.createdAt,
    removedTickets,
    addedTickets,
    changedTickets,
    completionPercent,
    hasDrift,
  };
}
