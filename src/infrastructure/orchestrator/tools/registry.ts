import type { StructuredToolInterface } from "@langchain/core/tools";

/**
 * The shape every Orion tool must conform to — anything `tool()` from
 * `@langchain/core/tools` produces satisfies this interface.
 */
export type OrionTool = StructuredToolInterface;

export type OrionPhase =
  | "phase1"
  | "phase2"
  | "phase3"
  | "phase4"
  | "phase5"
  | "blueprintChat"
  | "refinementChat"
  | "plannerChat"
  | "inspectorChat";

/**
 * Per-scope tool sets. Empty by default — slices register concrete tools here
 * (RAG retrieval in L/O, chat context-fetch tools in T).
 *
 * Phase keys (`phase1`…`phase5`) scope tools to the structured-output actors:
 * analyst (phase1), architect (phase2), controller (phase3), planner (phase4),
 * inspector-server (phase5). Chat keys scope tools to the chat actors that run
 * a tool-calling pre-step before producing their structured reply (Slice T).
 *
 * Registration pattern: a tool module imports this object and pushes itself in
 * at module load. Order doesn't matter for tool calling; the model picks based
 * on `name` + `description`.
 */
const REGISTRY: Record<OrionPhase, OrionTool[]> = {
  phase1: [],
  phase2: [],
  phase3: [],
  phase4: [],
  phase5: [],
  blueprintChat: [],
  refinementChat: [],
  plannerChat: [],
  inspectorChat: [],
};

export function toolsForPhase(phase: OrionPhase): OrionTool[] {
  return REGISTRY[phase];
}

/**
 * Register a tool for one or more phases. Called by individual tool modules
 * at import time. Idempotent on (phase, tool.name).
 */
export function registerTool(phases: OrionPhase | OrionPhase[], tool: OrionTool): void {
  const list = Array.isArray(phases) ? phases : [phases];
  for (const phase of list) {
    const bucket = REGISTRY[phase];
    if (!bucket.some((t) => t.name === tool.name)) bucket.push(tool);
  }
}
