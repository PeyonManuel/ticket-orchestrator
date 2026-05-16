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
} from "@/domain/orchestrator/types";
import {
  GET_EPIC_DRAFTS,
  GET_EPIC_DRAFT,
  CREATE_EPIC_DRAFT,
  SAVE_EPIC_DRAFT,
  DELETE_EPIC_DRAFT,
} from "@/infrastructure/graphql/operations";
import { stripTypename } from "./stripTypename";

export interface ApolloDraftStoreOptions {
  apollo: ApolloClient;
  boardId: string;
}

export function createApolloDraftStore({
  apollo,
  boardId,
}: ApolloDraftStoreOptions): DraftStore & {
  create(): Promise<EpicDraft>;
} {
  return {
    load: (id: DraftId) =>
      apollo
        .query<{ epicDraft: EpicDraft | null }>({
          query: GET_EPIC_DRAFT,
          variables: { id },
          // Fresh on session entry — the draft might have been edited in another
          // tab. Read-once per session; XState owns state from here on.
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
        // No refetchQueries here. Save fires every ~1.5s during a session (the
        // debounced auto-save) and the picker isn't visible during a session,
        // so refetching GET_EPIC_DRAFTS on every save burns bandwidth for no
        // user benefit. The picker re-mounts with `cache-and-network`, which
        // will pull a fresh list on its own when the user actually navigates
        // back. Apollo's normalized cache also keeps the modified entity in
        // sync via the mutation's return type — no manual cache.modify needed.
      });
    },

    remove: async (id: DraftId) => {
      await apollo.mutate({
        mutation: DELETE_EPIC_DRAFT,
        variables: { id },
        // Picker is visible when delete fires — refetch keeps the list fresh.
        refetchQueries: [{ query: GET_EPIC_DRAFTS, variables: { boardId } }],
      });
    },

    create: async () => {
      const result = await apollo.mutate<{ createEpicDraft: EpicDraft }>({
        mutation: CREATE_EPIC_DRAFT,
        variables: { boardId },
        // Picker visible at create-time and the new entry must show up in the
        // list when the user backs out of the new session.
        refetchQueries: [{ query: GET_EPIC_DRAFTS, variables: { boardId } }],
      });
      const draft = result.data?.createEpicDraft;
      if (!draft) throw new Error("createEpicDraft returned no data");
      return draft;
    },
  };
}
