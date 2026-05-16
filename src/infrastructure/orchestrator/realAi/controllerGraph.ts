import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type {
  ControllerInput,
  ControllerOutput,
  ProposalStoryPoints,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";
import { toolsForPhase } from "../tools";
import { createFindSimilarTicketsTool } from "../tools/findSimilarTickets";
import { countTicketEmbeddings } from "../rag/store";
import { runAgentLoop } from "./agentLoop";

/**
 * Phase 3 Controller — refines a single ticket: description, acceptance
 * criteria (testable Given/When/Then), story points on the Fibonacci scale,
 * and risks.
 */

const SYSTEM_PROMPT = `You are the Controller in a 4-phase AI orchestrator. The Architect produced a backlog; your job in Phase 3 is to refine ONE ticket at a time into something a developer can pick up without asking questions.

Output discipline:
- description: 1-2 paragraphs. State the WHAT and WHY clearly. Mention the boundary of the work (what's in, what's out for this ticket).
- acceptanceCriteria: 3-5 items, each in ONE of two formats depending on what kind of statement it is:
  • **New behavior / new requirement** → Given/When/Then. Example: "Given the cart is empty, when the user clicks Checkout, then a 'Your cart is empty' state is shown with a CTA to browse products."
  • **Change to existing behavior** → as-is vs to-be. Example: "As-is: error toast disappears after 3s. To-be: error toast persists until dismissed or until the next user action."
  Mixed lists are fine. Each AC must be testable, one or two sentences max — no "the user should feel happy", no "intuitive", no metric-less performance claims. Always cover happy path + at least one failure/edge case.
- storyPoints: Fibonacci, one of 1, 2, 3, 5, 8, 13. Use 1 for trivial config; 2-3 for simple feature work; 5 for typical features; 8 for cross-cutting work; 13 if it really needs splitting (flag in risks).
- risks: 1-3 specific concerns (dependencies, data migration, multi-tenancy, perf, integration). Empty array if genuinely none — don't pad.

Tool use:
- If 'find_similar_tickets' is available, call it ONCE before deciding storyPoints. Pass "\${title} — \${oneLiner}" as query, topK 5. If hits cluster around a value (e.g. 3 of 5 hits at 5 points), favor that anchor over a free guess. If hits are unrelated (similarity < 0.5) or empty, estimate from first principles.

Stay grounded in the ticket title + one-liner + label. Don't invent scope outside it.`;

const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;

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
  ctx?: { orgId?: string },
): Promise<ControllerOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.4 });

  // Slice O: register the semantic point-estimator tool if the org has any
  // committed tickets to compare against. Fast-path skip when the corpus is
  // empty — saves a pointless agent-loop round trip on first-run orgs.
  const hasTicketCorpus =
    !!ctx?.orgId && (await countTicketEmbeddings(ctx.orgId)) > 0;
  const tools = [
    ...toolsForPhase("phase3"),
    ...(hasTicketCorpus ? [createFindSimilarTicketsTool(ctx!.orgId!)] : []),
  ];

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

  const initialMessages: BaseMessage[] = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(`Refine this ticket.\n\n${ticketSummary}\n\n${epicContext}`),
  ];

  const signal = AbortSignal.timeout(30_000);
  const messages =
    tools.length > 0
      ? await runAgentLoop(llm, tools, initialMessages, 3, signal)
      : initialMessages;

  const structured = llm.withStructuredOutput(controllerResponseSchema, {
    name: "controller_response",
  });
  const result = await structured.invoke(messages, { signal });

  return {
    description: result.description,
    acceptanceCriteria: result.acceptanceCriteria,
    storyPoints: snapToFibonacci(result.storyPoints) as ProposalStoryPoints,
    risks: result.risks,
  };
}
