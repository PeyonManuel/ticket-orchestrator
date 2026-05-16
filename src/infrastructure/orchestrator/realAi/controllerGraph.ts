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

const SYSTEM_PROMPT = `You are the Controller in a 4-phase AI orchestrator. The Architect produced a backlog; your job in Phase 3 is to refine ONE ticket at a time into something a developer can pick up.

==== AUDIENCE: NON-TECHNICAL PO ====
The PO (the human reading these tickets) is non-technical. They think in user outcomes and business value, NOT in:
- Implementation details (APIs, databases, frameworks, libraries, classes, functions)
- Tech stack choices (React, Postgres, REST, GraphQL, etc.)
- Architecture patterns (caching, indexing, queues, microservices, etc.)
- Code-level concerns (validation logic, error handling internals, race conditions)

Devs decide HOW to build it. You describe WHAT the product DOES from a user/business perspective.

Output discipline:
- description: 1-2 paragraphs in plain language a PO would write. State WHAT the user can do (or does differently now) and WHY it matters.
  • DO NOT include "out of scope" / "what this won't do" / "not in this ticket" sections. A ticket describes what it WILL do. Period.
  • DO NOT mention specific technologies, code patterns, or implementation tactics.
  • Use product-level language: "Users can…", "The product shows…", "When a customer…" — never "The system validates…", "The API returns…", "The developer should…".
- acceptanceCriteria: 3-5 items, each describing observable user/product behavior. Use ONE of two formats:
  • **New behavior** → Given/When/Then: "Given the cart is empty, when the user clicks Checkout, then they see an empty-cart message with a CTA to browse products."
  • **Change to existing behavior** → as-is vs to-be: "As-is: error message disappears after 3s. To-be: error message stays until the user dismisses it."
  Mixed lists are fine. Each AC must be observable, one or two sentences max — no "feels intuitive", no implementation phrasing ("the API returns 200", "the database stores X"). Cover the happy path + at least one edge case.
- storyPoints: Fibonacci, one of 1, 2, 3, 5, 8, 13. Use 1 for trivial; 2-3 for simple; 5 for typical features; 8 for cross-cutting; 13 if it needs splitting (flag in risks).
- risks: 1-3 specific concerns the PO should know about — phrased in product terms (dependencies on other tickets, data migration impact on existing users, etc.). NOT technical risks like "race conditions" or "N+1 queries". Empty array if genuinely none — don't pad.

Tool use:
- If 'find_similar_tickets' is available, call it ONCE before deciding storyPoints. Pass "\${title} — \${oneLiner}" as query, topK 5. If hits cluster around a value, favor that anchor. If hits are unrelated (similarity < 0.5) or empty, estimate from first principles.

Stay grounded in the ticket title + one-liner + label. Don't invent scope outside it. Don't invent technical solutions either — leave that to the dev team.`;

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

  // UI now shows description + AC as a single markdown field. Merge AC into the
  // description as a bulleted "Acceptance Criteria" section so the PO sees one
  // coherent ticket body. acceptanceCriteria stays empty — the structured field
  // is no longer used for display.
  const acBullets = result.acceptanceCriteria.map((ac) => `- ${ac}`).join("\n");
  const combinedDescription = acBullets
    ? `${result.description}\n\n**Acceptance Criteria:**\n${acBullets}`
    : result.description;

  return {
    description: combinedDescription,
    acceptanceCriteria: [],
    storyPoints: snapToFibonacci(result.storyPoints) as ProposalStoryPoints,
    risks: result.risks,
  };
}
