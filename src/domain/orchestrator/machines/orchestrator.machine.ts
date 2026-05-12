/**
 * Orchestrator XState machine — pure domain. No I/O, no React, no SDK imports.
 *
 * The actor adapters (analyst / architect / controller / commit) are injected
 * by the presentation layer via `setup({ actors })` so this file works the
 * same with mocks, real LangGraph, or in-memory test doubles.
 *
 * Architecture overview: docs/orchestrator/architecture.md
 */

import { assign, fromPromise, setup } from "xstate";
import type {
  AnalystTurnInput,
  AnalystTurnOutput,
  ArchitectInput,
  ArchitectOutput,
  BacklogProposal,
  BlueprintChatInput,
  BlueprintChatOutput,
  BrainstormTurn,
  ControllerInput,
  ControllerOutput,
  EpicDraft,
  MemberSnapshot,
  PlannerChatInput,
  PlannerChatOutput,
  PlannerInput,
  PlannerOutput,
  ProposalId,
  ProposalLabel,
  ProposalStoryPoints,
  RefinementChatInput,
  RefinementChatOutput,
  SprintSnapshot,
  TeamMemberCapacity,
  TicketProposal,
} from "../types";

// ── Events ──────────────────────────────────────────────────────────

export type OrchestratorEvent =
  // Phase 1
  | { type: "USER_MESSAGE"; text: string; now: string; turnId: string }
  | { type: "STRUCTURE_REQUESTED"; now: string }
  // Phase 2
  | { type: "BLUEPRINT_USER_MESSAGE"; text: string; now: string; turnId: string }
  | { type: "EDIT_EPIC_TITLE"; title: string; now: string }
  | { type: "EDIT_EPIC_DESCRIPTION"; description: string; now: string }
  | {
      type: "ADD_TICKET";
      now: string;
      ticket: {
        id: ProposalId;
        title: string;
        oneLiner?: string;
        label?: ProposalLabel;
        hierarchyType?: "story" | "task";
      };
    }
  | { type: "REMOVE_TICKET"; ticketId: ProposalId; now: string }
  | { type: "REORDER_TICKETS"; orderedIds: ProposalId[]; now: string }
  | {
      type: "PATCH_TICKET";
      ticketId: ProposalId;
      patch: Partial<
        Pick<
          TicketProposal,
          | "title"
          | "oneLiner"
          | "description"
          | "label"
          | "acceptanceCriteria"
          | "storyPoints"
          | "risks"
          | "hierarchyType"
        >
      >;
      now: string;
    }
  | { type: "ADVANCE_TO_REFINE"; now: string }
  | { type: "BACK_TO_BRAINSTORM"; now: string }
  // Phase 3
  | { type: "REFINEMENT_USER_MESSAGE"; text: string; now: string; turnId: string }
  | { type: "BEGIN_REFINEMENT"; now: string }
  | { type: "APPROVE_TICKET"; now: string }
  | { type: "PREVIOUS_TICKET"; now: string }
  | { type: "BACK_TO_BULK"; now: string }
  // Phase 4
  | {
      type: "ADVANCE_TO_PLANNING";
      now: string;
      sprints: SprintSnapshot[];
      members: MemberSnapshot[];
      capacities: TeamMemberCapacity[];
    }
  | { type: "REFRESH_CAPACITIES"; capacities: TeamMemberCapacity[] }
  | { type: "PLANNER_USER_MESSAGE"; text: string; now: string; turnId: string }
  | { type: "REGENERATE_PLAN"; now: string }
  | { type: "BACK_TO_REFINE"; now: string }
  // Commit / lifecycle
  | { type: "COMMIT_EPIC"; now: string }
  | { type: "ABANDON_DRAFT"; now: string }
  | { type: "RETRY"; now: string };

// ── Context ─────────────────────────────────────────────────────────

export interface OrchestratorContext {
  draft: EpicDraft;
  /** Last error message; cleared on RETRY. */
  error: string | null;
  /**
   * Per-member velocity for Phase 4 planning. Ephemeral (not persisted on the
   * draft): recomputed by the presentation layer from current board state when
   * entering or resuming Phase 4, then dispatched in `ADVANCE_TO_PLANNING` or
   * `REFRESH_CAPACITIES`. Always-fresh velocity is desirable; persisting it
   * would risk planning against stale numbers across long-lived sessions.
   */
  capacities: TeamMemberCapacity[];
}

export interface OrchestratorInput {
  draft: EpicDraft;
  /** Seeded by the presentation layer when resuming a Phase 4+ draft. */
  capacities?: TeamMemberCapacity[];
}

// ── Helpers (pure) ──────────────────────────────────────────────────

function patchDraft(draft: EpicDraft, patch: Partial<EpicDraft>, now: string): EpicDraft {
  return { ...draft, ...patch, updatedAt: now };
}

function appendTurn(draft: EpicDraft, turn: BrainstormTurn): EpicDraft {
  return { ...draft, transcript: [...draft.transcript, turn], updatedAt: turn.createdAt };
}

function withBacklog(draft: EpicDraft, backlog: BacklogProposal, now: string): EpicDraft {
  return { ...draft, backlog, updatedAt: now };
}

function patchTicket(
  backlog: BacklogProposal,
  ticketId: ProposalId,
  patch: Partial<TicketProposal>,
): BacklogProposal {
  return {
    ...backlog,
    tickets: backlog.tickets.map((t) =>
      t.id === ticketId ? { ...t, ...patch } : t,
    ),
  };
}

function currentRefinementTicket(draft: EpicDraft): TicketProposal | null {
  if (!draft.backlog) return null;
  return draft.backlog.tickets[draft.refinementCursor] ?? null;
}

// ── Setup ───────────────────────────────────────────────────────────

export const orchestratorMachine = setup({
  types: {
    context: {} as OrchestratorContext,
    events: {} as OrchestratorEvent,
    input: {} as OrchestratorInput,
  },

  /**
   * Actors are placeholders here. The presentation layer overrides each one
   * with a concrete implementation (mock or LangGraph) via `provide({ actors })`.
   * Default impls reject so misconfiguration is loud.
   */
  actors: {
    analystActor: fromPromise<AnalystTurnOutput, AnalystTurnInput>(async () => {
      throw new Error("analystActor not provided");
    }),
    architectActor: fromPromise<ArchitectOutput, ArchitectInput>(async () => {
      throw new Error("architectActor not provided");
    }),
    controllerActor: fromPromise<ControllerOutput, ControllerInput>(async () => {
      throw new Error("controllerActor not provided");
    }),
    blueprintChatActor: fromPromise<BlueprintChatOutput, BlueprintChatInput>(async () => {
      throw new Error("blueprintChatActor not provided");
    }),
    refinementChatActor: fromPromise<RefinementChatOutput, RefinementChatInput>(async () => {
      throw new Error("refinementChatActor not provided");
    }),
    plannerActor: fromPromise<PlannerOutput, PlannerInput>(async () => {
      throw new Error("plannerActor not provided");
    }),
    plannerChatActor: fromPromise<PlannerChatOutput, PlannerChatInput>(async () => {
      throw new Error("plannerChatActor not provided");
    }),
  },

  guards: {
    hasBrainstormSummary: ({ context }) => context.draft.brainstormSummary !== null,
    backlogNonEmpty: ({ context }) =>
      (context.draft.backlog?.tickets.length ?? 0) > 0,
    cursorAtEnd: ({ context }) => {
      const total = context.draft.backlog?.tickets.length ?? 0;
      return context.draft.refinementCursor >= total;
    },
    currentTicketAlreadyRefined: ({ context }) => {
      const t = currentRefinementTicket(context.draft);
      return t?.refined === true;
    },
    cursorAtStart: ({ context }) => context.draft.refinementCursor === 0,
    allTicketsApproved: ({ context }) => {
      const tickets = context.draft.backlog?.tickets ?? [];
      return tickets.length > 0 && tickets.every((t) => t.refined);
    },
    planExists: ({ context }) => context.draft.sprintPlan !== null,
  },

  actions: {
    appendUserTurn: assign(({ context, event }) => {
      if (event.type !== "USER_MESSAGE") return {};
      const turn: BrainstormTurn = {
        id: event.turnId,
        role: "user",
        text: event.text,
        createdAt: event.now,
      };
      return { draft: appendTurn(context.draft, turn) };
    }),

    appendAnalystReply: assign(({ context, event }, params: { output: AnalystTurnOutput; now: string }) => {
      void event;
      const turn: BrainstormTurn = {
        id: cryptoRandomId(),
        role: "analyst",
        text: params.output.reply,
        createdAt: params.now,
      };
      const next = appendTurn(context.draft, turn);
      return {
        draft: params.output.summary
          ? { ...next, brainstormSummary: params.output.summary, updatedAt: params.now }
          : next,
        error: null,
      };
    }),

    appendBlueprintUserTurn: assign(({ context, event }) => {
      if (event.type !== "BLUEPRINT_USER_MESSAGE") return {};
      const turn: BrainstormTurn = {
        id: event.turnId,
        role: "user",
        text: event.text,
        createdAt: event.now,
      };
      return {
        draft: {
          ...context.draft,
          blueprintTranscript: [...context.draft.blueprintTranscript, turn],
          updatedAt: event.now,
        },
      };
    }),

    appendBlueprintReply: assign(({ context, event }, params: { output: BlueprintChatOutput; now: string }) => {
      void event;
      const turn: BrainstormTurn = {
        id: cryptoRandomId(),
        role: "analyst",
        text: params.output.reply,
        createdAt: params.now,
      };
      return {
        draft: {
          ...context.draft,
          blueprintTranscript: [...context.draft.blueprintTranscript, turn],
          updatedAt: params.now,
        },
        error: null,
      };
    }),

    appendRefinementUserTurn: assign(({ context, event }) => {
      if (event.type !== "REFINEMENT_USER_MESSAGE" || !context.draft.backlog) return {};
      const ticket = currentRefinementTicket(context.draft);
      if (!ticket) return {};
      const turn: BrainstormTurn = {
        id: event.turnId,
        role: "user",
        text: event.text,
        createdAt: event.now,
      };
      return {
        draft: withBacklog(
          context.draft,
          patchTicket(context.draft.backlog, ticket.id, {
            transcript: [...(ticket.transcript ?? []), turn],
          }),
          event.now,
        ),
      };
    }),

    appendRefinementReply: assign(({ context, event }, params: { output: RefinementChatOutput; now: string }) => {
      void event;
      if (!context.draft.backlog) return {};
      const ticket = currentRefinementTicket(context.draft);
      if (!ticket) return {};
      const turn: BrainstormTurn = {
        id: cryptoRandomId(),
        role: "analyst",
        text: params.output.reply,
        createdAt: params.now,
      };
      return {
        draft: withBacklog(
          context.draft,
          patchTicket(context.draft.backlog, ticket.id, {
            transcript: [...(ticket.transcript ?? []), turn],
          }),
          params.now,
        ),
        error: null,
      };
    }),

    enterPhase4: assign(({ context, event }) => {
      if (event.type !== "ADVANCE_TO_PLANNING") return {};
      return {
        draft: patchDraft(context.draft, {
          phase: "phase4SprintPlanning",
          planningSprints: event.sprints,
          planningMembers: event.members,
        }, event.now),
        capacities: event.capacities,
      };
    }),

    refreshCapacities: assign(({ event }) => {
      if (event.type !== "REFRESH_CAPACITIES") return {};
      return { capacities: event.capacities };
    }),

    clearPlanForRegeneration: assign(({ context, event }) => {
      if (event.type !== "REGENERATE_PLAN") return {};
      return {
        draft: {
          ...context.draft,
          sprintPlan: null,
          updatedAt: event.now,
        },
        error: null,
      };
    }),

    storePlan: assign(({ context, event }, params: { output: PlannerOutput; now: string }) => {
      void event;
      return {
        draft: {
          ...context.draft,
          sprintPlan: params.output,
          updatedAt: params.now,
        },
        error: null,
      };
    }),

    appendPlannerUserTurn: assign(({ context, event }) => {
      if (event.type !== "PLANNER_USER_MESSAGE") return {};
      const turn: BrainstormTurn = {
        id: event.turnId,
        role: "user",
        text: event.text,
        createdAt: event.now,
      };
      return {
        draft: {
          ...context.draft,
          plannerTranscript: [...context.draft.plannerTranscript, turn],
          updatedAt: event.now,
        },
      };
    }),

    appendPlannerReply: assign(({ context, event }, params: { output: PlannerChatOutput; now: string }) => {
      void event;
      const turn: BrainstormTurn = {
        id: cryptoRandomId(),
        role: "analyst",
        text: params.output.reply,
        createdAt: params.now,
      };
      const draft: EpicDraft = {
        ...context.draft,
        plannerTranscript: [...context.draft.plannerTranscript, turn],
        ...(params.output.updatedPlan ? { sprintPlan: params.output.updatedPlan } : {}),
        updatedAt: params.now,
      };
      return { draft, error: null };
    }),

    enterPhase2: assign(({ context, event }) => {
      if (event.type !== "STRUCTURE_REQUESTED") return {};
      return {
        draft: patchDraft(context.draft, { phase: "phase2Structuring" }, event.now),
      };
    }),

    storeBacklog: assign(({ context, event }, params: { output: BacklogProposal; now: string }) => {
      void event;
      const normalized: BacklogProposal = {
        ...params.output,
        tickets: params.output.tickets.map((t) => ({
          ...t,
          transcript: t.transcript ?? [],
        })),
      };
      return { draft: withBacklog(context.draft, normalized, params.now), error: null };
    }),

    addTicket: assign(({ context, event }) => {
      if (event.type !== "ADD_TICKET" || !context.draft.backlog) return {};
      const newTicket: TicketProposal = {
        id: event.ticket.id,
        hierarchyType: event.ticket.hierarchyType ?? "task",
        title: event.ticket.title,
        oneLiner: event.ticket.oneLiner ?? "",
        description: "",
        label: event.ticket.label ?? "frontend",
        acceptanceCriteria: [],
        storyPoints: null,
        risks: [],
        refined: false,
        transcript: [],
      };
      const backlog: BacklogProposal = {
        ...context.draft.backlog,
        tickets: [...context.draft.backlog.tickets, newTicket],
      };
      return { draft: withBacklog(context.draft, backlog, event.now) };
    }),

    removeTicket: assign(({ context, event }) => {
      if (event.type !== "REMOVE_TICKET" || !context.draft.backlog) return {};
      const backlog: BacklogProposal = {
        ...context.draft.backlog,
        tickets: context.draft.backlog.tickets.filter((t) => t.id !== event.ticketId),
      };
      return { draft: withBacklog(context.draft, backlog, event.now) };
    }),

    reorderTickets: assign(({ context, event }) => {
      if (event.type !== "REORDER_TICKETS" || !context.draft.backlog) return {};
      const byId = new Map(context.draft.backlog.tickets.map((t) => [t.id, t] as const));
      const reordered = event.orderedIds
        .map((id) => byId.get(id))
        .filter((t): t is TicketProposal => !!t);
      // Append any tickets not in the orderedIds list at the end (defensive).
      for (const t of context.draft.backlog.tickets) {
        if (!event.orderedIds.includes(t.id)) reordered.push(t);
      }
      return {
        draft: withBacklog(
          context.draft,
          { ...context.draft.backlog, tickets: reordered },
          event.now,
        ),
      };
    }),

    patchTicket: assign(({ context, event }) => {
      if (event.type !== "PATCH_TICKET" || !context.draft.backlog) return {};
      return {
        draft: withBacklog(
          context.draft,
          patchTicket(context.draft.backlog, event.ticketId, event.patch),
          event.now,
        ),
      };
    }),

    editEpicTitle: assign(({ context, event }) => {
      if (event.type !== "EDIT_EPIC_TITLE" || !context.draft.backlog) return {};
      return {
        draft: withBacklog(
          context.draft,
          { ...context.draft.backlog, epicTitle: event.title },
          event.now,
        ),
      };
    }),

    editEpicDescription: assign(({ context, event }) => {
      if (event.type !== "EDIT_EPIC_DESCRIPTION" || !context.draft.backlog) return {};
      return {
        draft: withBacklog(
          context.draft,
          { ...context.draft.backlog, epicDescription: event.description },
          event.now,
        ),
      };
    }),

    enterPhase3: assign(({ context, event }) => {
      if (event.type !== "ADVANCE_TO_REFINE") return {};
      return {
        draft: patchDraft(
          context.draft,
          { phase: "phase3Refining", refinementCursor: 0 },
          event.now,
        ),
      };
    }),

    storeRefinement: assign(({ context, event }, params: { output: ControllerOutput; now: string }) => {
      void event;
      if (!context.draft.backlog) return {};
      const ticket = currentRefinementTicket(context.draft);
      if (!ticket) return {};
      const refined: Partial<TicketProposal> = {
        description: params.output.description,
        acceptanceCriteria: params.output.acceptanceCriteria,
        storyPoints: params.output.storyPoints as ProposalStoryPoints,
        risks: params.output.risks,
      };
      return {
        draft: withBacklog(
          context.draft,
          patchTicket(context.draft.backlog, ticket.id, refined),
          params.now,
        ),
        error: null,
      };
    }),

    markCurrentRefined: assign(({ context, event }) => {
      if (event.type !== "APPROVE_TICKET" || !context.draft.backlog) return {};
      const ticket = currentRefinementTicket(context.draft);
      if (!ticket) return {};
      const next = patchTicket(context.draft.backlog, ticket.id, { refined: true });
      return {
        draft: withBacklog(context.draft, next, event.now),
      };
    }),

    advanceCursor: assign(({ context, event }) => {
      if (event.type !== "APPROVE_TICKET") return {};
      return {
        draft: patchDraft(
          context.draft,
          { refinementCursor: context.draft.refinementCursor + 1 },
          event.now,
        ),
      };
    }),

    rewindCursor: assign(({ context, event }) => {
      if (event.type !== "PREVIOUS_TICKET") return {};
      return {
        draft: patchDraft(
          context.draft,
          { refinementCursor: Math.max(0, context.draft.refinementCursor - 1) },
          event.now,
        ),
      };
    }),

    enterPhase2FromPhase3: assign(({ context, event }) => {
      if (event.type !== "BACK_TO_BULK") return {};
      return {
        draft: patchDraft(context.draft, { phase: "phase2Structuring" }, event.now),
      };
    }),

    enterPhase1FromPhase2: assign(({ context, event }) => {
      if (event.type !== "BACK_TO_BRAINSTORM") return {};
      return {
        draft: patchDraft(context.draft, { phase: "phase1Brainstorming" }, event.now),
      };
    }),

    markCommitting: assign(({ context, event }) => {
      if (event.type !== "COMMIT_EPIC") return {};
      return { draft: patchDraft(context.draft, { phase: "committing" }, event.now) };
    }),

    markCommitted: assign(({ context, event }) => {
      void event;
      const now = new Date().toISOString();
      return { draft: patchDraft(context.draft, { phase: "committed" }, now) };
    }),

    markAbandoned: assign(({ context, event }) => {
      if (event.type !== "ABANDON_DRAFT") return {};
      return { draft: patchDraft(context.draft, { phase: "abandoned" }, event.now) };
    }),

    captureError: assign(({ event }, params: { message: string }) => {
      void event;
      return { error: params.message };
    }),

    clearError: assign(() => ({ error: null })),
  },
}).createMachine({
  id: "orchestrator",
  initial: "workflow",

  context: ({ input }) => ({
    draft: input.draft,
    error: null,
    capacities: input.capacities ?? [],
  }),

  states: {
    workflow: {
      initial: "phase1Brainstorming",

      on: {
        ABANDON_DRAFT: {
          target: ".abandoned",
          actions: { type: "markAbandoned" },
        },
      },

      states: {
        // ── Phase 1 ────────────────────────────────────────────────
        phase1Brainstorming: {
          initial: "awaitingUser",
          states: {
            awaitingUser: {
              on: {
                USER_MESSAGE: {
                  target: "awaitingAnalyst",
                  actions: "appendUserTurn",
                },
                STRUCTURE_REQUESTED: {
                  guard: "hasBrainstormSummary",
                  target: "#orchestrator.workflow.phase2Structuring",
                  actions: "enterPhase2",
                },
              },
            },

            awaitingAnalyst: {
              invoke: {
                src: "analystActor",
                input: ({ context }) => {
                  const lastUser = [...context.draft.transcript]
                    .reverse()
                    .find((t) => t.role === "user");
                  return {
                    transcript: context.draft.transcript,
                    userMessage: lastUser?.text ?? "",
                  };
                },
                onDone: {
                  target: "awaitingUser",
                  actions: {
                    type: "appendAnalystReply",
                    params: ({ event }) => ({
                      output: event.output,
                      now: new Date().toISOString(),
                    }),
                  },
                },
                onError: {
                  target: "#orchestrator.workflow.error",
                  actions: {
                    type: "captureError",
                    params: ({ event }) => ({
                      message:
                        event.error instanceof Error
                          ? event.error.message
                          : "Analyst failed to respond",
                    }),
                  },
                },
              },
            },
          },
        },

        // ── Phase 2 ────────────────────────────────────────────────
        phase2Structuring: {
          initial: "generatingBacklog",
          states: {
            generatingBacklog: {
              always: [
                // Resuming a draft that already has a backlog skips regeneration.
                { guard: "backlogNonEmpty", target: "reviewingBulk" },
              ],
              invoke: {
                src: "architectActor",
                input: ({ context }) => {
                  if (!context.draft.brainstormSummary) {
                    throw new Error("No brainstorm summary");
                  }
                  return { summary: context.draft.brainstormSummary };
                },
                onDone: {
                  target: "reviewingBulk",
                  actions: {
                    type: "storeBacklog",
                    params: ({ event }) => ({
                      output: event.output,
                      now: new Date().toISOString(),
                    }),
                  },
                },
                onError: {
                  target: "#orchestrator.workflow.error",
                  actions: {
                    type: "captureError",
                    params: ({ event }) => ({
                      message:
                        event.error instanceof Error
                          ? event.error.message
                          : "Architect failed to generate backlog",
                    }),
                  },
                },
              },
            },

            reviewingBulk: {
              on: {
                EDIT_EPIC_TITLE: { actions: "editEpicTitle" },
                EDIT_EPIC_DESCRIPTION: { actions: "editEpicDescription" },
                ADD_TICKET: { actions: "addTicket" },
                REMOVE_TICKET: { actions: "removeTicket" },
                REORDER_TICKETS: { actions: "reorderTickets" },
                PATCH_TICKET: { actions: "patchTicket" },
                BACK_TO_BRAINSTORM: {
                  target: "#orchestrator.workflow.phase1Brainstorming.awaitingUser",
                  actions: "enterPhase1FromPhase2",
                },
                ADVANCE_TO_REFINE: {
                  guard: "backlogNonEmpty",
                  target: "#orchestrator.workflow.phase3Refining",
                  actions: "enterPhase3",
                },
                BLUEPRINT_USER_MESSAGE: {
                  target: "awaitingBlueprintReply",
                  actions: "appendBlueprintUserTurn",
                },
              },
            },

            awaitingBlueprintReply: {
              invoke: {
                src: "blueprintChatActor",
                input: ({ context }) => {
                  const lastUser = [...context.draft.blueprintTranscript]
                    .reverse()
                    .find((t) => t.role === "user");
                  return {
                    transcript: context.draft.blueprintTranscript,
                    currentBacklog: context.draft.backlog ?? {
                      epicTitle: "",
                      epicDescription: "",
                      tickets: [],
                    },
                    userMessage: lastUser?.text ?? "",
                  };
                },
                onDone: {
                  target: "reviewingBulk",
                  actions: {
                    type: "appendBlueprintReply",
                    params: ({ event }) => ({
                      output: event.output,
                      now: new Date().toISOString(),
                    }),
                  },
                },
                onError: {
                  target: "#orchestrator.workflow.error",
                  actions: {
                    type: "captureError",
                    params: ({ event }) => ({
                      message:
                        event.error instanceof Error
                          ? event.error.message
                          : "Blueprint assistant failed",
                    }),
                  },
                },
              },
            },
          },
        },

        // ── Phase 3 ────────────────────────────────────────────────
        phase3Refining: {
          initial: "decideTicket",
          on: {
            BACK_TO_BULK: {
              target: "#orchestrator.workflow.phase2Structuring.reviewingBulk",
              actions: "enterPhase2FromPhase3",
            },
          },
          states: {
            decideTicket: {
              always: [
                { guard: "cursorAtEnd", target: "readyToCommit" },
                {
                  guard: "currentTicketAlreadyRefined",
                  target: "awaitingTicketApproval",
                },
                { target: "refiningTicket" },
              ],
            },

            refiningTicket: {
              invoke: {
                src: "controllerActor",
                input: ({ context }) => {
                  const ticket = currentRefinementTicket(context.draft);
                  if (!ticket || !context.draft.backlog) {
                    throw new Error("No ticket to refine");
                  }
                  return { ticket, backlog: context.draft.backlog };
                },
                onDone: {
                  target: "awaitingTicketApproval",
                  actions: {
                    type: "storeRefinement",
                    params: ({ event }) => ({
                      output: event.output,
                      now: new Date().toISOString(),
                    }),
                  },
                },
                onError: {
                  target: "#orchestrator.workflow.error",
                  actions: {
                    type: "captureError",
                    params: ({ event }) => ({
                      message:
                        event.error instanceof Error
                          ? event.error.message
                          : "Controller failed to refine ticket",
                    }),
                  },
                },
              },
            },

            awaitingTicketApproval: {
              on: {
                PATCH_TICKET: { actions: "patchTicket" },
                APPROVE_TICKET: {
                  target: "decideTicket",
                  actions: ["markCurrentRefined", "advanceCursor"],
                },
                PREVIOUS_TICKET: {
                  guard: ({ context }) => context.draft.refinementCursor > 0,
                  target: "decideTicket",
                  actions: "rewindCursor",
                },
                REFINEMENT_USER_MESSAGE: {
                  target: "awaitingRefinementReply",
                  actions: "appendRefinementUserTurn",
                },
              },
            },

            awaitingRefinementReply: {
              invoke: {
                src: "refinementChatActor",
                input: ({ context }) => {
                  const ticket = currentRefinementTicket(context.draft);
                  if (!ticket || !context.draft.backlog) {
                    throw new Error("No ticket to refine");
                  }
                  const lastUser = [...(ticket.transcript ?? [])]
                    .reverse()
                    .find((t) => t.role === "user");
                  return {
                    transcript: ticket.transcript ?? [],
                    ticket,
                    backlog: context.draft.backlog,
                    userMessage: lastUser?.text ?? "",
                  };
                },
                onDone: {
                  target: "awaitingTicketApproval",
                  actions: {
                    type: "appendRefinementReply",
                    params: ({ event }) => ({
                      output: event.output,
                      now: new Date().toISOString(),
                    }),
                  },
                },
                onError: {
                  target: "#orchestrator.workflow.error",
                  actions: {
                    type: "captureError",
                    params: ({ event }) => ({
                      message:
                        event.error instanceof Error
                          ? event.error.message
                          : "Refinement assistant failed",
                    }),
                  },
                },
              },
            },

            readyToCommit: {
              on: {
                ADVANCE_TO_PLANNING: {
                  guard: "allTicketsApproved",
                  target: "#orchestrator.workflow.phase4SprintPlanning",
                  actions: "enterPhase4",
                },
                PREVIOUS_TICKET: {
                  target: "decideTicket",
                  actions: "rewindCursor",
                },
              },
            },
          },
        },

        // ── Phase 4 ────────────────────────────────────────────────
        phase4SprintPlanning: {
          on: {
            REFRESH_CAPACITIES: { actions: "refreshCapacities" },
          },
          initial: "generatingPlan",
          states: {
            generatingPlan: {
              always: [
                { guard: "planExists", target: "reviewingPlan" },
              ],
              invoke: {
                src: "plannerActor",
                input: ({ context }) => ({
                  backlog: context.draft.backlog!,
                  sprints: context.draft.planningSprints,
                  members: context.draft.planningMembers,
                  capacities: context.capacities,
                }),
                onDone: {
                  target: "reviewingPlan",
                  actions: {
                    type: "storePlan",
                    params: ({ event }) => ({
                      output: event.output,
                      now: new Date().toISOString(),
                    }),
                  },
                },
                onError: {
                  target: "#orchestrator.workflow.error",
                  actions: {
                    type: "captureError",
                    params: ({ event }) => ({
                      message:
                        event.error instanceof Error
                          ? event.error.message
                          : "Sprint planner failed",
                    }),
                  },
                },
              },
            },

            reviewingPlan: {
              on: {
                PLANNER_USER_MESSAGE: {
                  target: "awaitingPlannerReply",
                  actions: "appendPlannerUserTurn",
                },
                REGENERATE_PLAN: {
                  target: "generatingPlan",
                  actions: "clearPlanForRegeneration",
                },
                COMMIT_EPIC: {
                  target: "#orchestrator.workflow.committing",
                  actions: "markCommitting",
                },
                BACK_TO_REFINE: {
                  target: "#orchestrator.workflow.phase3Refining.readyToCommit",
                },
              },
            },

            awaitingPlannerReply: {
              invoke: {
                src: "plannerChatActor",
                input: ({ context }) => ({
                  plannerTranscript: context.draft.plannerTranscript,
                  currentPlan: context.draft.sprintPlan!,
                  backlog: context.draft.backlog!,
                  sprints: context.draft.planningSprints,
                  members: context.draft.planningMembers,
                  capacities: context.capacities,
                  userMessage:
                    context.draft.plannerTranscript
                      .filter((t) => t.role === "user")
                      .slice(-1)[0]?.text ?? "",
                }),
                onDone: {
                  target: "reviewingPlan",
                  actions: {
                    type: "appendPlannerReply",
                    params: ({ event }) => ({
                      output: event.output,
                      now: new Date().toISOString(),
                    }),
                  },
                },
                onError: {
                  target: "reviewingPlan",
                  actions: {
                    type: "captureError",
                    params: ({ event }) => ({
                      message:
                        event.error instanceof Error
                          ? event.error.message
                          : "Planner chat failed",
                    }),
                  },
                },
              },
            },
          },
        },

        // ── Commit / Terminal ──────────────────────────────────────
        committing: {
          // Real "write to board" actor is wired in the presentation layer.
          // For now we transition through synchronously via the `commitEpic`
          // action that the React layer dispatches after its mutation succeeds.
          on: {
            // Presentation dispatches a synthetic event when its commit
            // mutation resolves successfully. We model it as a self-event
            // so the machine stays pure (no commit actor injected here).
            COMMIT_EPIC: {
              target: "committed",
              actions: "markCommitted",
            },
          },
        },

        committed: { type: "final" },
        abandoned: { type: "final" },

        // ── Error ──────────────────────────────────────────────────
        error: {
          on: {
            RETRY: [
              {
                guard: ({ context }) =>
                  context.draft.phase === "phase1Brainstorming",
                target: "phase1Brainstorming.awaitingUser",
                actions: "clearError",
              },
              {
                guard: ({ context }) =>
                  context.draft.phase === "phase2Structuring",
                target: "phase2Structuring.reviewingBulk",
                actions: "clearError",
              },
              {
                guard: ({ context }) =>
                  context.draft.phase === "phase3Refining",
                target: "phase3Refining.awaitingTicketApproval",
                actions: "clearError",
              },
              {
                guard: ({ context }) =>
                  context.draft.phase === "phase4SprintPlanning",
                target: "phase4SprintPlanning.reviewingPlan",
                actions: "clearError",
              },
              {
                target: "phase1Brainstorming.awaitingUser",
                actions: "clearError",
              },
            ],
          },
        },
      },
    },
  },
});

// ── Tiny pure helper (avoids importing crypto at module-eval time on edge runtimes) ──

function cryptoRandomId(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export type OrchestratorMachine = typeof orchestratorMachine;
