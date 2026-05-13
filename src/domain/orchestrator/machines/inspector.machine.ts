/**
 * Inspector XState machine — Phase 5 / post-commit chat over a committed Epic.
 *
 * Lifecycle: `loadingContext → ready ↔ awaitingInspector` (with `failed` on
 * load error). The machine owns the conversation state (transcript + curated
 * memories) but delegates *persistence* to the hook — the hook subscribes to
 * context changes and pushes new turns / new memories through the
 * `InspectorStore` boundary. Keeps the domain layer pure (no Apollo / no
 * React).
 *
 * Actor adapters are placeholders; the presentation layer overrides them
 * via `provide({ actors })`, same pattern as `orchestrator.machine.ts`.
 */

import { assign, fromPromise, setup } from "xstate";
import type { BoardColumn, DriftReport, Ticket } from "../../analyst/types";
import type {
  EpicMemory,
  EpicMemorySource,
  EpicSnapshot,
  InspectorTurn,
  InspectorTurnInput,
  InspectorTurnOutput,
} from "../types";

// ── Actor I/O ───────────────────────────────────────────────────────

export interface LoadInspectorContextInput {
  epicSnapshotId: string;
  allTickets: Ticket[];
  columns: BoardColumn[];
}

export interface LoadInspectorContextOutput {
  snapshot: EpicSnapshot;
  liveTickets: Ticket[];
  columns: BoardColumn[];
  drift: DriftReport;
  transcript: InspectorTurn[];
  memories: EpicMemory[];
}

// ── Events ──────────────────────────────────────────────────────────

export type InspectorEvent =
  | { type: "RETRY" }
  | {
      type: "REFRESH_CONTEXT";
      allTickets: Ticket[];
      columns: BoardColumn[];
    }
  | {
      type: "SEND_MESSAGE";
      text: string;
      now: string;
      turnId: string;
    };

// ── Context + Input ─────────────────────────────────────────────────

export interface InspectorContext {
  epicSnapshotId: string;
  // Inputs (kept on context so REFRESH_CONTEXT can update them without
  // re-instantiating the machine).
  allTickets: Ticket[];
  columns: BoardColumn[];
  // Loaded once the `loadInspectorContextActor` resolves:
  snapshot: EpicSnapshot | null;
  liveTickets: Ticket[];
  drift: DriftReport | null;
  // Conversation state — appended to on every round:
  transcript: InspectorTurn[];
  memories: EpicMemory[];
  // Latest error (load or turn). Cleared on successful round / RETRY.
  error: string | null;
}

export interface InspectorInput {
  epicSnapshotId: string;
  allTickets: Ticket[];
  columns: BoardColumn[];
}

// ── Helpers ─────────────────────────────────────────────────────────

const memoryFromInsight = (
  insight: { content: string; tags: string[]; source: EpicMemorySource },
  epicSnapshotId: string,
  orgId: string,
  now: string,
): EpicMemory => ({
  id: crypto.randomUUID(),
  orgId,
  epicSnapshotId,
  content: insight.content,
  tags: insight.tags,
  source: insight.source,
  createdAt: now,
});

// ── Machine ─────────────────────────────────────────────────────────

export const inspectorMachine = setup({
  types: {
    context: {} as InspectorContext,
    events: {} as InspectorEvent,
    input: {} as InspectorInput,
  },

  actors: {
    loadInspectorContextActor: fromPromise<
      LoadInspectorContextOutput,
      LoadInspectorContextInput
    >(async () => {
      throw new Error("loadInspectorContextActor not provided");
    }),
    inspectorActor: fromPromise<InspectorTurnOutput, InspectorTurnInput>(
      async () => {
        throw new Error("inspectorActor not provided");
      },
    ),
  },

  actions: {
    captureLoadError: assign({
      error: (_, params: { message: string }) => params.message,
    }),
    captureTurnError: assign({
      error: (_, params: { message: string }) => params.message,
    }),
    appendUserTurn: assign({
      transcript: ({ context }, params: { turn: InspectorTurn }) => [
        ...context.transcript,
        params.turn,
      ],
      error: () => null,
    }),
    refreshInputs: assign((_, params: { allTickets: Ticket[]; columns: BoardColumn[] }) => ({
      allTickets: params.allTickets,
      columns: params.columns,
    })),
    clearError: assign({ error: () => null }),
  },

  guards: {
    hasSnapshot: ({ context }) => context.snapshot !== null,
  },
}).createMachine({
  id: "inspector",

  context: ({ input }) => ({
    epicSnapshotId: input.epicSnapshotId,
    allTickets: input.allTickets,
    columns: input.columns,
    snapshot: null,
    liveTickets: [],
    drift: null,
    transcript: [],
    memories: [],
    error: null,
  }),

  initial: "loadingContext",

  states: {
    loadingContext: {
      invoke: {
        id: "loadCtx",
        src: "loadInspectorContextActor",
        input: ({ context }) => ({
          epicSnapshotId: context.epicSnapshotId,
          allTickets: context.allTickets,
          columns: context.columns,
        }),
        onDone: {
          target: "ready",
          actions: assign(({ event }) => ({
            snapshot: event.output.snapshot,
            liveTickets: event.output.liveTickets,
            columns: event.output.columns,
            drift: event.output.drift,
            transcript: event.output.transcript,
            memories: event.output.memories,
            error: null,
          })),
        },
        onError: {
          target: "failed",
          actions: {
            type: "captureLoadError",
            params: ({ event }) => ({
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Failed to load Inspector context",
            }),
          },
        },
      },
    },

    failed: {
      on: {
        RETRY: { target: "loadingContext", actions: "clearError" },
      },
    },

    ready: {
      on: {
        SEND_MESSAGE: {
          target: "awaitingInspector",
          guard: "hasSnapshot",
          actions: {
            type: "appendUserTurn",
            params: ({ event }) => ({
              turn: {
                id: event.turnId,
                role: "user" as const,
                text: event.text,
                createdAt: event.now,
              },
            }),
          },
        },
        REFRESH_CONTEXT: {
          target: "loadingContext",
          actions: {
            type: "refreshInputs",
            params: ({ event }) => ({
              allTickets: event.allTickets,
              columns: event.columns,
            }),
          },
        },
      },
    },

    awaitingInspector: {
      invoke: {
        id: "inspect",
        src: "inspectorActor",
        input: ({ context }) => {
          if (!context.snapshot || !context.drift) {
            throw new Error("Inspector invoked without loaded context");
          }
          const userMessage =
            context.transcript[context.transcript.length - 1]?.text ?? "";
          return {
            snapshot: context.snapshot,
            liveTickets: context.liveTickets,
            columns: context.columns,
            drift: context.drift,
            transcript: context.transcript,
            memories: context.memories,
            userMessage,
          };
        },
        onDone: {
          target: "ready",
          actions: assign(({ context, event }) => {
            if (!context.snapshot) return {};
            const now = new Date().toISOString();
            const inspectorTurn: InspectorTurn = {
              id: crypto.randomUUID(),
              role: "inspector",
              text: event.output.reply,
              createdAt: now,
            };
            const newMemories = event.output.insightsToSave.map((i) =>
              memoryFromInsight(
                i,
                context.epicSnapshotId,
                context.snapshot!.orgId,
                now,
              ),
            );
            return {
              transcript: [...context.transcript, inspectorTurn],
              memories: [...newMemories, ...context.memories],
              error: null,
            };
          }),
        },
        onError: {
          target: "ready",
          actions: {
            type: "captureTurnError",
            params: ({ event }) => ({
              message:
                event.error instanceof Error
                  ? event.error.message
                  : "Inspector turn failed",
            }),
          },
        },
      },
    },
  },
});

export type InspectorMachine = typeof inspectorMachine;
