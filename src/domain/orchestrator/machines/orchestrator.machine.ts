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
  BlueprintMutation,
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
  RefinementMutation,
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
          | "storyPoints"
          | "risks"
          | "hierarchyType"
        >
      >;
      now: string;
    }
  | { type: "ADVANCE_TO_REFINE"; now: string }
  | { type: "BACK_TO_BRAINSTORM"; now: string }
  | { type: "REDRAFT_BACKLOG"; now: string }
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
  | { type: "BACK_TO_REFINE"; now: string }
  // Commit / lifecycle
  | { type: "COMMIT_EPIC"; now: string }
  | { type: "ABANDON_DRAFT"; now: string }
  | { type: "RETRY"; now: string }
  // ── Slice Q: AI-as-actor ───────────────────────────────────────────
  | { type: "SET_AI_MODE"; mode: "execute" | "confirm" }
  | { type: "APPLY_PENDING_BLUEPRINT_MUTATIONS"; now: string }
  | { type: "DISCARD_PENDING_BLUEPRINT_MUTATIONS" }
  | { type: "APPLY_PENDING_REFINEMENT_MUTATIONS"; now: string }
  | { type: "DISCARD_PENDING_REFINEMENT_MUTATIONS" }
  | { type: "CLEAR_AI_TOUCH" }
  // ── Slice S: phase restoration on session resume ───────────────────
  | { type: "RESUME_PHASE" };

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
  /**
   * UI-controlled mode for how AI-proposed mutations are handled:
   * - "execute" (default): mutations apply immediately on chat reply.
   * - "confirm": mutations land in `pending*Mutations` for the PO to accept/reject.
   * Ephemeral — not persisted on the draft. Defaults to "execute" on each session boot.
   */
  aiMode: "execute" | "confirm";
  pendingBlueprintMutations: BlueprintMutation[];
  pendingRefinementMutations: RefinementMutation[];
  /**
   * Ticket ids the AI just touched (added / patched / reordered). The UI reads
   * this to drive a 2s pulse animation, then dispatches `CLEAR_AI_TOUCH`.
   * Ephemeral — not persisted on the draft.
   */
  aiTouchedTicketIds: ProposalId[];
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

function uidProposal(): string {
  if (typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto) {
    return `prop-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `prop-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Extract a human-readable message from an unknown error. Handles Error,
 * ApolloError (graphQLErrors[]/networkError), plain object, and string shapes
 * — surfaces something useful instead of "undefined" when the LLM provider
 * (LM Studio, Gemini) returns a malformed body that LangChain re-throws with
 * an empty `.message`.
 */
function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "string" && err.trim()) return err;
  if (err && typeof err === "object") {
    const e = err as {
      message?: unknown;
      graphQLErrors?: Array<{ message?: unknown }>;
      networkError?: { message?: unknown; result?: { errors?: Array<{ message?: unknown }> } };
      cause?: unknown;
    };
    const gql = e.graphQLErrors?.find((g) => typeof g?.message === "string" && g.message);
    if (gql && typeof gql.message === "string") return gql.message;
    const netResult = e.networkError?.result?.errors?.find(
      (g) => typeof g?.message === "string" && g.message,
    );
    if (netResult && typeof netResult.message === "string") return netResult.message;
    if (typeof e.networkError?.message === "string" && e.networkError.message) {
      return e.networkError.message;
    }
    if (typeof e.message === "string" && e.message.trim()) return e.message;
    if (e.cause) {
      const causeMsg = extractErrorMessage(e.cause, "");
      if (causeMsg) return causeMsg;
    }
  }
  return fallback;
}

/**
 * Apply a single AI-proposed blueprint mutation to a backlog. Returns the
 * next backlog plus the set of ticket ids touched (used to drive the pulse
 * animation). Defensive: silently no-ops on invalid references rather than
 * throwing — the AI may hallucinate ids.
 */
export function applyBlueprintMutation(
  backlog: BacklogProposal,
  m: BlueprintMutation,
): { backlog: BacklogProposal; touchedIds: ProposalId[] } {
  switch (m.kind) {
    case "addTicket": {
      const newTicket: TicketProposal = {
        id: uidProposal(),
        hierarchyType: m.hierarchyType,
        title: m.title,
        oneLiner: m.oneLiner,
        description: "",
        label: m.label,
        storyPoints: null,
        risks: [],
        refined: false,
        transcript: [],
      };
      const tickets = [...backlog.tickets];
      if (typeof m.afterTicketId === "string") {
        const idx = tickets.findIndex((t) => t.id === m.afterTicketId);
        if (idx >= 0) tickets.splice(idx + 1, 0, newTicket);
        else tickets.push(newTicket);
      } else {
        tickets.push(newTicket);
      }
      return { backlog: { ...backlog, tickets }, touchedIds: [newTicket.id] };
    }
    case "removeTicket": {
      const exists = backlog.tickets.some((t) => t.id === m.ticketId);
      if (!exists) return { backlog, touchedIds: [] };
      return {
        backlog: { ...backlog, tickets: backlog.tickets.filter((t) => t.id !== m.ticketId) },
        touchedIds: [],
      };
    }
    case "renameTicket": {
      const patch: Partial<TicketProposal> = {};
      if (m.title !== undefined) patch.title = m.title;
      if (m.oneLiner !== undefined) patch.oneLiner = m.oneLiner;
      if (Object.keys(patch).length === 0) return { backlog, touchedIds: [] };
      return {
        backlog: patchTicket(backlog, m.ticketId, patch),
        touchedIds: [m.ticketId],
      };
    }
    case "changeLabel": {
      return {
        backlog: patchTicket(backlog, m.ticketId, { label: m.label }),
        touchedIds: [m.ticketId],
      };
    }
    case "reorderTicket": {
      const idx = backlog.tickets.findIndex((t) => t.id === m.ticketId);
      if (idx < 0) return { backlog, touchedIds: [] };
      const target = Math.max(0, Math.min(backlog.tickets.length - 1, m.newIndex));
      if (idx === target) return { backlog, touchedIds: [] };
      const tickets = [...backlog.tickets];
      const [moved] = tickets.splice(idx, 1);
      tickets.splice(target, 0, moved);
      return { backlog: { ...backlog, tickets }, touchedIds: [m.ticketId] };
    }
    case "editEpicTitle": {
      return { backlog: { ...backlog, epicTitle: m.title }, touchedIds: [] };
    }
    case "editEpicDescription": {
      return { backlog: { ...backlog, epicDescription: m.description }, touchedIds: [] };
    }
    case "addDependency": {
      const exists = backlog.tickets.some((t) => t.id === m.sourceTicketId);
      const targetExists = backlog.tickets.some((t) => t.id === m.targetTicketId);
      if (!exists || !targetExists || m.sourceTicketId === m.targetTicketId)
        return { backlog, touchedIds: [] };
      const next = backlog.tickets.map((t) => {
        if (t.id !== m.sourceTicketId) return t;
        const deps = t.dependencies ?? [];
        const dup = deps.some(
          (d) => d.kind === m.linkKind && d.targetProposalId === m.targetTicketId,
        );
        if (dup) return t;
        return {
          ...t,
          dependencies: [
            ...deps,
            { kind: m.linkKind, targetProposalId: m.targetTicketId },
          ],
        };
      });
      return {
        backlog: { ...backlog, tickets: next },
        touchedIds: [m.sourceTicketId],
      };
    }
    case "removeDependency": {
      const next = backlog.tickets.map((t) => {
        if (t.id !== m.sourceTicketId) return t;
        const deps = t.dependencies ?? [];
        return {
          ...t,
          dependencies: deps.filter(
            (d) =>
              !(d.kind === m.linkKind && d.targetProposalId === m.targetTicketId),
          ),
        };
      });
      return {
        backlog: { ...backlog, tickets: next },
        touchedIds: [m.sourceTicketId],
      };
    }
  }
}

export function applyBlueprintMutations(
  backlog: BacklogProposal,
  mutations: BlueprintMutation[],
): { backlog: BacklogProposal; touchedIds: ProposalId[] } {
  let current = backlog;
  const touched: ProposalId[] = [];
  for (const m of mutations) {
    const { backlog: next, touchedIds } = applyBlueprintMutation(current, m);
    current = next;
    for (const id of touchedIds) {
      if (!touched.includes(id)) touched.push(id);
    }
  }
  return { backlog: current, touchedIds: touched };
}

export function applyRefinementMutation(
  ticket: TicketProposal,
  m: RefinementMutation,
): TicketProposal {
  switch (m.kind) {
    case "setDescription":
      return { ...ticket, description: m.description };
    case "setAcceptanceCriteria":
      return { ...ticket, acceptanceCriteria: m.acceptanceCriteria };
    case "setStoryPoints":
      return { ...ticket, storyPoints: m.storyPoints };
    case "setLabel":
      return { ...ticket, label: m.label };
    case "setDiscipline":
      return { ...ticket, discipline: m.discipline };
    case "replaceRisks":
      return { ...ticket, risks: m.risks };
  }
}

export function applyRefinementMutations(
  ticket: TicketProposal,
  mutations: RefinementMutation[],
): TicketProposal {
  return mutations.reduce(applyRefinementMutation, ticket);
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
    // True when the controller has already analyzed this ticket but the user hasn't
    // approved yet. storyPoints is null on architect output (explicitly typed as
    // nullable in the schema, set null by mock architect) and always set to a
    // non-null Fibonacci value by the controller — making it the most reliable
    // "controller ran" signal regardless of AC content.
    currentTicketHasControllerData: ({ context }) => {
      const t = currentRefinementTicket(context.draft);
      return t !== null && t.storyPoints !== null;
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
      const mutations = params.output.mutations ?? [];
      // Execute mode: apply mutations immediately + track touched ids for pulse.
      // Confirm mode: stage them for the PO to approve/reject.
      if (context.aiMode === "execute" && context.draft.backlog && mutations.length > 0) {
        const { backlog: nextBacklog, touchedIds } = applyBlueprintMutations(
          context.draft.backlog,
          mutations,
        );
        return {
          draft: {
            ...context.draft,
            backlog: nextBacklog,
            blueprintTranscript: [...context.draft.blueprintTranscript, turn],
            updatedAt: params.now,
          },
          aiTouchedTicketIds: touchedIds,
          pendingBlueprintMutations: [],
          error: null,
        };
      }
      return {
        draft: {
          ...context.draft,
          blueprintTranscript: [...context.draft.blueprintTranscript, turn],
          updatedAt: params.now,
        },
        pendingBlueprintMutations:
          context.aiMode === "confirm" ? mutations : context.pendingBlueprintMutations,
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
      const mutations = params.output.mutations ?? [];
      // Execute mode: apply field edits in place + pulse current ticket.
      // Confirm mode: stage in pendingRefinementMutations for review.
      if (context.aiMode === "execute" && mutations.length > 0) {
        const nextTicket = applyRefinementMutations(ticket, mutations);
        const withTurn: TicketProposal = {
          ...nextTicket,
          transcript: [...(nextTicket.transcript ?? []), turn],
        };
        return {
          draft: withBacklog(
            context.draft,
            patchTicket(context.draft.backlog, ticket.id, withTurn),
            params.now,
          ),
          aiTouchedTicketIds: [ticket.id],
          pendingRefinementMutations: [],
          error: null,
        };
      }
      return {
        draft: withBacklog(
          context.draft,
          patchTicket(context.draft.backlog, ticket.id, {
            transcript: [...(ticket.transcript ?? []), turn],
          }),
          params.now,
        ),
        pendingRefinementMutations:
          context.aiMode === "confirm" ? mutations : context.pendingRefinementMutations,
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
        label: event.ticket.label ?? "developer",
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
      // Reset the refinement cursor so re-entry to Phase 3 starts at the top.
      // Refined flags on tickets are preserved — re-entering replays approvals
      // via the `currentTicketAlreadyRefined` guard.
      const note: BrainstormTurn = {
        id: cryptoRandomId(),
        role: "analyst",
        text: "PO stepped back from refinement to revise the backlog. Pick up where you left off whenever you're ready.",
        createdAt: event.now,
      };
      return {
        draft: patchDraft(
          context.draft,
          {
            phase: "phase2Structuring",
            refinementCursor: 0,
            blueprintTranscript: [...context.draft.blueprintTranscript, note],
          },
          event.now,
        ),
      };
    }),

    clearBacklogForRedraft: assign(({ context, event }) => {
      if (event.type !== "REDRAFT_BACKLOG") return {};
      // Drop the backlog so `generatingBacklog`'s `backlogNonEmpty` skip-guard
      // doesn't short-circuit straight back to reviewingBulk. The blueprint
      // transcript is preserved and passed to the Architect as `hints` so the
      // redraft reacts to the PO's feedback.
      const note: BrainstormTurn = {
        id: cryptoRandomId(),
        role: "analyst",
        text: "Redrafting the backlog from your feedback. One moment…",
        createdAt: event.now,
      };
      return {
        draft: patchDraft(
          context.draft,
          {
            backlog: null,
            blueprintTranscript: [...context.draft.blueprintTranscript, note],
          },
          event.now,
        ),
      };
    }),

    enterPhase1FromPhase2: assign(({ context, event }) => {
      if (event.type !== "BACK_TO_BRAINSTORM") return {};
      // No artifact to clear — Phase 1 produces `brainstormSummary` which the
      // user may want to refine, not regenerate. Append a synthetic note so
      // the Analyst has context on the next round.
      const note: BrainstormTurn = {
        id: cryptoRandomId(),
        role: "analyst",
        text: "PO returned from backlog drafting. Feel free to add context or revise the summary before re-structuring.",
        createdAt: event.now,
      };
      return {
        draft: patchDraft(
          context.draft,
          {
            phase: "phase1Brainstorming",
            transcript: [...context.draft.transcript, note],
          },
          event.now,
        ),
      };
    }),

    enterPhase3FromPhase4: assign(({ context, event }) => {
      if (event.type !== "BACK_TO_REFINE") return {};
      // Clear the stale sprint plan — re-entering Phase 4 will regenerate it
      // against whatever refinements the PO changes. plannerTranscript is
      // kept as a record of the prior planning conversation.
      return {
        draft: patchDraft(
          context.draft,
          { phase: "phase3Refining", sprintPlan: null },
          event.now,
        ),
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

    // ── Slice Q actions ───────────────────────────────────────────────
    setAiMode: assign(({ event }) => {
      if (event.type !== "SET_AI_MODE") return {};
      return { aiMode: event.mode };
    }),

    applyPendingBlueprintMutations: assign(({ context, event }) => {
      if (event.type !== "APPLY_PENDING_BLUEPRINT_MUTATIONS" || !context.draft.backlog)
        return {};
      const { backlog: nextBacklog, touchedIds } = applyBlueprintMutations(
        context.draft.backlog,
        context.pendingBlueprintMutations,
      );
      return {
        draft: {
          ...context.draft,
          backlog: nextBacklog,
          updatedAt: event.now,
        },
        pendingBlueprintMutations: [],
        aiTouchedTicketIds: touchedIds,
      };
    }),

    discardPendingBlueprintMutations: assign(() => ({
      pendingBlueprintMutations: [],
    })),

    applyPendingRefinementMutations: assign(({ context, event }) => {
      if (
        event.type !== "APPLY_PENDING_REFINEMENT_MUTATIONS" ||
        !context.draft.backlog
      )
        return {};
      const ticket = currentRefinementTicket(context.draft);
      if (!ticket) return {};
      const nextTicket = applyRefinementMutations(
        ticket,
        context.pendingRefinementMutations,
      );
      return {
        draft: withBacklog(
          context.draft,
          patchTicket(context.draft.backlog, ticket.id, nextTicket),
          event.now,
        ),
        pendingRefinementMutations: [],
        aiTouchedTicketIds: [ticket.id],
      };
    }),

    discardPendingRefinementMutations: assign(() => ({
      pendingRefinementMutations: [],
    })),

    clearAiTouch: assign(() => ({ aiTouchedTicketIds: [] })),
  },
}).createMachine({
  id: "orchestrator",
  initial: "workflow",

  context: ({ input }) => ({
    draft: input.draft,
    error: null,
    capacities: input.capacities ?? [],
    aiMode: "execute",
    pendingBlueprintMutations: [],
    pendingRefinementMutations: [],
    aiTouchedTicketIds: [],
  }),

  states: {
    workflow: {
      initial: "phase1Brainstorming",

      on: {
        ABANDON_DRAFT: {
          target: ".abandoned",
          actions: { type: "markAbandoned" },
        },
        // Slice Q — mutation control events are valid in any workflow state.
        SET_AI_MODE: { actions: "setAiMode" },
        CLEAR_AI_TOUCH: { actions: "clearAiTouch" },
        APPLY_PENDING_BLUEPRINT_MUTATIONS: {
          actions: "applyPendingBlueprintMutations",
        },
        DISCARD_PENDING_BLUEPRINT_MUTATIONS: {
          actions: "discardPendingBlueprintMutations",
        },
        APPLY_PENDING_REFINEMENT_MUTATIONS: {
          actions: "applyPendingRefinementMutations",
        },
        DISCARD_PENDING_REFINEMENT_MUTATIONS: {
          actions: "discardPendingRefinementMutations",
        },
        // Slice S — RESUME_PHASE fires once on session boot. Routes to the
        // phase recorded in draft.phase without running any enter-actions
        // (which would reset cursor/sprintPlan/etc.). Phase entry guards
        // (backlogNonEmpty, planExists, decideTicket always-array) handle
        // sub-state resolution from the loaded draft data.
        RESUME_PHASE: [
          {
            guard: ({ context }) => context.draft.phase === "phase2Structuring",
            target: ".phase2Structuring",
          },
          {
            guard: ({ context }) => context.draft.phase === "phase3Refining",
            target: ".phase3Refining",
          },
          {
            guard: ({ context }) => context.draft.phase === "phase4SprintPlanning",
            target: ".phase4SprintPlanning",
          },
        ],
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
              after: {
                45000: {
                  target: "#orchestrator.workflow.error",
                  actions: { type: "captureError", params: { message: "Analyst timed out — AI didn't respond. Try again." } },
                },
              },
              on: {
                RETRY: {
                  target: "awaitingAnalyst",
                  actions: "clearError",
                },
              },
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
                      message: extractErrorMessage(event.error, "Analyst failed to respond"),
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
              after: {
                120000: {
                  target: "#orchestrator.workflow.error",
                  actions: { type: "captureError", params: { message: "Architect timed out — AI didn't respond. Try again." } },
                },
              },
              invoke: {
                src: "architectActor",
                input: ({ context }) => {
                  if (!context.draft.brainstormSummary) {
                    throw new Error("No brainstorm summary");
                  }
                  return {
                    summary: context.draft.brainstormSummary,
                    hints: context.draft.blueprintTranscript,
                  };
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
                      message: extractErrorMessage(event.error, "Architect failed to generate backlog"),
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
                REDRAFT_BACKLOG: {
                  target: "generatingBacklog",
                  actions: "clearBacklogForRedraft",
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
              after: {
                25000: {
                  target: "#orchestrator.workflow.error",
                  actions: { type: "captureError", params: { message: "Blueprint assistant timed out. Try again." } },
                },
              },
              on: {
                RETRY: {
                  target: "awaitingBlueprintReply",
                  actions: "clearError",
                },
              },
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
                      message: extractErrorMessage(event.error, "Blueprint assistant failed"),
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
                {
                  guard: "currentTicketHasControllerData",
                  target: "awaitingTicketApproval",
                },
                { target: "refiningTicket" },
              ],
            },

            refiningTicket: {
              after: {
                // 30s → 95s for parity with controllerGraph's 90s AbortSignal +
                // a small buffer for the structured-AC payload. Local Gemma 4B
                // routinely exceeds the old budget on the new schema.
                95000: {
                  target: "#orchestrator.workflow.error",
                  actions: { type: "captureError", params: { message: "Controller timed out. Try again." } },
                },
              },
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
                      message: extractErrorMessage(event.error, "Controller failed to refine ticket"),
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
              after: {
                25000: {
                  target: "#orchestrator.workflow.error",
                  actions: { type: "captureError", params: { message: "Refinement assistant timed out. Try again." } },
                },
              },
              on: {
                RETRY: {
                  target: "awaitingRefinementReply",
                  actions: "clearError",
                },
              },
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
                      message: extractErrorMessage(event.error, "Refinement assistant failed"),
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
              after: {
                45000: {
                  target: "#orchestrator.workflow.error",
                  actions: { type: "captureError", params: { message: "Planner timed out. Try again." } },
                },
              },
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
                      message: extractErrorMessage(event.error, "Sprint planner failed"),
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
                COMMIT_EPIC: {
                  target: "#orchestrator.workflow.committing",
                  actions: "markCommitting",
                },
                BACK_TO_REFINE: {
                  target: "#orchestrator.workflow.phase3Refining.readyToCommit",
                  actions: "enterPhase3FromPhase4",
                },
              },
            },

            awaitingPlannerReply: {
              after: {
                25000: {
                  target: "#orchestrator.workflow.error",
                  actions: { type: "captureError", params: { message: "Planner chat timed out. Try again." } },
                },
              },
              on: {
                RETRY: {
                  target: "awaitingPlannerReply",
                  actions: "clearError",
                },
              },
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
                  target: "#orchestrator.workflow.error",
                  actions: {
                    type: "captureError",
                    params: ({ event }) => ({
                      message: extractErrorMessage(event.error, "Planner chat failed"),
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
                target: "phase1Brainstorming.awaitingAnalyst",
                actions: "clearError",
              },
              {
                guard: ({ context }) =>
                  context.draft.phase === "phase2Structuring",
                target: "phase2Structuring.awaitingBlueprintReply",
                actions: "clearError",
              },
              {
                guard: ({ context }) =>
                  context.draft.phase === "phase3Refining",
                target: "phase3Refining.awaitingRefinementReply",
                actions: "clearError",
              },
              {
                guard: ({ context }) =>
                  context.draft.phase === "phase4SprintPlanning",
                target: "phase4SprintPlanning.awaitingPlannerReply",
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
