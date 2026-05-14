import { z } from "zod";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import type {
  InspectorTurnInput,
  InspectorTurnOutput,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";

/**
 * Phase 5 Inspector — post-commit chat over a committed Epic.
 *
 * Inputs: the frozen EpicSnapshot, live ticket state, drift report, prior
 * transcript, and curated memories. Output: a grounded reply, plus zero
 * or more `insightsToSave` — durable observations the Inspector decides
 * are worth re-folding into future turns.
 *
 * The insight extraction is intentionally conservative — empty array on
 * most turns. Persisting noise pollutes future context.
 */

const SYSTEM_PROMPT = `You are the Inspector in a 4+1-phase AI orchestrator. The PO has committed an Epic and is now chatting with you about it post-hoc: what changed, what's at risk, what's the current state.

You have:
- The frozen EpicSnapshot (titles, descriptions, planning narrative, original assignments) at commit time.
- The live Ticket state (current titles, points, status).
- A precomputed DriftReport (changed/added/removed tickets, completion percent).
- The chat transcript so far.
- Previously-curated EpicMemories the team has chosen to remember.

Output discipline:
- reply: grounded in the snapshot + drift + live state. Cite specific numbers when relevant ("Sprint 2 is at 60% complete with 4 tickets done"). Never invent state not present in the input.
- insightsToSave: ALWAYS include the field. Empty array [] on most turns. ONLY populate when:
  * The PO explicitly asks you to remember something ("remember that…", "note that…", "save this").
  * You surface a durable observation the team would want to recall on a future Epic-review session.
  Each insight: { content: string, tags: string[], source: "chat" | "ticketEvolution" }. Use "chat" when the PO triggered the save; "ticketEvolution" when you derived it from drift.

Keep replies 2-5 sentences.`;

const responseSchema = z.object({
  reply: z.string().min(1),
  insightsToSave: z
    .array(
      z.object({
        content: z.string().min(1),
        tags: z.array(z.string()).max(8),
        source: z.enum(["chat", "ticketEvolution"]),
      }),
    )
    .max(3),
});

function summariseContext(input: InspectorTurnInput): string {
  const lines: string[] = [];
  const title = input.snapshot.backlog?.epicTitle ?? "(untitled Epic)";
  lines.push(`Epic: ${title}`);
  lines.push(
    `Snapshot committed: ${new Date(input.snapshot.createdAt).toLocaleDateString()}`,
  );

  if (input.snapshot.backlog) {
    lines.push("");
    lines.push("Frozen ticket plan:");
    for (const t of input.snapshot.backlog.tickets) {
      lines.push(
        `- ${t.title} [${t.label}, ${t.storyPoints ?? "?"} pts]`,
      );
    }
  }

  if (input.snapshot.sprintPlan?.reasoning) {
    lines.push("");
    lines.push(`Plan reasoning: ${input.snapshot.sprintPlan.reasoning}`);
  }

  lines.push("");
  lines.push(
    `Drift: completion ${input.drift.completionPercent}%, ${input.drift.changedTickets.length} changed, ${input.drift.addedTickets.length} added, ${input.drift.removedTickets.length} removed.`,
  );
  if (input.drift.changedTickets.length > 0) {
    lines.push(
      `Changed tickets: ${input.drift.changedTickets.slice(0, 5).map((t) => t.title).join("; ")}`,
    );
  }

  if (input.memories.length > 0) {
    lines.push("");
    lines.push("Previously-saved insights:");
    for (const m of input.memories.slice(0, 10)) {
      lines.push(`- ${m.content}${m.tags.length ? ` [${m.tags.join(", ")}]` : ""}`);
    }
  }
  return lines.join("\n");
}

export async function runInspectorTurn(
  input: InspectorTurnInput,
): Promise<InspectorTurnOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.4 });
  const structured = llm.withStructuredOutput(responseSchema, {
    name: "inspector_response",
  });

  // `transcript` already ends with the just-sent user turn.
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(summariseContext(input)),
    ...input.transcript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  const result = await structured.invoke(messages);
  return {
    reply: result.reply,
    insightsToSave: result.insightsToSave,
  };
}
