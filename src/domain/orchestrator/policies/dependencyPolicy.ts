/**
 * Dependency policy — pure domain logic over `TicketProposal.dependencies`.
 *
 * `blockedBy` edges form a DAG that drives Phase 4 slicing order
 * (a ticket cannot be placed before its blockers are placed).
 * `relatedTo` and `duplicates` are documentation-only and ignored here.
 */

import type { ProposalId, TicketProposal } from "../types";

export interface DependencyCycleError extends Error {
  /** Ordered list of proposal ids that form the cycle, last element repeats the first. */
  cycle: ProposalId[];
}

function isCycleError(err: unknown): err is DependencyCycleError {
  return err instanceof Error && Array.isArray((err as { cycle?: unknown }).cycle);
}

/**
 * Returns the proposals in topological order — every `blockedBy` target appears
 * before the proposal that declares it. Throws a `DependencyCycleError` if the
 * `blockedBy` graph contains a cycle. Proposals that reference unknown ids are
 * silently skipped (treated as already-satisfied external blockers).
 */
export function topologicalSort(proposals: TicketProposal[]): TicketProposal[] {
  const byId = new Map(proposals.map((p) => [p.id, p]));
  const result: TicketProposal[] = [];
  const visited = new Set<ProposalId>();
  const onStack = new Set<ProposalId>();

  const visit = (id: ProposalId, path: ProposalId[]): void => {
    if (visited.has(id)) return;
    if (onStack.has(id)) {
      const start = path.indexOf(id);
      const cycle = start >= 0 ? [...path.slice(start), id] : [id];
      const err = new Error(
        `Dependency cycle detected: ${cycle.join(" → ")}`,
      ) as DependencyCycleError;
      err.cycle = cycle;
      throw err;
    }
    const proposal = byId.get(id);
    if (!proposal) return;
    onStack.add(id);
    for (const dep of proposal.dependencies ?? []) {
      if (dep.kind === "blockedBy") {
        visit(dep.targetProposalId, [...path, id]);
      }
    }
    onStack.delete(id);
    visited.add(id);
    result.push(proposal);
  };

  for (const p of proposals) visit(p.id, []);
  return result;
}

/**
 * Non-throwing introspection helper. Returns all cycles found in the `blockedBy`
 * graph (empty list when the graph is acyclic). Used by UI validation before
 * triggering Phase 4 to surface specific cycles to the PO.
 */
export function detectCycles(proposals: TicketProposal[]): ProposalId[][] {
  try {
    topologicalSort(proposals);
    return [];
  } catch (err) {
    if (isCycleError(err)) return [err.cycle];
    throw err;
  }
}

/**
 * Indexes a proposal list by id, panicking on duplicate ids (which would
 * silently corrupt downstream slicing logic). Pure helper exposed so callers
 * can validate input cleanliness before invoking the slicing algorithm.
 */
export function indexById(proposals: TicketProposal[]): Map<ProposalId, TicketProposal> {
  const map = new Map<ProposalId, TicketProposal>();
  for (const p of proposals) {
    if (map.has(p.id)) {
      throw new Error(`Duplicate proposal id: ${p.id}`);
    }
    map.set(p.id, p);
  }
  return map;
}
