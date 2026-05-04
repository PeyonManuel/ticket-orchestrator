import type { DriftReport, EpicSnapshot, Ticket } from "@/domain/analyst";

interface SnapshotTicket {
  id: string;
  title: string;
  storyPoints?: number;
  priority?: string;
  columnId?: string;
  workflowState?: string;
}

interface SnapshotPlan {
  tickets: SnapshotTicket[];
}

const TRACKED_FIELDS: Array<keyof Ticket> = [
  "title",
  "storyPoints",
  "priority",
  "columnId",
  "workflowState",
];

const DONE_STATES = new Set(["done", "closed", "released", "complete", "completed"]);

function isDone(ticket: Ticket): boolean {
  return (
    DONE_STATES.has(ticket.workflowState.toLowerCase()) ||
    DONE_STATES.has(ticket.workflowState.replace(/[_-]/g, "").toLowerCase())
  );
}

function parseSnapshotPlan(planJson: string): SnapshotPlan {
  try {
    const parsed = JSON.parse(planJson) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "tickets" in parsed &&
      Array.isArray((parsed as { tickets: unknown }).tickets)
    ) {
      return parsed as SnapshotPlan;
    }
  } catch {
    // malformed JSON — treat as empty plan
  }
  return { tickets: [] };
}

/**
 * Diffs an EpicSnapshot against the current board state for that epic's children.
 *
 * `currentTickets` should be pre-filtered to just the tickets under the epic
 * (i.e. those whose parentTicketId === epicTicketId, plus the epic itself).
 */
export function computeDrift(
  snapshot: EpicSnapshot,
  currentTickets: Ticket[],
): DriftReport {
  const plan = parseSnapshotPlan(snapshot.planJson);
  const snapshotById = new Map(plan.tickets.map((t) => [t.id, t]));
  const currentById = new Map(currentTickets.map((t) => [t.id, t]));

  const removedTickets: DriftReport["removedTickets"] = [];
  const changedTickets: DriftReport["changedTickets"] = [];

  for (const snapshotTicket of plan.tickets) {
    const current = currentById.get(snapshotTicket.id);
    if (!current) {
      removedTickets.push({ id: snapshotTicket.id, title: snapshotTicket.title });
      continue;
    }
    const changedFields: string[] = [];
    for (const field of TRACKED_FIELDS) {
      const snapVal = snapshotTicket[field as keyof SnapshotTicket];
      const currVal = current[field];
      if (snapVal !== undefined && String(snapVal) !== String(currVal)) {
        changedFields.push(field);
      }
    }
    if (changedFields.length > 0) {
      changedTickets.push({ id: current.id, title: current.title, changedFields });
    }
  }

  const addedTickets: DriftReport["addedTickets"] = currentTickets
    .filter((t) => !snapshotById.has(t.id))
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
