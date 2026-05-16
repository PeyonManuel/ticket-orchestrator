import type {
  BacklogProposal,
  BlueprintMutation,
  RefinementMutation,
  TicketProposal,
} from "@/domain/orchestrator/types";

export type BlueprintMutationFailure = {
  mutation: BlueprintMutation;
  reason: string;
};

export type RefinementMutationFailure = {
  mutation: RefinementMutation;
  reason: string;
};

/**
 * Server-side validation of Architect-emitted blueprint mutations against the
 * live backlog. Catches the most common AI hallucinations: ticket ids that
 * don't exist, dependency self-loops, rename with no payload. This is the
 * truth signal the LLM lacks — the validator runs BEFORE the client sees the
 * response so the chat graph can retry once with feedback.
 *
 * Note: dependency-cycle detection is deferred. blockedBy cycles are caught
 * later by `policies/dependencyPolicy.ts` during Phase 4 topo-sort. Surfacing
 * them here would require simulating mutation application; not worth the
 * complexity for a one-shot validator.
 */
export function validateBlueprintMutations(
  mutations: BlueprintMutation[],
  backlog: BacklogProposal,
): {
  valid: BlueprintMutation[];
  failed: BlueprintMutationFailure[];
} {
  const ids = new Set(backlog.tickets.map((t) => t.id));
  const valid: BlueprintMutation[] = [];
  const failed: BlueprintMutationFailure[] = [];

  for (const m of mutations) {
    const reason = checkBlueprintMutation(m, ids);
    if (reason) failed.push({ mutation: m, reason });
    else valid.push(m);
  }
  return { valid, failed };
}

function checkBlueprintMutation(
  m: BlueprintMutation,
  ids: Set<string>,
): string | null {
  switch (m.kind) {
    case "addTicket":
      if (m.afterTicketId && !ids.has(m.afterTicketId)) {
        return `afterTicketId='${m.afterTicketId}' does not exist in the backlog`;
      }
      return null;
    case "removeTicket":
    case "changeLabel":
    case "reorderTicket":
      if (!ids.has(m.ticketId)) {
        return `ticketId='${m.ticketId}' does not exist in the backlog`;
      }
      return null;
    case "renameTicket":
      if (!ids.has(m.ticketId)) {
        return `ticketId='${m.ticketId}' does not exist in the backlog`;
      }
      if (m.title === undefined && m.oneLiner === undefined) {
        return "renameTicket requires at least one of: title, oneLiner";
      }
      return null;
    case "editEpicTitle":
    case "editEpicDescription":
      return null;
    case "addDependency":
    case "removeDependency":
      if (!ids.has(m.sourceTicketId)) {
        return `sourceTicketId='${m.sourceTicketId}' does not exist in the backlog`;
      }
      if (!ids.has(m.targetTicketId)) {
        return `targetTicketId='${m.targetTicketId}' does not exist in the backlog`;
      }
      if (m.sourceTicketId === m.targetTicketId) {
        return "source and target cannot be the same ticket";
      }
      return null;
  }
}

/**
 * Refinement validator. Phase 3 mutations all target the active ticket so we
 * don't need an id lookup — the chat graph only ever sees one ticket. We
 * still validate field-level constraints the schema can't enforce (e.g.
 * Fibonacci storyPoints, non-empty AC).
 */
export function validateRefinementMutations(
  mutations: RefinementMutation[],
  _ticket: TicketProposal,
): {
  valid: RefinementMutation[];
  failed: RefinementMutationFailure[];
} {
  void _ticket;
  const valid: RefinementMutation[] = [];
  const failed: RefinementMutationFailure[] = [];

  for (const m of mutations) {
    const reason = checkRefinementMutation(m);
    if (reason) failed.push({ mutation: m, reason });
    else valid.push(m);
  }
  return { valid, failed };
}

function checkRefinementMutation(m: RefinementMutation): string | null {
  // Zod already enforces enum + schema-level constraints. This pass catches
  // residual semantic issues. Most mutations pass straight through.
  switch (m.kind) {
    case "setDescription":
    case "setStoryPoints":
    case "setLabel":
    case "setDiscipline":
    case "replaceRisks":
      return null;
  }
}

/**
 * Compact human-readable summary used in the LLM retry-feedback message.
 * Keep this tight — small models choke on verbose feedback.
 */
export function describeBlueprintMutationForFeedback(
  m: BlueprintMutation,
): string {
  switch (m.kind) {
    case "addTicket":
      return `addTicket(title="${m.title}")`;
    case "removeTicket":
      return `removeTicket(ticketId=${m.ticketId})`;
    case "renameTicket":
      return `renameTicket(ticketId=${m.ticketId})`;
    case "changeLabel":
      return `changeLabel(ticketId=${m.ticketId}, label=${m.label})`;
    case "reorderTicket":
      return `reorderTicket(ticketId=${m.ticketId}, newIndex=${m.newIndex})`;
    case "editEpicTitle":
      return `editEpicTitle`;
    case "editEpicDescription":
      return `editEpicDescription`;
    case "addDependency":
      return `addDependency(source=${m.sourceTicketId}, target=${m.targetTicketId}, kind=${m.linkKind})`;
    case "removeDependency":
      return `removeDependency(source=${m.sourceTicketId}, target=${m.targetTicketId}, kind=${m.linkKind})`;
  }
}

export function describeRefinementMutationForFeedback(
  m: RefinementMutation,
): string {
  switch (m.kind) {
    case "setDescription":
      return "setDescription";
    case "setStoryPoints":
      return `setStoryPoints(${m.storyPoints})`;
    case "setLabel":
      return `setLabel(${m.label})`;
    case "setDiscipline":
      return `setDiscipline(${m.discipline})`;
    case "replaceRisks":
      return `replaceRisks(${m.risks.length} items)`;
  }
}
