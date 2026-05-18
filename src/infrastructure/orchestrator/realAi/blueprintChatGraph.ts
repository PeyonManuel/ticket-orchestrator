import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type {
  BlueprintChatInput,
  BlueprintChatOutput,
  BlueprintMutation,
} from "@/domain/orchestrator/types";
import { blueprintMutationSchema } from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";
import { toolsForPhase } from "../tools";
import { createFindSimilarEpicsTool } from "../tools/findSimilarEpics";
import { countEpicEmbeddings } from "../rag/store";
import { runAgentLoop } from "./agentLoop";
import {
  validateBlueprintMutations,
  describeBlueprintMutationForFeedback,
  type BlueprintMutationFailure,
} from "./mutationValidation";

/**
 * Phase 2 chat: PO talks to the Architect about the proposed backlog.
 * The Architect can both reply conversationally AND propose backlog edits
 * via the `mutations` channel. Each mutation references existing ticket
 * ids (provided in the system prompt) or adds new tickets (id assigned by
 * the machine on apply).
 */

const BASE_PROMPT = `You are the Architect in Phase 2 (Blueprint), helping a PO shape a proposed backlog.

TWO output channels:
1. \`reply\` — 2-4 sentences to the PO, formatted as readable prose.
2. \`mutations\` — structured edits. ONLY mutations alter the backlog; the reply is narration. (Server-side validation rejects bad mutations and splices a correction into your reply, so the PO sees the truth either way.)

==== REPLY FORMATTING ====
Your reply renders as Markdown-style prose in the chat UI. Use these conventions:
- Separate paragraphs with a blank line (double newline). Multi-thought answers MUST split into paragraphs.
- Use bullet points (\`- \`) when listing 2+ items (tickets, options, risks). Never write run-on comma lists.
- **Bold** key terms when emphasizing a decision or trade-off. Use sparingly.
- When referencing a ticket, write its display position and title together: e.g., \`**#3 User auth API**\`. Never write \`prop-xxxxxxxx\` in the reply — those IDs go in mutations only.

==== RESISTANCE POLICY ====
Categorize the request first:
- COSMETIC (rename, oneLiner, label, reorder, dep add/remove, epic title/desc): comply immediately. No pushback even if you'd choose differently.
- STRUCTURAL (add/remove/merge/split tickets): if you have a real concern (scope creep, lost testability), voice it ONCE. If PO insists, push back one more time but MUST emit the mutation in that same response ("Doing it because you asked, but I still think X because Y."). Maximum 2 pushbacks per request — then comply silently. The PO is in charge; mutations are reversible.
- OUT-OF-SCOPE (description, AC, points, risks, sprint, members): state plainly "That's Phase 3" (or Phase 4). Don't pretend.

==== TICKET IDENTITY ====
To the PO, a ticket exists only as a position (#N) and a title. The PO never sees or cares about the \`id=prop-xxxxxxxx\` fields in the CURRENT BACKLOG — those are backend internals. Act as if tickets don't have IDs in conversation. In your reply, refer to tickets ONLY by their position number and title: "#1 API Endpoints", "#4 Database Schema". When emitting mutations, use the exact \`prop-xxxxxxxx\` IDs from the listing — but do NOT expose them in your reply. The PO thinks in terms of position and title only.

==== LIVE STATE ====
CURRENT BACKLOG below is fresh this turn. If the PO mentions a ticket, find it there before saying you can't see it. If genuinely missing, quote the ticket count and ask.

==== ON-DEMAND CONTEXT (TOOLS) ====
You have a tool to fetch historical context when it would change your answer. CALL it only when relevant — do not call as a reflex.

- \`find_similar_epics(query, topK)\` — semantic search over Epics this team has committed before. Use ONLY when the PO asks "have we done something like this?", you're considering scope/structure and a known pattern might exist, or the PO references a past Epic by name. Skip for routine edits (renames, reorders, label changes). Pass a natural-language query summarizing the current Epic's goal.

If the tool returns empty hits, ACKNOWLEDGE it ("no prior Epic matched") rather than pretending. Tool results are visible to you alone — paraphrase findings in plain language for the PO; never dump JSON.

==== MUTATIONS ====
- addTicket — { title, oneLiner, label, hierarchyType, afterTicketId? }
- removeTicket — { ticketId }
- renameTicket — { ticketId, title?, oneLiner? }
- changeLabel — { ticketId, label }
- reorderTicket — { ticketId, newIndex }
- editEpicTitle — { title } · editEpicDescription — { description }
- addDependency / removeDependency — { sourceTicketId, targetTicketId, linkKind }

label: developer|ux|qa|po · hierarchyType: story|task · linkKind: blockedBy|relatedTo|duplicates`;

const responseSchema = z.object({
  reply: z.string().min(1),
  mutations: z.array(blueprintMutationSchema).default([]),
});

function buildSystemPrompt(input: BlueprintChatInput): string {
  const ticketsBlock = input.currentBacklog.tickets.length
    ? input.currentBacklog.tickets
        .map(
          (t, i) =>
            `  #${i + 1} | id=${t.id} | "${t.title}" [${t.label}, ${t.hierarchyType}]${t.oneLiner ? ` — ${t.oneLiner}` : ""}`,
        )
        .join("\n")
    : "  (no tickets yet)";

  return [
    BASE_PROMPT,
    "",
    "==================================================",
    "=== CURRENT BACKLOG (live state, fresh this turn) ===",
    "==================================================",
    `Epic title: ${input.currentBacklog.epicTitle}`,
    `Epic description: ${input.currentBacklog.epicDescription}`,
    `Tickets (${input.currentBacklog.tickets.length} total):`,
    ticketsBlock,
    "==================================================",
    "REMINDER: Use the id=prop-xxxxxxxx values above for ALL ticketId fields in mutations. Never use the #N display number.",
    "==================================================",
  ].join("\n");
}

/**
 * Build the in-reply correction note appended to the AI's response when one or
 * more mutations failed validation. Speaks in the AI's voice so the PO sees a
 * single coherent message that acknowledges the failure. The augmented reply
 * lands in the next turn's chat history, giving the AI ground truth about
 * what actually happened — no retry round-trip needed.
 */
function buildFailureCorrection(failures: BlueprintMutationFailure[]): string {
  if (failures.length === 1) {
    const f = failures[0];
    return `\n\n— Correction: I also attempted \`${describeBlueprintMutationForFeedback(f.mutation)}\` but the system rejected it: ${f.reason}. That change was NOT applied.`;
  }
  const list = failures
    .map(
      (f) =>
        `  • \`${describeBlueprintMutationForFeedback(f.mutation)}\` — ${f.reason}`,
    )
    .join("\n");
  return `\n\n— Correction: ${failures.length} of my proposed changes were rejected by the system and were NOT applied:\n${list}`;
}

export async function runBlueprintChat(
  input: BlueprintChatInput,
  ctx?: { orgId?: string },
): Promise<BlueprintChatOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.5 });

  // Slice T: tool-calling pre-step. The current backlog is already inline in
  // the system prompt — what the AI can't see is the team's past Epics. Bind
  // `find_similar_epics` gated on corpus availability so first-run orgs skip
  // the loop entirely.
  const hasEpicCorpus =
    !!ctx?.orgId && (await countEpicEmbeddings(ctx.orgId)) > 0;
  const tools = [
    ...toolsForPhase("blueprintChat"),
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
    name: "blueprint_chat_response",
  });
  const result = await structured.invoke(messages, { signal });

  // Server-side validation drops mutations the AI hallucinated. Rather than
  // retry (costly on local Gemma), we splice a correction into the reply in
  // the AI's voice. The truth then lives in chat history for next turn.
  const { valid, failed } = validateBlueprintMutations(
    result.mutations as BlueprintMutation[],
    input.currentBacklog,
  );
  const reply = failed.length === 0 ? result.reply : result.reply + buildFailureCorrection(failed);

  return { reply, mutations: valid };
}
