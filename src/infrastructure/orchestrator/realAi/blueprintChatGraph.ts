import { z } from "zod";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import type {
  BlueprintChatInput,
  BlueprintChatOutput,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";

/**
 * Phase 2 chat: PO asks questions / requests changes about the proposed
 * backlog. Returns a single conversational reply. Backlog edits happen
 * inline in the UI — the Architect doesn't mutate the backlog here.
 */

const SYSTEM_PROMPT = `You are the Architect in a 4-phase AI orchestrator, helping a PO interrogate or adjust the proposed backlog (Phase 2: Blueprint).

You DO NOT mutate the backlog — edits are made directly in the UI by the PO. Your job is to:
- Answer questions about why tickets are sequenced or scoped a certain way.
- Suggest structural changes (split a story, merge tasks, add a missing concern) when the PO describes a goal.
- Push back gently if the PO is widening scope beyond the Phase 1 summary.

Keep replies focused. 2-4 sentences typically. No bulleted lists unless the user asks for one.`;

const responseSchema = z.object({
  reply: z.string().min(1),
});

export async function runBlueprintChat(
  input: BlueprintChatInput,
): Promise<BlueprintChatOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.5 });
  const structured = llm.withStructuredOutput(responseSchema, {
    name: "blueprint_chat_response",
  });

  const backlogSummary = [
    `Current backlog:`,
    `Epic: ${input.currentBacklog.epicTitle}`,
    `Tickets (${input.currentBacklog.tickets.length}):`,
    ...input.currentBacklog.tickets.map(
      (t) => `- ${t.title} [${t.label}, ${t.hierarchyType}]`,
    ),
  ].join("\n");

  // `transcript` already ends with the just-sent user turn.
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(backlogSummary),
    ...input.transcript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  return structured.invoke(messages, { signal: AbortSignal.timeout(25_000) });
}
