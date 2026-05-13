"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMachine } from "@xstate/react";
import { useApolloClient } from "@apollo/client/react";
import { fromPromise } from "xstate";
import type { BoardColumn, Ticket } from "@/domain/analyst";
import { inspectorMachine } from "@/domain/orchestrator";
import { runInspectorTurn } from "@/infrastructure/orchestrator/mockAi";
import { loadInspectorContext } from "@/infrastructure/orchestrator/inspectorContextProvider";
import { createApolloInspectorStore } from "@/infrastructure/orchestrator/inspectorMemoryStore";

/**
 * Wraps the Inspector machine with:
 *  - the real `loadInspectorContext` actor (bundles snapshot + drift + transcript + memories)
 *  - the mock `runInspectorTurn` actor (swap for LangGraph in slice H)
 *  - append-only persistence: subscribes to context changes and pushes any new
 *    turn / memory through the `InspectorStore` boundary as soon as it appears
 *
 * Server-loaded transcript/memories are seeded into the persisted-id sets on
 * first entry to `ready` so they aren't re-pushed.
 */
export function useInspector({
  epicSnapshotId,
  allTickets,
  columns,
}: {
  epicSnapshotId: string;
  allTickets: Ticket[];
  columns: BoardColumn[];
}) {
  const apollo = useApolloClient();
  const store = useMemo(() => createApolloInspectorStore({ apollo }), [apollo]);

  const machineWithActors = useMemo(
    () =>
      inspectorMachine.provide({
        actors: {
          loadInspectorContextActor: fromPromise(async ({ input }) => {
            const bundle = await loadInspectorContext({
              apollo,
              epicSnapshotId: input.epicSnapshotId,
              allTickets: input.allTickets,
              columns: input.columns,
            });
            return {
              snapshot: bundle.snapshot,
              liveTickets: bundle.liveTickets,
              columns: bundle.columns,
              drift: bundle.drift,
              transcript: bundle.transcript?.turns ?? [],
              memories: bundle.memories,
            };
          }),
          inspectorActor: fromPromise(({ input }) => runInspectorTurn(input)),
        },
      }),
    [apollo],
  );

  const [state, send, actorRef] = useMachine(machineWithActors, {
    input: { epicSnapshotId, allTickets, columns },
  });

  // ── Persistence: append new turns + memories as they enter context ──
  const persistedTurnIds = useRef<Set<string>>(new Set());
  const persistedMemoryIds = useRef<Set<string>>(new Set());
  const seeded = useRef(false);

  useEffect(() => {
    const sub = actorRef.subscribe((snapshot) => {
      const inReady =
        snapshot.matches("ready") || snapshot.matches("awaitingInspector");
      if (!inReady) return;

      // First entry to ready after initial load: anything already in context
      // came from the server and is already persisted. Seed the sets so we
      // don't double-write.
      if (!seeded.current) {
        for (const t of snapshot.context.transcript) persistedTurnIds.current.add(t.id);
        for (const m of snapshot.context.memories) persistedMemoryIds.current.add(m.id);
        seeded.current = true;
        return;
      }

      for (const turn of snapshot.context.transcript) {
        if (persistedTurnIds.current.has(turn.id)) continue;
        persistedTurnIds.current.add(turn.id);
        store.appendTurn(epicSnapshotId, turn).catch(() => {
          // Best-effort. Drop from set so the next snapshot retries.
          persistedTurnIds.current.delete(turn.id);
        });
      }

      for (const memory of snapshot.context.memories) {
        if (persistedMemoryIds.current.has(memory.id)) continue;
        persistedMemoryIds.current.add(memory.id);
        store.saveMemory(memory).catch(() => {
          persistedMemoryIds.current.delete(memory.id);
        });
      }
    });
    return () => sub.unsubscribe();
  }, [actorRef, store, epicSnapshotId]);

  return { state, send };
}

export type UseInspectorReturn = ReturnType<typeof useInspector>;
