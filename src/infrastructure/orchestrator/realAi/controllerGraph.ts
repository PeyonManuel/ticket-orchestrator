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
import { acceptanceCriterionSchema } from "@/domain/orchestrator/types";
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
- description: 1-3 paragraphs in plain language a PO would write. State WHAT the user can do (or does differently now) and WHY it matters. NO acceptance criteria here — those are a separate field.
  • DO NOT include "out of scope" / "what this won't do" / "not in this ticket" sections. A ticket describes what it WILL do. Period.
  • DO NOT mention specific technologies, code patterns, or implementation tactics.
  • Use product-level language: "Users can…", "The product shows…", "When a customer…" — never "The system validates…", "The API returns…", "The developer should…".
- acceptanceCriteria: structured array. For each criterion you choose a 'kind' and COMMIT to it:
  • kind="gherkin" — for verifiable behavior changes. You MUST populate \`given\` / \`when\` / \`outcome\` (the "THEN" clause goes in \`outcome\` — the field is named that way to avoid a Promise/thenable footgun in our codebase). Optional one-line \`and\` is allowed ONLY after \`when\` (never after given, never after outcome, max one per criterion). Example: { kind: "gherkin", given: "the cart is empty", when: "the user clicks Checkout", outcome: "they see an empty-cart message" }
  • kind="narrative" — for cases where Gherkin doesn't fit (a backend cron, copy change, a spike). Populate \`text\` with a single observable sentence.
  Produce AT LEAST 2 criteria — the happy path + at least one edge / failure / empty case. Each must be observable. No "feels intuitive", no implementation phrasing.
- storyPoints: Fibonacci, one of 1, 2, 3, 5, 8, 13. Use 1 for trivial; 2-3 for simple; 5 for typical features; 8 for cross-cutting; 13 if it needs splitting (flag in risks).
- risks: 1-3 specific concerns the PO should know about — phrased in product terms (dependencies on other tickets, data migration impact on existing users, etc.). NOT technical risks like "race conditions" or "N+1 queries". Empty array if genuinely none — don't pad.

Tool use:
- If 'find_similar_tickets' is available, call it ONCE before deciding storyPoints. Pass "\${title} — \${oneLiner}" as query, topK 5. If hits cluster around a value, favor that anchor. If hits are unrelated (similarity < 0.5) or empty, estimate from first principles.

Stay grounded in the ticket title + one-liner + label. Don't invent scope outside it. Don't invent technical solutions either — leave that to the dev team.`;

const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;

// Flat schema for LLM consumption — Gemma 4B chokes on `discriminatedUnion`
// (JSON-schema `oneOf` over object branches). Variant-specific fields are all
// optional at the schema level; the shared domain `acceptanceCriterionSchema`
// (imported above) then narrows the LLM's flat payload into the discriminated
// union via a transform.
const llmAcceptanceCriterionSchema = z
  .object({
    kind: z
      .enum(["gherkin", "narrative"])
      .describe(
        "Pick 'gherkin' for verifiable behavior (given/when/then required). Pick 'narrative' when Gherkin doesn't fit (backend cron, copy change, spike) — populate 'text' instead.",
      ),
    title: z
      .string()
      .optional()
      .describe("Optional scenario label, gherkin only."),
    given: z
      .string()
      .optional()
      .describe("REQUIRED when kind='gherkin'. Omit when kind='narrative'."),
    when: z
      .string()
      .optional()
      .describe("REQUIRED when kind='gherkin'. Omit when kind='narrative'."),
    outcome: z
      .string()
      .optional()
      .describe(
        "The 'THEN' clause (observable outcome). REQUIRED when kind='gherkin'. Omit when kind='narrative'. Field named 'outcome' (not 'then') to avoid Promise-thenable footgun.",
      ),
    and: z
      .string()
      .optional()
      .describe("Optional single 'and' clause AFTER when. Gherkin only. Max one per criterion."),
    text: z
      .string()
      .optional()
      .describe("REQUIRED when kind='narrative'. Omit when kind='gherkin'."),
  })
  .describe(
    "One acceptance criterion. Pick a kind and populate the fields that kind requires.",
  );

const controllerResponseSchema = z.object({
  description: z.string().min(1),
  acceptanceCriteria: z
    .array(llmAcceptanceCriterionSchema)
    .min(2)
    .max(8)
    .describe(
      "At least 2 acceptance criteria: the happy path + at least one edge / failure / empty case.",
    ),
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

  // Bumped from 30s → 90s after Slice typed-AC: structured output now includes
  // a 2–8-item acceptance-criteria array on top of description / risks / SP, so
  // local Gemma 4B routinely runs longer than the old budget.
  const signal = AbortSignal.timeout(90_000);
  const messages =
    tools.length > 0
      ? await runAgentLoop(llm, tools, initialMessages, 3, signal)
      : initialMessages;

  const structured = llm.withStructuredOutput(controllerResponseSchema, {
    name: "controller_response",
  });
  const result = await structured.invoke(messages, { signal });

  // Narrow the LLM's flat payload into the discriminated-union domain shape.
  // The shared `acceptanceCriterionSchema` validates that variant-required
  // fields are present and drops the unused-variant slots; any criterion that
  // fails (e.g. gherkin missing `then`) is dropped — the orchestrator UI will
  // surface "too few AC" via the min(2) downstream check if needed.
  const acceptanceCriteria = result.acceptanceCriteria
    .map((ac) => acceptanceCriterionSchema.safeParse(ac))
    .filter((r) => r.success)
    .map((r) => r.data);

  return {
    description: result.description,
    acceptanceCriteria,
    storyPoints: snapToFibonacci(result.storyPoints) as ProposalStoryPoints,
    risks: result.risks,
  };
}
