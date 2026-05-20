import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type {
  InspectorTurnInput,
  InspectorTurnOutput,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";
import { toolsForPhase } from "../tools";
import { createFindSimilarEpicsTool } from "../tools/findSimilarEpics";
import { createFindSimilarTicketsTool } from "../tools/findSimilarTickets";
import { countEpicEmbeddings, countTicketEmbeddings } from "../rag/store";
import { runAgentLoop } from "./agentLoop";

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

## On-demand context (tools)

You may have these tools available; call them only when the PO's question can't be answered from the Epic context above.

- \`find_similar_epics(query, topK)\` — search past committed Epics in this org. Use when the PO asks "have we built something like this?" or you want to compare patterns ("this drift looks like what happened with the auth Epic"). Skip for status questions about THIS Epic.
- \`find_similar_tickets(query, topK)\` — semantic search across past committed tickets with their stored points. Use when the PO asks about effort/estimation across Epics, or a ticket here reminds you of one elsewhere.

Tool results are visible only to you — paraphrase them in plain language; never dump JSON. If a tool returns empty hits, acknowledge it instead of pretending.

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
  const commitDate = new Date(input.snapshot.createdAt).toLocaleDateString();
  lines.push(`Epic: ${title}`);
  lines.push(`Snapshot committed: ${commitDate}`);

  const removedIds = new Set(input.drift.removedTickets.map((t) => t.id));

  if (input.snapshot.backlog) {
    lines.push("");
    lines.push("Frozen ticket plan:");
    for (const t of input.snapshot.backlog.tickets) {
      const removedTag = removedIds.has(t.id) ? " [REMOVED since commit]" : "";
      lines.push(
        `- ${t.title} [${t.label}, ${t.storyPoints ?? "?"} pts]${removedTag}`,
      );
    }
  }

  // Full info on removed tickets: the PO may ask "why did we drop X" or
  // "what was X about" — without the description here the AI can only echo
  // the title. Removal timestamp is the snapshot date (best diff-only
  // approximation: we know they existed at commit and don't exist now).
  if (input.drift.removedTickets.length > 0 && input.snapshot.backlog) {
    lines.push("");
    lines.push(`Removed since commit (${commitDate}) — full ticket info:`);
    for (const removed of input.drift.removedTickets) {
      const full = input.snapshot.backlog.tickets.find((t) => t.id === removed.id);
      if (!full) {
        lines.push(`- ${removed.title} (no snapshot record)`);
        continue;
      }
      const sketch =
        full.oneLiner?.trim() ||
        full.description?.trim().split("\n").slice(0, 2).join(" ") ||
        "(no description captured)";
      lines.push(
        `- ${full.title} [${full.label}, ${full.storyPoints ?? "?"} pts] — ${sketch}`,
      );
    }
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
  ctx?: { orgId?: string },
): Promise<InspectorTurnOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.4 });

  // Slice T: tool-calling pre-step. Inspector benefits from cross-Epic search
  // (its "Living Memory" persona) more than any other chat. Bind RAG tools
  // gated on corpus availability so first-run orgs skip the loop entirely.
  const hasEpicCorpus =
    !!ctx?.orgId && (await countEpicEmbeddings(ctx.orgId)) > 0;
  const hasTicketCorpus =
    !!ctx?.orgId && (await countTicketEmbeddings(ctx.orgId)) > 0;
  const tools = [
    ...toolsForPhase("inspectorChat"),
    ...(hasEpicCorpus ? [createFindSimilarEpicsTool(ctx!.orgId!)] : []),
    ...(hasTicketCorpus ? [createFindSimilarTicketsTool(ctx!.orgId!)] : []),
  ];

  // Context lives in the system prompt. Transcript is pure Human/AI alternation
  // so Gemini's strict turn-order requirement is satisfied.
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
    name: "inspector_response",
  });
  const result = await structured.invoke(messages, { signal });

  return {
    reply: result.reply,
    insightsToSave: result.insightsToSave,
  };
}
