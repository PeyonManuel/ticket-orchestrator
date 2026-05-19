import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type {
  RefinementChatInput,
  RefinementChatOutput,
  RefinementMutation,
} from "@/domain/orchestrator/types";
import {
  refinementMutationSchema,
  refinementMutationWireSchema,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";
import { toolsForPhase } from "../tools";
import { createGetOtherTicketProposalTool } from "../tools/getOtherTicketProposal";
import { createFindSimilarTicketsTool } from "../tools/findSimilarTickets";
import { createFindSimilarEpicsTool } from "../tools/findSimilarEpics";
import { countTicketEmbeddings, countEpicEmbeddings } from "../rag/store";
import { runAgentLoop } from "./agentLoop";
import {
  validateRefinementMutations,
  describeRefinementMutationForFeedback,
  type RefinementMutationFailure,
} from "./mutationValidation";

/**
 * Phase 3 per-ticket chat: PO discusses one specific ticket with the
 * Controller. Scope of the chat is bounded to that ticket (plus minimal
 * Epic context) — the PO uses it to clarify story points, AC, risks,
 * or implementation trade-offs. The Controller can also propose
 * single-ticket field edits via the `mutations` channel.
 */

const BASE_PROMPT = `Role: You are the Phase 3 Controller. You help a non-technical PO refine a single ticket.

Rules of Engagement:

The Filter: Treat the "How" as a blackbox. Focus only on User Outcomes and Business Value. If the PO asks for tech details, redirect to the user experience.

Sniper RAG: Use get_ticket_details(id) to check siblings or find_similar_tickets for estimation. Never say "I don't have context."

Description vs Acceptance Criteria (separate fields):
- description = "What & Why" prose only. 1-3 short paragraphs in product language. NO acceptance criteria here.
- acceptanceCriteria = structured array, ONE field per ticket. You replace it whole via setAcceptanceCriteria when you change AC.

For each criterion you COMMIT to a kind and populate the fields it requires:
- kind="gherkin" — verifiable behavior. MUST have given + when + then. Optional one-line 'and' only after 'when' (never after given, never after then, max one per criterion).
- kind="narrative" — when Gherkin doesn't fit (backend cron, copy change, spike). MUST have a single observable sentence in 'text'.

Mutations (your edit channel):
- setDescription(description): rewrite "What & Why" only
- setAcceptanceCriteria(acceptanceCriteria): full-replace the AC list (min 1 item)
- setStoryPoints, setLabel, setDiscipline, replaceRisks: as named
You CANNOT do anything outside this list.

Reply: 2-4 sentences. Narrate what changed and why. When proposing mutations, mention the change briefly — the system shows the actual edits separately.

Pushback: For cosmetic asks comply immediately. For structural asks push back at most twice with a reason, then comply while voicing disagreement. For out-of-scope asks state plainly that it's outside this ticket.`;

// Wire schema for Gemini structured output (no transforms — JSON Schema compatible)
const responseWireSchema = z.object({
  reply: z.string().min(1),
  mutations: z.array(refinementMutationWireSchema).default([]),
});

// Domain schema for post-LLM validation (applies AC transforms)
const responseDomainSchema = z.object({
  reply: z.string().min(1),
  mutations: z.array(refinementMutationSchema).default([]),
});

function buildSystemPrompt(input: RefinementChatInput): string {
  const risksBlock = input.ticket.risks.length
    ? input.ticket.risks.map((r, i) => `  ${i + 1}. ${r}`).join("\n")
    : "  (none yet)";

  const acList = input.ticket.acceptanceCriteria ?? [];
  const acBlock = acList.length
    ? acList
        .map((ac, i) => {
          if (ac.kind === "gherkin") {
            const title = ac.title ? ` "${ac.title}"` : "";
            const and = ac.and ? ` AND ${ac.and}` : "";
            return `  ${i + 1}. [gherkin]${title} GIVEN ${ac.given}, WHEN ${ac.when}${and}, THEN ${ac.outcome}`;
          }
          return `  ${i + 1}. [narrative] ${ac.text}`;
        })
        .join("\n")
    : "  (none yet)";

  // Position numbers mirror the PO's view of the backlog (1-indexed). We expose
  // both the position (#N — what the PO says) and the id (prop-xxx — what tools
  // need) so the AI can translate between them when calling `get_ticket_details`.
  const activeIdx = input.backlog.tickets.findIndex(
    (t) => t.id === input.ticket.id,
  );
  const siblingsList = input.backlog.tickets
    .map((t, i) =>
      t.id === input.ticket.id
        ? null
        : `  #${i + 1} ${t.title} [${t.label}] | id=${t.id}`,
    )
    .filter((s): s is string => s !== null);
  const siblingsBlock = siblingsList.length
    ? siblingsList.join("\n")
    : "  (none — this is the only ticket in the backlog)";

  return [
    BASE_PROMPT,
    "",
    "==================================================",
    "=== CURRENT TICKET (live state, fresh this turn) ===",
    "==================================================",
    `Position: #${activeIdx + 1}`,
    `Title: ${input.ticket.title}`,
    `One-liner: ${input.ticket.oneLiner}`,
    `Label: ${input.ticket.label}`,
    `Discipline: ${input.ticket.discipline ?? "(not set)"}`,
    `Story points: ${input.ticket.storyPoints ?? "null"}`,
    `Description ("What & Why" prose only): ${input.ticket.description || "(not yet set)"}`,
    `Acceptance Criteria (${acList.length}):`,
    acBlock,
    `Risks (${input.ticket.risks.length}):`,
    risksBlock,
    "==================================================",
    "",
    `Epic context: ${input.backlog.epicTitle} — ${input.backlog.epicDescription}`,
    "",
    "==================================================",
    "=== SIBLINGS (other tickets in the backlog) ======",
    "==================================================",
    "Listed by position (#N), title, label, and id. Pass the exact id to `get_ticket_details` if you need full body. In your reply to the PO, refer to siblings by `#N Title` only — never expose the id.",
    siblingsBlock,
  ].join("\n");
}

function buildFailureCorrection(failures: RefinementMutationFailure[]): string {
  if (failures.length === 1) {
    const f = failures[0];
    return `\n\n— Correction: I also attempted \`${describeRefinementMutationForFeedback(f.mutation)}\` but the system rejected it: ${f.reason}. That change was NOT applied.`;
  }
  const list = failures
    .map(
      (f) =>
        `  • \`${describeRefinementMutationForFeedback(f.mutation)}\` — ${f.reason}`,
    )
    .join("\n");
  return `\n\n— Correction: ${failures.length} of my proposed changes were rejected and were NOT applied:\n${list}`;
}

export async function runRefinementChat(
  input: RefinementChatInput,
  ctx?: { orgId?: string },
): Promise<RefinementChatOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.5 });

  // Slice T: tool-calling pre-step. Bind:
  //   - get_ticket_details: fetch any sibling ticket's field block (always available)
  //   - find_similar_tickets: anchor advice in past committed tickets (org-scoped, gated on corpus)
  //   - find_similar_epics: surface lessons from past Epics (org-scoped, gated on corpus)
  // Plus anything else registered for the `refinementChat` scope. Fast-path skips
  // the loop entirely if there are no tools to call (e.g. mock-AI smoke / empty corpus).
  const siblings = input.backlog.tickets.filter(
    (t) => t.id !== input.ticket.id,
  );
  const hasTicketCorpus =
    !!ctx?.orgId && (await countTicketEmbeddings(ctx.orgId)) > 0;
  const hasEpicCorpus =
    !!ctx?.orgId && (await countEpicEmbeddings(ctx.orgId)) > 0;
  const tools = [
    ...toolsForPhase("refinementChat"),
    ...(siblings.length > 0
      ? [createGetOtherTicketProposalTool(siblings, input.ticket.id)]
      : []),
    ...(hasTicketCorpus ? [createFindSimilarTicketsTool(ctx!.orgId!)] : []),
    ...(hasEpicCorpus ? [createFindSimilarEpicsTool(ctx!.orgId!)] : []),
  ];

  const initialMessages: BaseMessage[] = [
    new SystemMessage(buildSystemPrompt(input)),
    ...input.transcript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  // 30s → 60s: setAcceptanceCriteria mutations carry a 1–N-item discriminated
  // union payload, slower for local Gemma 4B when the PO is editing AC.
  const signal = AbortSignal.timeout(60_000);
  const messages =
    tools.length > 0
      ? await runAgentLoop(llm, tools, initialMessages, 3, signal)
      : initialMessages;

  const structured = llm.withStructuredOutput(responseWireSchema, {
    name: "refinement_chat_response",
  });

  const wireResult = await structured.invoke(messages, { signal });

  // Transform wire schema to domain schema (validates AC gherkin/narrative structure)
  const result = responseDomainSchema.parse(wireResult);

  const { valid, failed } = validateRefinementMutations(
    result.mutations as RefinementMutation[],
    input.ticket,
  );
  const reply =
    failed.length === 0
      ? result.reply
      : result.reply + buildFailureCorrection(failed);

  return { reply, mutations: valid };
}
