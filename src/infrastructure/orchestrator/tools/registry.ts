import type { StructuredToolInterface } from "@langchain/core/tools";

/**
 * The shape every Orion tool must conform to — anything `tool()` from
 * `@langchain/core/tools` produces satisfies this interface.
 */
export type OrionTool = StructuredToolInterface;

export type OrionPhase = "phase1" | "phase2" | "phase3" | "phase4" | "phase5";

/**
 * Per-phase tool sets. Empty by default — future slices register concrete tools
 * here (RAG retrieval in L, AC linter in M, semantic point estimator in O).
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
