import { assign, setup } from "xstate";
import type { AiOrchestratorContext, OrchestratorSuggestion } from "../types";

export type AiOrchestratorEvent =
  | { type: "START_ANALYSIS"; requirement: string }
  | {
      type: "ANALYSIS_COMPLETED";
      refinementDraft: string;
      planDraft: string;
      suggestion: OrchestratorSuggestion;
    }
  | { type: "ANALYSIS_FAILED"; reason: string }
  | { type: "CONTROLLER_ALERTED"; alert: string }
  | { type: "APPROVE_SUGGESTION" }
  | { type: "REJECT_SUGGESTION"; reason: string }
  | { type: "RETRY" };

export const aiOrchestratorMachine = setup({
  types: {
    context: {} as AiOrchestratorContext,
    events: {} as AiOrchestratorEvent,
  },
  actions: {
    cacheRequirement: assign({
      requirement: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "START_ANALYSIS" ? event.requirement : "",
      rejectionReason: () => null,
      controllerAlert: () => null,
    }),
    cacheDrafts: assign({
      refinementDraft: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "ANALYSIS_COMPLETED" ? event.refinementDraft : null,
      planDraft: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "ANALYSIS_COMPLETED" ? event.planDraft : null,
      suggestion: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "ANALYSIS_COMPLETED" ? event.suggestion : null,
    }),
    cacheControllerAlert: assign({
      controllerAlert: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "CONTROLLER_ALERTED" ? event.alert : null,
    }),
    cacheRejectionReason: assign({
      rejectionReason: ({ event }: { event: AiOrchestratorEvent }) =>
        event.type === "REJECT_SUGGESTION" ? event.reason : null,
    }),
  },
}).createMachine({
  id: "aiOrchestrator",
  initial: "idle",
  context: {
    requirement: "",
    refinementDraft: null,
    planDraft: null,
    controllerAlert: null,
    suggestion: null,
    rejectionReason: null,
  },
  states: {
    idle: {
      on: {
        START_ANALYSIS: {
          target: "researching",
          actions: "cacheRequirement",
        },
      },
    },
    researching: {
      on: {
        ANALYSIS_COMPLETED: {
          target: "awaitingHumanApproval",
          actions: "cacheDrafts",
        },
        ANALYSIS_FAILED: "failed",
      },
    },
    awaitingHumanApproval: {
      on: {
        CONTROLLER_ALERTED: {
          target: "controllerReview",
          actions: "cacheControllerAlert",
        },
        APPROVE_SUGGESTION: "approved",
        REJECT_SUGGESTION: {
          target: "rejected",
          actions: "cacheRejectionReason",
        },
      },
    },
    controllerReview: {
      on: {
        APPROVE_SUGGESTION: "approved",
        REJECT_SUGGESTION: {
          target: "rejected",
          actions: "cacheRejectionReason",
        },
      },
    },
    approved: {
      type: "final",
    },
    rejected: {
      on: {
        RETRY: "researching",
      },
    },
    failed: {
      on: {
        RETRY: "researching",
      },
    },
  },
});
