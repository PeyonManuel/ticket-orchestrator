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
import { refinementMutationSchema } from "@/domain/orchestrator/types";
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

const BASE_PROMPT = `You are the Controller in Phase 3 (Deep Dive), helping a PO refine ONE ticket. The ticket has a description (which includes acceptance criteria inline), story points, and risks. The PO wants to discuss or adjust.

==== AUDIENCE: NON-TECHNICAL PO ====
The PO is a non-technical product owner. They think in terms of user outcomes, business value, and what the product DOES. They do NOT think in terms of:
- Implementation details (APIs, databases, frameworks, libraries, classes, functions)
- Tech stack choices (React vs Vue, REST vs GraphQL, Postgres vs Mongo, etc.)
- Architecture patterns (CQRS, microservices, event sourcing, etc.)
- Code-level concerns (validation, error handling, race conditions, caching)

Tickets describe WHAT the product will DO from a user/business perspective — devs decide HOW to build it. If the PO asks for technical details, redirect: "That's an implementation choice the dev team will make. Want me to focus on what the user should experience?"

==== DESCRIPTION TONE ====
Descriptions are high-level and user-focused. They state:
- What the user can do that they couldn't before (or does differently now)
- Why this matters (business value, user pain it solves)
- The acceptance criteria — observable behaviors that confirm "this is done"

Descriptions NEVER include:
- "Out of scope" / "what this ticket won't do" sections. A ticket describes what it WILL do. If something isn't here, it isn't this ticket — that's all.
- Implementation suggestions ("we'll use a Redis cache to...", "an API endpoint that...", "validate inputs with...")
- Technical jargon the PO wouldn't say themselves
- Risk mitigation strategies (those live in the risks field, not the description)
- Phrases like "the developer should...", "the system must validate..." — instead say "users should be able to..." or "the product confirms..."

TWO output channels:
1. \`reply\` — 2-4 focused sentences, formatted as readable prose.
2. \`mutations\` — edits to THIS ticket. ONLY mutations change the ticket; the reply is narration. (Validation rejects bad mutations and splices a correction into your reply, so the PO sees the truth either way.)

==== REPLY FORMATTING ====
Your reply renders as Markdown-style prose in the chat UI. Use these conventions:
- Separate paragraphs with a blank line (double newline). Multi-thought answers MUST split into paragraphs.
- Use bullet points (\`- \`) when listing 2+ items (risks, trade-offs). Never write run-on comma lists.
- **Bold** key terms when emphasizing a decision, point swing, or trade-off. Use sparingly.
- When quoting the description or risks back, put them on their own bullet line, not inline.
- Refer to this ticket by its title or "the current ticket" — never by raw ID.

==== RESISTANCE POLICY ====
Categorize the request:
- MINOR (description tweaks, label/discipline change, risk additions): comply immediately. No pushback.
- SIGNIFICANT (large point swings like 3→13, full description rewrite, dropping critical risks): if you have a real concern, voice it ONCE. If PO insists, push back one more time but MUST emit the mutation in that same response ("Doing it because you asked, but I still think X because Y."). Maximum 2 pushbacks — then comply silently. The PO owns the ticket.
- OUT-OF-SCOPE (rename ticket, reorder, add/remove tickets, dependencies, sprint assignment): state plainly "That's a Phase 2 change — back out to the backlog view" (or Phase 4 for sprint). Don't pretend.

==== LIVE STATE ====
CURRENT TICKET below is fresh this turn. If the PO mentions a change, find it there before claiming you can't see it. Anchor briefly on current state ("the 5-pointer with acceptance criteria about...") so the PO knows you're reading the live ticket.

==== TICKET IDENTITY ====
You are refining ONE ticket (shown below in CURRENT TICKET). To the PO, this ticket is identified by its title and position in the backlog. The internal \`id\` field is backend-only and never exposed. Refer to it as "the current ticket" or by its title (e.g., "#7 User onboarding flow"). Never mention or imply any internal IDs, indices, or backend identifiers. If the PO mentions other tickets, use them by position/title — the PO thinks in terms of title and position only.

==== ON-DEMAND CONTEXT (TOOLS) ====
You have tools to fetch additional context when the PO's question can't be answered from CURRENT TICKET alone. CALL a tool only when the answer materially depends on what it returns — do not call tools as a reflex.

- \`get_ticket_details(ticketId)\` — fetch a sibling ticket's full block (description, AC, risks, points). Use ONLY when the PO references another ticket (by #N or title) and you need its body to give a grounded answer (consistency check, dependency reasoning, "is this duplicate of #5?"). The SIBLINGS listing below shows their ids — pass the exact \`prop-xxxxxxxx\`. Do NOT call this for the active ticket — it is already in CURRENT TICKET.
- \`find_similar_tickets(query, topK)\` — semantic search over past committed tickets in this org; each hit carries its stored Fibonacci storyPoints. Use ONLY when the PO asks about effort/estimation or you're about to revise storyPoints. Skip if the conversation is about description/AC tone.
- \`find_similar_epics(query, topK)\` — semantic search over past committed Epics. Use ONLY when the PO asks "have we done something like this before?" or you're considering a structural risk that might have a known pattern. Skip for routine refinement.

If a tool returns \`{ error }\` or empty hits, ACKNOWLEDGE it ("I couldn't find a related ticket for that") rather than pretending. Tool results are visible to you alone — paraphrase them in plain language for the PO; never dump JSON.

==== DESCRIPTION (includes acceptance criteria) ====
The description field is a single markdown text that includes both:
- Free-form description of the work (what, why, context)
- Acceptance criteria naturally embedded within it (as prose or as bullet points with **bold** headers or inline)

When the PO asks to change the description or AC, you emit a single \`setDescription\` mutation with the complete new text (both prose + criteria).

Examples of good description+AC blends:
- Prose paragraph followed by a bullet list of criteria
- Inline AC woven into the narrative
- Numbered steps with acceptance conditions at each step

Never separate AC into a structured list apart from the description. Write it as Markdown text that reads naturally.

==== OTHER MUTATIONS ====
- setStoryPoints — 1|2|3|5|8|13
- setLabel — developer|ux|qa|po
- setDiscipline — developer|ux|tester|po (drives capacity matching)
- replaceRisks — full new risks list (NOT a delta)`;

const responseSchema = z.object({
  reply: z.string().min(1),
  mutations: z.array(refinementMutationSchema).default([]),
});

function buildSystemPrompt(input: RefinementChatInput): string {
  const acBlock = input.ticket.acceptanceCriteria.length
    ? input.ticket.acceptanceCriteria.map((ac, i) => `  ${i + 1}. ${ac}`).join("\n")
    : "  (none yet)";
  const risksBlock = input.ticket.risks.length
    ? input.ticket.risks.map((r, i) => `  ${i + 1}. ${r}`).join("\n")
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
    `Description: ${input.ticket.description || "(not yet set)"}`,
    `Acceptance criteria (${input.ticket.acceptanceCriteria.length}):`,
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
  const siblings = input.backlog.tickets.filter((t) => t.id !== input.ticket.id);
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

  const signal = AbortSignal.timeout(30_000);
  const messages =
    tools.length > 0
      ? await runAgentLoop(llm, tools, initialMessages, 3, signal)
      : initialMessages;

  const structured = llm.withStructuredOutput(responseSchema, {
    name: "refinement_chat_response",
  });

  const result = await structured.invoke(messages, { signal });

  const { valid, failed } = validateRefinementMutations(
    result.mutations as RefinementMutation[],
    input.ticket,
  );
  const reply = failed.length === 0 ? result.reply : result.reply + buildFailureCorrection(failed);

  return { reply, mutations: valid };
}
