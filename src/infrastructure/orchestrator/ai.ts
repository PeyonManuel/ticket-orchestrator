"use client";

import type { ApolloClient } from "@apollo/client";
import {
  runAnalystTurn,
  runArchitectBacklog,
  runBlueprintChat,
  runControllerRefinement,
  runDependencyInference,
  runRefinementChat,
  runPlannerChat,
  runInspectorTurn,
} from "./mockAi";
import { createRealAi } from "./realAi/client";

/**
 * Single entry point for orchestrator AI actors.
 *
 * Defaults to real Gemini-backed actors via GraphQL. Set
 * `NEXT_PUBLIC_MOCK_AI=1` in `.env.local` (and restart the dev server) to
 * flip the entire app to the deterministic mocks in `mockAi.ts`. Useful for
 * fast Playwright runs and demos that can't afford LLM latency / quota.
 *
 * Note: this only swaps the actors. The planner's slicing math is always
 * deterministic regardless (no LLM involved).
 */
export function createAi(apollo: ApolloClient) {
  if (process.env.NEXT_PUBLIC_MOCK_AI === "1") {
    return {
      runAnalystTurn,
      runArchitectBacklog,
      runControllerRefinement,
      runDependencyInference,
      runBlueprintChat,
      runRefinementChat,
      runPlannerChat,
      runInspectorTurn,
    };
  }
  return createRealAi(apollo);
}
