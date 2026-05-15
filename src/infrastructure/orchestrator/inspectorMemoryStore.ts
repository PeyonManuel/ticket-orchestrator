/**
 * Apollo-backed implementation of the `InspectorStore` boundary.
 *
 * Phase 5's Inspector calls into this adapter to hydrate the transcript,
 * append a new turn, fetch recent memories, and persist new ones via the
 * `saveInsight` tool. The runtime LangGraph backend will swap this with a
 * gRPC/HTTP-based adapter of the same shape; the domain machine doesn't
 * change.
 */

import type { ApolloClient } from "@apollo/client";
import {
  type EpicMemory,
  type EpicMemorySource,
  type InspectorStore,
  type InspectorTranscript,
  type InspectorTurn,
} from "@/domain/orchestrator/types";
import {
  GET_INSPECTOR_TRANSCRIPT,
  GET_EPIC_MEMORIES,
  APPEND_INSPECTOR_TURN,
  SAVE_EPIC_MEMORY,
} from "@/infrastructure/graphql/operations";
import { stripTypename } from "./stripTypename";

export interface ApolloInspectorStoreOptions {
  apollo: ApolloClient;
}

export function createApolloInspectorStore({
  apollo,
}: ApolloInspectorStoreOptions): InspectorStore {
  return {
    loadTranscript: (epicSnapshotId) =>
      apollo
        .query<{ inspectorTranscript: InspectorTranscript | null }>({
          query: GET_INSPECTOR_TRANSCRIPT,
          variables: { epicSnapshotId },
          fetchPolicy: "network-only",
        })
        .then((r) => (r.data?.inspectorTranscript ? stripTypename(r.data.inspectorTranscript) : null)),

    appendTurn: async (epicSnapshotId: string, turn: InspectorTurn) => {
      const result = await apollo.mutate<{ appendInspectorTurn: InspectorTranscript }>({
        mutation: APPEND_INSPECTOR_TURN,
        variables: {
          epicSnapshotId,
          turn: { id: turn.id, role: turn.role, text: turn.text, createdAt: turn.createdAt },
        },
        // Keep the cached transcript fresh for any concurrent observer of this Epic.
        refetchQueries: [
          { query: GET_INSPECTOR_TRANSCRIPT, variables: { epicSnapshotId } },
        ],
      });
      const updated = result.data?.appendInspectorTurn;
      if (!updated) throw new Error("appendInspectorTurn returned no data");
      return stripTypename(updated);
    },

    listMemories: (epicSnapshotId) =>
      apollo
        .query<{ epicMemories: EpicMemory[] }>({
          query: GET_EPIC_MEMORIES,
          variables: { epicSnapshotId },
          fetchPolicy: "network-only",
        })
        .then((r) => (r.data?.epicMemories ?? []).map(stripTypename)),

    saveMemory: async (memory: EpicMemory) => {
      const input: {
        epicSnapshotId: string;
        content: string;
        tags: string[];
        source: EpicMemorySource;
      } = {
        epicSnapshotId: memory.epicSnapshotId,
        content: memory.content,
        tags: memory.tags,
        source: memory.source,
      };
      await apollo.mutate({
        mutation: SAVE_EPIC_MEMORY,
        variables: { input },
        refetchQueries: [
          { query: GET_EPIC_MEMORIES, variables: { epicSnapshotId: memory.epicSnapshotId } },
        ],
      });
    },
  };
}
