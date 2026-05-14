"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMachine } from "@xstate/react";
import { useApolloClient } from "@apollo/client/react";
import { orchestratorMachine } from "@/domain/orchestrator";
import type { EpicDraft, TeamMemberCapacity } from "@/domain/orchestrator/types";
import { runSprintPlanner } from "@/infrastructure/orchestrator/mockAi";
import { createAi } from "@/infrastructure/orchestrator/ai";
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
export function useOrchestrator(
  initialDraft: EpicDraft,
  initialCapacities: TeamMemberCapacity[] = [],
) {
  const apollo = useApolloClient();
  const draftStore = useMemo(
    () => createApolloDraftStore({ apollo, boardId: initialDraft.boardId }),
    [apollo, initialDraft.boardId],
  );

  const ai = useMemo(() => createAi(apollo), [apollo]);

  const machineWithActors = useMemo(
    () =>
      orchestratorMachine.provide({
        actors: {
          analystActor: fromPromise(({ input }) => ai.runAnalystTurn(input)),
          architectActor: fromPromise(({ input }) => ai.runArchitectBacklog(input)),
          controllerActor: fromPromise(({ input }) => ai.runControllerRefinement(input)),
          blueprintChatActor: fromPromise(({ input }) => ai.runBlueprintChat(input)),
          refinementChatActor: fromPromise(({ input }) => ai.runRefinementChat(input)),
          // Planner stays deterministic — slicing policy handles the math, no LLM needed.
          plannerActor: fromPromise(({ input }) => runSprintPlanner(input)),
          plannerChatActor: fromPromise(({ input }) => ai.runPlannerChat(input)),
        },
      }),
    [ai],
  );

  const [state, send, actorRef] = useMachine(machineWithActors, {
    input: { draft: initialDraft, capacities: initialCapacities },
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
  const forceFlushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const save = async (throwOnError: boolean) => {
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
      } catch (err) {
        if (throwOnError) throw err;
        // Background saves swallow — next debounce tick will retry.
      } finally {
        setSaveStatus("idle");
      }
    };
    flushRef.current = () => save(false);
    forceFlushRef.current = () => save(true);
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
  // forceFlush propagates errors — use before commit so a failed save surfaces instead of
  // silently proceeding with a stale server document.
  const forceFlush = useMemo(() => () => forceFlushRef.current(), []);

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
    forceFlush,
    commitDraft,
    draft: state.context.draft,
    error: state.context.error,
    saveStatus,
  };
}

export type UseOrchestratorReturn = ReturnType<typeof useOrchestrator>;
