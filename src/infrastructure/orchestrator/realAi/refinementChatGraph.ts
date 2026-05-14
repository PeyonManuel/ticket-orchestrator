import { z } from "zod";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import type {
  RefinementChatInput,
  RefinementChatOutput,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";

/**
 * Phase 3 per-ticket chat: PO discusses one specific ticket with the
 * Controller. Scope of the chat is bounded to that ticket (plus minimal
 * Epic context) — the PO uses it to clarify story points, AC, risks,
 * or implementation trade-offs.
 */

const SYSTEM_PROMPT = `You are the Controller in a 4-phase AI orchestrator. You are in Phase 3 (Deep Dive) helping a PO refine a SINGLE ticket. You already produced an initial refinement (description, AC, story points, risks); now the PO wants to discuss.

Stay grounded in this one ticket. Don't drift into restructuring the backlog or proposing new tickets (that's Phase 2). If the PO is wrestling with a trade-off — points estimate, AC phrasing, risks — give a direct, opinionated answer with reasoning.

Keep replies focused: 2-4 sentences. Use a short code-like example only if it clarifies an AC.`;

const responseSchema = z.object({
  reply: z.string().min(1),
});

export async function runRefinementChat(
  input: RefinementChatInput,
): Promise<RefinementChatOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.5 });
  const structured = llm.withStructuredOutput(responseSchema, {
    name: "refinement_chat_response",
  });

  const ticketContext = [
    `Ticket: ${input.ticket.title}`,
    `One-liner: ${input.ticket.oneLiner}`,
    `Label: ${input.ticket.label}`,
    `Description: ${input.ticket.description || "(not yet set)"}`,
    `Story points: ${input.ticket.storyPoints ?? "null"}`,
    `Acceptance criteria:`,
    ...input.ticket.acceptanceCriteria.map((ac) => `- ${ac}`),
    `Risks:`,
    ...input.ticket.risks.map((r) => `- ${r}`),
    ``,
    `Epic context: ${input.backlog.epicTitle} — ${input.backlog.epicDescription}`,
  ].join("\n");

  // `transcript` already ends with the just-sent user turn.
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(ticketContext),
    ...input.transcript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  return structured.invoke(messages);
}
