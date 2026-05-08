"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { useApolloClient } from "@apollo/client/react";
import { orchestratorMachine } from "@/domain/orchestrator";
import type { EpicDraft } from "@/domain/orchestrator/types";
import {
  runAnalystTurn,
  runArchitectBacklog,
  runBlueprintChat,
  runControllerRefinement,
  runRefinementChat,
  runSprintPlanner,
  runPlannerChat,
} from "@/infrastructure/orchestrator/mockAi";
import { createApolloDraftStore } from "@/infrastructure/orchestrator/draftStore";
import { COMMIT_EPIC_DRAFT, GET_TICKETS } from "@/infrastructure/graphql/operations";
import { fromPromise } from "xstate";

const SAVE_DEBOUNCE_MS = 1500;

type SaveStatus = "idle" | "pending" | "saving";

/**
 * Wraps the orchestrator machine with:
 *  - mock AI actors injected via `provide({ actors })`
 *  - debounced persistence: every context change schedules a save 1.5s later
 *  - a force-save handler that flushes pending edits on close / commit
 *
 * When the LangGraph backend lands, swap the three `fromPromise` calls below
 * for adapter functions of the same shape.
 */
export function useOrchestrator(initialDraft: EpicDraft) {
  const apollo = useApolloClient();
  const draftStore = useMemo(
    () => createApolloDraftStore({ apollo, boardId: initialDraft.boardId }),
    [apollo, initialDraft.boardId],
  );

  const machineWithActors = useMemo(
    () =>
      orchestratorMachine.provide({
        actors: {
          analystActor: fromPromise(({ input }) => runAnalystTurn(input)),
          architectActor: fromPromise(({ input }) => runArchitectBacklog(input)),
          controllerActor: fromPromise(({ input }) => runControllerRefinement(input)),
          blueprintChatActor: fromPromise(({ input }) => runBlueprintChat(input)),
          refinementChatActor: fromPromise(({ input }) => runRefinementChat(input)),
          plannerActor: fromPromise(({ input }) => runSprintPlanner(input)),
          plannerChatActor: fromPromise(({ input }) => runPlannerChat(input)),
        },
      }),
    [],
  );

  const [state, send, actorRef] = useMachine(machineWithActors, {
    input: { draft: initialDraft },
  });

  // Status drives the "Saving…" indicator in the header.
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // ── Debounced persistence ────────────────────────────────────────
  const pendingSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSerialized = useRef<string>(JSON.stringify(initialDraft));

  // `flushRef` always points at the latest closure so the unmount cleanup
  // and the debounce-tail timer save the *current* draft, not a stale one.
  // The assignment happens in an effect (refs must not be touched in render).
  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    flushRef.current = async () => {
      if (pendingSaveTimer.current) {
        clearTimeout(pendingSaveTimer.current);
        pendingSaveTimer.current = null;
      }
      const draft = state.context.draft;
      const serialized = JSON.stringify(draft);
      if (serialized === lastSavedSerialized.current) {
        setSaveStatus("idle");
        return;
      }
      setSaveStatus("saving");
      try {
        await draftStore.save(draft);
        lastSavedSerialized.current = serialized;
      } catch {
        // Swallow — next save attempt will retry. The user can still Save manually.
      } finally {
        setSaveStatus("idle");
      }
    };
  });

  useEffect(() => {
    const sub = actorRef.subscribe((snapshot) => {
      const serialized = JSON.stringify(snapshot.context.draft);
      if (serialized === lastSavedSerialized.current) return;
      setSaveStatus("pending");
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      pendingSaveTimer.current = setTimeout(() => {
        void flushRef.current();
      }, SAVE_DEBOUNCE_MS);
    });
    return () => {
      sub.unsubscribe();
      if (pendingSaveTimer.current) clearTimeout(pendingSaveTimer.current);
      // Best-effort flush on unmount so closing the modal doesn't lose recent edits.
      void flushRef.current();
    };
  }, [actorRef]);

  const flush = useMemo(() => () => flushRef.current(), []);

  const commitDraft = useMemo(
    () => async (): Promise<{ epicTicketId: string; createdTicketIds: string[]; snapshotId: string }> => {
      const result = await apollo.mutate<{
        commitEpicDraft: { epicTicketId: string; createdTicketIds: string[]; snapshotId: string };
      }>({
        mutation: COMMIT_EPIC_DRAFT,
        variables: { draftId: state.context.draft.id },
        refetchQueries: [
          { query: GET_TICKETS, variables: { boardId: state.context.draft.boardId, first: 200 } },
        ],
        awaitRefetchQueries: true,
      });
      if (!result.data?.commitEpicDraft) throw new Error("Commit returned no data");
      return result.data.commitEpicDraft;
    },
    [apollo, state.context.draft.id],
  );

  return {
    state,
    send,
    flush,
    commitDraft,
    draft: state.context.draft,
    error: state.context.error,
    saveStatus,
  };
}

export type UseOrchestratorReturn = ReturnType<typeof useOrchestrator>;
