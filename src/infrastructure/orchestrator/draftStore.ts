/**
 * Apollo-backed implementation of the `DraftStore` boundary.
 *
 * The orchestrator React hook holds a long-lived `apolloClient` reference and
 * passes it in here on construction. Tests can substitute an in-memory fake
 * by constructing a different object that implements `DraftStore`.
 */

import type { ApolloClient } from "@apollo/client";
import {
  type DraftStore,
  type DraftId,
  type EpicDraft,
  type EpicDraftIndexEntry,
} from "@/domain/orchestrator/types";
import {
  GET_EPIC_DRAFTS,
  GET_EPIC_DRAFT,
  CREATE_EPIC_DRAFT,
  SAVE_EPIC_DRAFT,
  DELETE_EPIC_DRAFT,
} from "@/infrastructure/graphql/operations";

export interface ApolloDraftStoreOptions {
  apollo: ApolloClient;
  boardId: string;
}

function stripTypename<T>(obj: T): T {
  if (Array.isArray(obj)) return obj.map(stripTypename) as T;
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k !== "__typename") out[k] = stripTypename(v);
    }
    return out as T;
  }
  return obj;
}

export function createApolloDraftStore({
  apollo,
  boardId,
}: ApolloDraftStoreOptions): DraftStore & {
  create(): Promise<EpicDraft>;
  listForCurrentBoard(): Promise<EpicDraftIndexEntry[]>;
} {
  return {
    list: () =>
      apollo
        .query<{ epicDrafts: EpicDraftIndexEntry[] }>({
          query: GET_EPIC_DRAFTS,
          variables: { boardId },
          fetchPolicy: "network-only",
        })
        .then((r) => r.data?.epicDrafts ?? []),

    listForCurrentBoard: () =>
      apollo
        .query<{ epicDrafts: EpicDraftIndexEntry[] }>({
          query: GET_EPIC_DRAFTS,
          variables: { boardId },
          fetchPolicy: "network-only",
        })
        .then((r) => r.data?.epicDrafts ?? []),

    load: (id: DraftId) =>
      apollo
        .query<{ epicDraft: EpicDraft | null }>({
          query: GET_EPIC_DRAFT,
          variables: { id },
          fetchPolicy: "network-only",
        })
        .then((r) => r.data?.epicDraft ?? null),

    save: async (draft: EpicDraft) => {
      const { orgId: _orgId, updatedAt: _updatedAt, ...raw } = draft;
      void _orgId;
      void _updatedAt;
      const input = stripTypename(raw);
      await apollo.mutate({
        mutation: SAVE_EPIC_DRAFT,
        variables: { input },
        // Update the cached list so the picker reflects newest activity.
        refetchQueries: [{ query: GET_EPIC_DRAFTS, variables: { boardId } }],
      });
    },

    remove: async (id: DraftId) => {
      await apollo.mutate({
        mutation: DELETE_EPIC_DRAFT,
        variables: { id },
        refetchQueries: [{ query: GET_EPIC_DRAFTS, variables: { boardId } }],
      });
    },

    create: async () => {
      const result = await apollo.mutate<{ createEpicDraft: EpicDraft }>({
        mutation: CREATE_EPIC_DRAFT,
        variables: { boardId },
        refetchQueries: [{ query: GET_EPIC_DRAFTS, variables: { boardId } }],
      });
      const draft = result.data?.createEpicDraft;
      if (!draft) throw new Error("createEpicDraft returned no data");
      return draft;
    },
  };
}
