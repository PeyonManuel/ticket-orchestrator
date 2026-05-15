import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type {
  ControllerInput,
  ControllerOutput,
  ProposalStoryPoints,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";
import { toolsForPhase } from "../tools";

/**
 * Phase 3 Controller — refines a single ticket: description, acceptance
 * criteria (testable Given/When/Then), story points on the Fibonacci scale,
 * and risks.
 */

const SYSTEM_PROMPT = `You are the Controller in a 4-phase AI orchestrator. The Architect produced a backlog; your job in Phase 3 is to refine ONE ticket at a time into something a developer can pick up without asking questions.

Output discipline:
- description: 1-2 paragraphs. State the WHAT and WHY clearly. Mention the boundary of the work (what's in, what's out for this ticket).
- acceptanceCriteria: 3-5 items, phrased Given/When/Then. Each must be testable — no "the user should feel happy". Always cover happy path + at least one failure/edge case.
- storyPoints: Fibonacci, one of 1, 2, 3, 5, 8, 13. Use 1 for trivial config; 2-3 for simple feature work; 5 for typical features; 8 for cross-cutting work; 13 if it really needs splitting (flag in risks).
- risks: 1-3 specific concerns (dependencies, data migration, multi-tenancy, perf, integration). Empty array if genuinely none — don't pad.

Stay grounded in the ticket title + one-liner + label. Don't invent scope outside it.`;

const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;

// Gemini's structured-output validator doesn't support JSON Schema `const`
// (Zod emits it for z.literal). Use plain number + post-parse coercion to the
// nearest Fibonacci value.
const controllerResponseSchema = z.object({
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(2).max(6),
  storyPoints: z
    .number()
    .int()
    .min(1)
    .max(13)
    .describe("Fibonacci scale: must be one of 1, 2, 3, 5, 8, 13."),
  risks: z.array(z.string()).max(5),
});

function snapToFibonacci(n: number): 1 | 2 | 3 | 5 | 8 | 13 {
  let best: (typeof FIBONACCI_POINTS)[number] = 1;
  let bestDiff = Infinity;
  for (const f of FIBONACCI_POINTS) {
    const d = Math.abs(n - f);
    if (d < bestDiff) {
      best = f;
      bestDiff = d;
    }
  }
  return best;
}

export async function runControllerRefinement(
  input: ControllerInput,
): Promise<ControllerOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.4 });
  const structured = llm.withStructuredOutput(controllerResponseSchema, {
    name: "controller_response",
  });

  // Phase 3 tool registry. Empty today — Slice M (AC Linter) is the first
  // consumer. Guarded so that registering a tool without also wiring the
  // agent loop here fails loudly instead of silently hallucinating tool calls.
  const phaseTools = toolsForPhase("phase3");
  if (phaseTools.length > 0) {
    throw new Error(
      `controllerGraph: ${phaseTools.length} phase-3 tool(s) registered but the agent loop is not yet implemented. Add the bindOrionTools pre-step (Slice M) before registering tools.`,
    );
  }

  const { ticket, backlog } = input;
  const ticketSummary = [
    `Ticket title: ${ticket.title}`,
    `One-liner: ${ticket.oneLiner}`,
    `Label: ${ticket.label}`,
    `Hierarchy: ${ticket.hierarchyType}`,
    `Existing description: ${ticket.description || "(none)"}`,
  ].join("\n");

  const epicContext = [
    `Epic: ${backlog.epicTitle}`,
    `Epic description: ${backlog.epicDescription}`,
    `Sibling tickets:`,
    ...backlog.tickets
      .filter((t) => t.id !== ticket.id)
      .map((t) => `- ${t.title} [${t.label}]`),
  ].join("\n");

  const result = await structured.invoke([
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      `Refine this ticket.\n\n${ticketSummary}\n\n${epicContext}`,
    ),
  ]);

  return {
    description: result.description,
    acceptanceCriteria: result.acceptanceCriteria,
    storyPoints: snapToFibonacci(result.storyPoints) as ProposalStoryPoints,
    risks: result.risks,
  };
}
