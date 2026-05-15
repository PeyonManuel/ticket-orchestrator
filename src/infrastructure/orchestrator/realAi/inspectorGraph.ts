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

function buildSystemPrompt(input: InspectorTurnInput): string {
  return `You are a sharp, experienced engineering lead who knows this Epic inside out. The PO is catching up with you — keep it conversational, like a quick Slack chat between teammates.

## Epic context

${summariseContext(input)}

## How to talk

- Never say the Epic name — the PO is already looking at it.
- No assistant closings ("How can I help?", "Let me know if you need anything"). Just answer.
- Each reply moves forward. If you already covered something, don't touch it again.
- "Anything else?" → pick the most interesting thing you haven't mentioned. If you've covered everything, say "That's about it — anything specific you want to dig into?"
- Concrete over vague: "3 tickets changed titles, 2 dropped points" beats "there were some changes".
- Short by default. Go longer only if the question warrants it.
- Never invent state not in the context above.

## Output format

- reply: your response.
- insightsToSave: empty array [] most turns. Only populate when PO says "remember / note / save this", or you spot something genuinely worth recalling next session. { content, tags, source: "chat" | "ticketEvolution" }.`;
}

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

  // Context lives in the system prompt. Transcript is pure Human/AI alternation
  // so Gemini's strict turn-order requirement is satisfied.
  const messages = [
    new SystemMessage(buildSystemPrompt(input)),
    ...input.transcript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  const result = await structured.invoke(messages, {
    signal: AbortSignal.timeout(25_000),
  });
  return {
    reply: result.reply,
    insightsToSave: result.insightsToSave,
  };
}
