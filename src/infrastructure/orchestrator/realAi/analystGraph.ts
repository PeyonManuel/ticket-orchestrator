import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type {
  AnalystTurnInput,
  AnalystTurnOutput,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";
import { toolsForPhase } from "../tools";
import { createFindSimilarEpicsTool } from "../tools/findSimilarEpics";
import { countEpicEmbeddings } from "../rag/store";
import { runAgentLoop } from "./agentLoop";

/**
 * Phase 1 Analyst — Discovery / Brainstorming.
 *
 * Server-only. Wraps Gemini in a single structured-output call. The reply +
 * (optional) BrainstormSummary are returned as one JSON object the domain
 * machine consumes without further parsing.
 */

const SYSTEM_PROMPT = `You are the Analyst in a 4-phase AI orchestrator that helps a Product Owner (PO) discover and structure software Epics.

Phase 1 (Discovery / Brainstorm) — your role:
- Probe the PO for: primary user, jobs-to-be-done, deadlines, hard constraints.
- Ask focused follow-up questions, one or two per turn. Avoid open-ended fishing.
- After enough substantive turns (typically 2-3) — or when the PO signals readiness ("ready", "continue", "let's go") — produce a concise BrainstormSummary.

Tool use:
- If a 'find_similar_epics' tool is available, call it once early (after the PO's first substantive message) with a short query describing the epic. Use the hits to inform follow-up questions ("we built X last quarter — is this similar, or different in Y way?"). Don't mention the tool to the PO; just let the insights show through your questions.
- Don't call the tool more than twice per conversation — it doesn't get fresher results.

Output JSON contract:
- "reply": always non-empty. A natural-language response to the PO.
- "summary": null while brainstorming. When ready to advance, an object:
    { "summary": "<2-3 sentence Epic synopsis>", "goals": ["<goal 1>", "<goal 2>", ...] }
  Provide 2-4 concrete goals (verb-led, scoped to the Epic).

Set summary to non-null ONLY when you are ready to hand off to the Architect. While summary is null, your reply should drive the conversation forward (a question, a clarification, a paraphrase). When summary is non-null, your reply should be a brief handoff line — the UI will surface the summary card separately.`;

// Structured output schema for the LLM (matches AnalystTurnOutput shape).
const analystResponseSchema = z.object({
  reply: z.string().min(1).describe("Conversational response to the PO."),
  summary: z
    .object({
      summary: z.string().min(1).describe("2-3 sentence Epic synopsis."),
      goals: z
        .array(z.string().min(1))
        .min(2)
        .max(5)
        .describe("2-4 verb-led, scoped Epic goals."),
    })
    .nullable()
    .describe(
      "Null while brainstorming; populated when ready to hand off to the Architect.",
    ),
});

export async function runAnalystTurn(
  input: AnalystTurnInput,
  ctx?: { orgId?: string },
): Promise<AnalystTurnOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.6 });

  // Phase 1 tools: registry (currently context-free entries, none today) plus
  // a per-org RAG tool when we have an orgId AND the org has past committed
  // epics. Skipping the tool on fresh orgs avoids an entire agent-loop round
  // trip that would return zero hits anyway — keeps first-time-user latency
  // identical to pre-RAG. The tool factory closes over orgId so the LLM
  // cannot target a different tenant via tool args.
  const hasRagCorpus =
    !!ctx?.orgId && (await countEpicEmbeddings(ctx.orgId)) > 0;
  const tools = [
    ...toolsForPhase("phase1"),
    ...(hasRagCorpus ? [createFindSimilarEpicsTool(ctx!.orgId!)] : []),
  ];

  // `transcript` already ends with the just-sent user turn — the machine
  // appends it before invoking the actor. `input.userMessage` is just a
  // convenience pointer; including it again would duplicate the prompt.
  const initialMessages: BaseMessage[] = [
    new SystemMessage(SYSTEM_PROMPT),
    ...input.transcript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  // Tool-use pre-step: model can call `find_similar_epics` to ground its
  // probing questions in real org history before producing the structured
  // analyst reply. No-op when no tools (e.g. unit tests calling without ctx).
  const messages = await runAgentLoop(llm, tools, initialMessages);

  const structured = llm.withStructuredOutput(analystResponseSchema, {
    name: "analyst_response",
  });
  const result = await structured.invoke(messages);
  return analystResponseSchema.parse(result);
}
