/**
 * Bundles everything Phase 5 needs to reason about a committed Epic:
 *  - the frozen `EpicSnapshot` (full 4-phase artifacts)
 *  - the live `Ticket` records for that Epic's children (passed in by the
 *    caller from `useBoardData`, which already keeps them fresh)
 *  - the persistent `InspectorTranscript` so the chat resumes mid-thread
 *  - existing `EpicMemory` records the Inspector previously curated
 *  - a `DriftReport` (snapshot vs live) so the Inspector can answer
 *    "what changed since commit?" without recomputing on every turn
 *
 * Caller hands in `apollo`, `allTickets`, and `columns` because the board
 * data is already hot in `BoardContext`; refetching it would be wasteful.
 */

import type { ApolloClient } from "@apollo/client";
import type { BoardColumn, DriftReport, Ticket } from "@/domain/analyst";
import type {
  EpicMemory,
  EpicSnapshot,
  InspectorTranscript,
} from "@/domain/orchestrator/types";
import {
  GET_EPIC_SNAPSHOT_BY_ID,
  GET_INSPECTOR_TRANSCRIPT,
  GET_EPIC_MEMORIES,
} from "@/infrastructure/graphql/operations";
import { computeDrift } from "./driftDetection";

export interface InspectorContextBundle {
  snapshot: EpicSnapshot;
  /** Filtered to tickets whose id is in `snapshot.ticketIds`. */
  liveTickets: Ticket[];
  columns: BoardColumn[];
  transcript: InspectorTranscript | null;
  memories: EpicMemory[];
  drift: DriftReport;
}

export interface LoadInspectorContextInput {
  apollo: ApolloClient;
  epicSnapshotId: string;
  /** Board tickets (already in BoardContext). Filtered to the Epic here. */
  allTickets: Ticket[];
  columns: BoardColumn[];
}

export async function loadInspectorContext({
  apollo,
  epicSnapshotId,
  allTickets,
  columns,
}: LoadInspectorContextInput): Promise<InspectorContextBundle> {
  const [snapshotResult, transcriptResult, memoriesResult] = await Promise.all([
    apollo.query<{ epicSnapshotById: EpicSnapshot | null }>({
      query: GET_EPIC_SNAPSHOT_BY_ID,
      variables: { id: epicSnapshotId },
      fetchPolicy: "network-only",
    }),
    apollo.query<{ inspectorTranscript: InspectorTranscript | null }>({
      query: GET_INSPECTOR_TRANSCRIPT,
      variables: { epicSnapshotId },
      fetchPolicy: "network-only",
    }),
    apollo.query<{ epicMemories: EpicMemory[] }>({
      query: GET_EPIC_MEMORIES,
      variables: { epicSnapshotId },
      fetchPolicy: "network-only",
    }),
  ]);

  const snapshot = snapshotResult.data?.epicSnapshotById ?? null;
  if (!snapshot) {
    throw new Error(`EpicSnapshot ${epicSnapshotId} not found`);
  }

  const epicTicketIds = new Set(snapshot.ticketIds);
  const liveTickets = allTickets.filter((t) => epicTicketIds.has(t.id));
  const drift = computeDrift(snapshot, liveTickets, columns);

  return {
    snapshot,
    liveTickets,
    columns,
    transcript: transcriptResult.data?.inspectorTranscript ?? null,
    memories: memoriesResult.data?.epicMemories ?? [],
    drift,
  };
}
