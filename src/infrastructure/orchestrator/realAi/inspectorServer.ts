/**
 * Server-side Inspector turn entry point. Loads the snapshot + transcript +
 * memories + live tickets directly from the repository (no Apollo round-trip),
 * computes drift, and hands the bundle to the LLM graph.
 *
 * Kept separate from the pure `inspectorGraph` so the graph stays domain-pure
 * and the repository couplings live in the infrastructure layer.
 */

import type { InspectorTurn, InspectorTurnOutput } from "@/domain/orchestrator/types";
import {
  getEpicSnapshotById,
  getInspectorTranscript,
  listEpicMemories,
  getTicketsByIds,
  getBoardColumns,
} from "@/infrastructure/persistence/repository";
import { computeDrift } from "@/infrastructure/orchestrator/driftDetection";
import { runInspectorTurn } from "./inspectorGraph";

export interface RunInspectorTurnServerInput {
  orgId: string;
  epicSnapshotId: string;
  /** Client's view of the transcript including the just-sent user turn. */
  transcript: InspectorTurn[];
  userMessage: string;
}

export async function runInspectorTurnServer(
  input: RunInspectorTurnServerInput,
): Promise<InspectorTurnOutput> {
  const snapshot = await getEpicSnapshotById(input.orgId, input.epicSnapshotId);
  if (!snapshot) {
    throw new Error(`EpicSnapshot ${input.epicSnapshotId} not found`);
  }

  const [liveTickets, columns, persistedTranscript, memories] = await Promise.all([
    snapshot.ticketIds.length > 0
      ? getTicketsByIds(input.orgId, snapshot.ticketIds)
      : Promise.resolve([]),
    getBoardColumns(input.orgId, snapshot.boardId),
    getInspectorTranscript(input.orgId, input.epicSnapshotId),
    listEpicMemories(input.orgId, input.epicSnapshotId),
  ]);

  // Prefer the client's transcript (it has the just-sent user turn that hasn't
  // been persisted yet). Fall back to the persisted view if the client passed
  // an empty array — e.g. server-initiated re-runs.
  const transcript =
    input.transcript.length > 0
      ? input.transcript
      : persistedTranscript?.turns ?? [];

  const drift = computeDrift(snapshot, liveTickets, columns);

  return runInspectorTurn(
    {
      snapshot,
      liveTickets,
      columns,
      drift,
      transcript,
      memories,
      userMessage: input.userMessage,
    },
    { orgId: input.orgId },
  );
}
