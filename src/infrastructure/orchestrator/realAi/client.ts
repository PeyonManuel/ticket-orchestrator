"use client";

import type { ApolloClient } from "@apollo/client";
import { stripTypename } from "../stripTypename";
import {
  RUN_ANALYST_TURN,
  RUN_ARCHITECT_BACKLOG,
  RUN_CONTROLLER_REFINEMENT,
  RUN_BLUEPRINT_CHAT,
  RUN_DEPENDENCY_INFERENCE,
  RUN_REFINEMENT_CHAT,
  RUN_PLANNER_CHAT,
  RUN_INSPECTOR_TURN,
} from "@/infrastructure/graphql/operations";
import { z } from "zod";
import {
  analystTurnOutputSchema,
  backlogProposalSchema,
  blueprintMutationSchema,
  controllerOutputSchema,
  dependencyInferenceOutputSchema,
  inspectorTurnOutputSchema,
  plannerChatOutputSchema,
  refinementMutationSchema,
  type AnalystTurnInput,
  type AnalystTurnOutput,
  type ArchitectInput,
  type ArchitectOutput,
  type BlueprintChatInput,
  type BlueprintChatOutput,
  type ControllerInput,
  type ControllerOutput,
  type DependencyInferenceInput,
  type DependencyInferenceOutput,
  type InspectorTurnInput,
  type InspectorTurnOutput,
  type PlannerChatInput,
  type PlannerChatOutput,
  type RefinementChatInput,
  type RefinementChatOutput,
} from "@/domain/orchestrator/types";

const blueprintMutationArraySchema = z.array(blueprintMutationSchema);
const refinementMutationArraySchema = z.array(refinementMutationSchema);

function safeParseJsonArray<T>(json: string, schema: z.ZodType<T[]>): T[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return schema.parse(parsed);
  } catch {
    // Malformed payloads are silently dropped (better than blowing up the chat
    // turn). The valid reply still renders; only mutations are lost.
    return [];
  }
}

/**
 * Client-side adapters that route every AI actor call through GraphQL to a
 * server resolver running LangChain + Gemini. Same input/output shapes as
 * `mockAi.ts` so `useOrchestrator.ts` can swap imports without other changes.
 *
 * `createRealAi(apollo)` returns the actor set bound to a single Apollo client
 * instance — call from `useOrchestrator` where the client is already in hand.
 *
 * Zod parses every response so a malformed LLM payload is surfaced as an error
 * the orchestrator machine's `failed` branch can show, instead of corrupting
 * the draft context downstream.
 */
export function createRealAi(apollo: ApolloClient) {
  return {
    runAnalystTurn: async (input: AnalystTurnInput): Promise<AnalystTurnOutput> => {
      const result = await apollo.mutate<{ runAnalystTurn: AnalystTurnOutput }>({
        mutation: RUN_ANALYST_TURN,
        variables: { input: stripTypename(input) },
      });
      if (!result.data?.runAnalystTurn) {
        throw new Error("runAnalystTurn returned no data");
      }
      return analystTurnOutputSchema.parse(result.data.runAnalystTurn);
    },

    runArchitectBacklog: async (
      input: ArchitectInput,
    ): Promise<ArchitectOutput> => {
      const result = await apollo.mutate<{ runArchitectBacklog: ArchitectOutput }>({
        mutation: RUN_ARCHITECT_BACKLOG,
        variables: { input: stripTypename(input) },
      });
      if (!result.data?.runArchitectBacklog) {
        throw new Error("runArchitectBacklog returned no data");
      }
      return backlogProposalSchema.parse(result.data.runArchitectBacklog);
    },

    runDependencyInference: async (
      input: DependencyInferenceInput,
    ): Promise<DependencyInferenceOutput[]> => {
      const result = await apollo.mutate<{
        runDependencyInference: DependencyInferenceOutput[];
      }>({
        mutation: RUN_DEPENDENCY_INFERENCE,
        variables: { input: stripTypename(input) },
      });
      if (!result.data?.runDependencyInference) {
        throw new Error("runDependencyInference returned no data");
      }
      return z.array(dependencyInferenceOutputSchema).parse(result.data.runDependencyInference);
    },

    runControllerRefinement: async (
      input: ControllerInput,
    ): Promise<ControllerOutput> => {
      const result = await apollo.mutate<{ runControllerRefinement: ControllerOutput }>({
        mutation: RUN_CONTROLLER_REFINEMENT,
        variables: { input: stripTypename(input) },
      });
      if (!result.data?.runControllerRefinement) {
        throw new Error("runControllerRefinement returned no data");
      }
      return controllerOutputSchema.parse(result.data.runControllerRefinement);
    },

    runBlueprintChat: async (
      input: BlueprintChatInput,
    ): Promise<BlueprintChatOutput> => {
      const result = await apollo.mutate<{
        runBlueprintChat: { reply: string; mutationsJson: string };
      }>({
        mutation: RUN_BLUEPRINT_CHAT,
        variables: { input: stripTypename(input) },
      });
      if (!result.data?.runBlueprintChat) {
        throw new Error("runBlueprintChat returned no data");
      }
      const data = result.data.runBlueprintChat;
      return {
        reply: String(data.reply),
        mutations: safeParseJsonArray(data.mutationsJson, blueprintMutationArraySchema),
      };
    },

    runRefinementChat: async (
      input: RefinementChatInput,
    ): Promise<RefinementChatOutput> => {
      const result = await apollo.mutate<{
        runRefinementChat: { reply: string; mutationsJson: string };
      }>({
        mutation: RUN_REFINEMENT_CHAT,
        variables: { input: stripTypename(input) },
      });
      if (!result.data?.runRefinementChat) {
        throw new Error("runRefinementChat returned no data");
      }
      const data = result.data.runRefinementChat;
      return {
        reply: String(data.reply),
        mutations: safeParseJsonArray(data.mutationsJson, refinementMutationArraySchema),
      };
    },

    runPlannerChat: async (
      input: PlannerChatInput,
    ): Promise<PlannerChatOutput> => {
      const result = await apollo.mutate<{ runPlannerChat: PlannerChatOutput }>({
        mutation: RUN_PLANNER_CHAT,
        variables: { input: stripTypename(input) },
      });
      if (!result.data?.runPlannerChat) {
        throw new Error("runPlannerChat returned no data");
      }
      return plannerChatOutputSchema.parse(result.data.runPlannerChat);
    },

    runInspectorTurn: async (
      input: InspectorTurnInput,
    ): Promise<InspectorTurnOutput> => {
      // Client has the full bundle in machine context; the server only needs
      // the snapshotId + transcript + userMessage and reloads the rest.
      const result = await apollo.mutate<{ runInspectorTurn: InspectorTurnOutput }>({
        mutation: RUN_INSPECTOR_TURN,
        variables: {
          input: stripTypename({
            epicSnapshotId: input.snapshot.id,
            transcript: input.transcript,
            userMessage: input.userMessage,
          }),
        },
      });
      if (!result.data?.runInspectorTurn) {
        throw new Error("runInspectorTurn returned no data");
      }
      return inspectorTurnOutputSchema.parse(result.data.runInspectorTurn);
    },
  };
}
