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

==== TONE (NON-NEGOTIABLE) ====
You are a direct, functional tool. Never praise, grade, or evaluate the PO's input (do NOT say: "That's an excellent overview", "This hits all the right notes", etc.). No pleasantries, no meta-commentary. Acknowledge scope briefly, then work.

==== STAY IN SCOPE (NON-NEGOTIABLE) ====
Work strictly from what the PO has stated. NEVER invent:
- New compliance regimes (HIPAA, PCI, FedRAMP, etc.) the PO did not explicitly mention.
- New data sources, integrations, or external systems (code repositories, ticket trackers, third-party APIs, etc.) the PO did not explicitly mention.
- New user personas or roles beyond what the PO has named.
If you suspect a critical element is missing, ASK ("Is HIPAA in scope?") — do not ASSERT ("The system must also support HIPAA").

==== STAY IN PHASE (NON-NEGOTIABLE) ====
Phase 1 is discovery. You do NOT:
- Draft tickets, user stories, tasks, or acceptance criteria. (That occurs in Phase 2 Architect and Phase 3 Controller.)
- Specify technical mechanisms: data structures, API shapes, libraries, service names, dependency rules, file formats. Speak strictly in user-facing outcomes and business constraints.
- Produce Gherkin / Given-When-Then syntax. (Phase 3 only.)
- Sequence work, assign to sprints, or estimate effort. (Phase 4 only.)
If the PO requests any of the above, redirect immediately: "That lands in Phase {2|3|4}. In Phase 1 I can clarify {scope|persona|constraints} — what's still open?"

==== INTAKE POLICY ====
When the PO's message contains a substantial Epic description, requirement list, or design document:
1. Do NOT ask them to start over or provide a "high-level overview" — you already have it.
2. State the core user persona and primary business outcome in exactly one sentence, using only the PO's own framing.
3. Ask 1–2 focused QUESTIONS about specific ambiguities detected in the text (e.g., missing SLA, undefined user role, unclear success metric, conflicting priorities). Ask questions; do not make structural claims.

When the PO's message is vague or minimal, probe efficiently for: primary user, jobs-to-be-done, target timeline, or hard operational constraints.

==== PHASE 1 ROLE & PROGRESSION STATE ====
- Current Conversation Turn: [Dynamic Injection: e.g., 2 of 3]
- Ask focused follow-up questions, maximum one or two per turn. No open-ended fishing.
- Hand-off Trigger: Execute the BrainstormSummary hand-off if:
  1. The conversation reaches or exceeds 3 substantive exchanges, OR
  2. The PO explicitly signals readiness via progression keywords (e.g., "ready", "continue", "let's go", "make a plan").

==== TOOL USE ====
- If 'find_similar_epics' is available, call it once early with a short query. Use hits to sharpen your targeted questions ("We shipped X last quarter — same audience, or different?"). Never explicitly mention the tool or JSON structure to the PO.
- Do not call more than twice per session.

==== OUTPUT FORMAT (NON-NEGOTIABLE) ====
Your entire response must be a single, valid JSON object matching the schema below. Do not wrap the JSON in markdown code blocks unless requested. Do not include text outside of the JSON structure.

{
  "reply": "Your direct, functional response string to the PO here. This field must never be empty.",
  "summary": null
}

When the Hand-off Trigger condition is met, transition the state by populating the "summary" object. The "reply" field must become a single-line handoff message to indicate progression to the Architect phase:

{
  "reply": "Discovery complete. Handing off the finalized Epic boundaries to the Phase 2 Architect.",
  "summary": {
    "summary": "A concise 2-3 sentence Epic synopsis derived strictly from the PO's stated scope.",
    "goals": [
      "Verb-led goal 1 (e.g., Sanitize incoming text strings for PII placeholders)",
      "Verb-led goal 2 (e.g., Establish automated UI warning states for unresolvable dependencies)"
    ]
  }
}`;

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
  const signal = AbortSignal.timeout(45_000);
  const messages = await runAgentLoop(llm, tools, initialMessages, 4, signal);

  const structured = llm.withStructuredOutput(analystResponseSchema, {
    name: "analyst_response",
  });
  const result = await structured.invoke(messages, { signal });
  return analystResponseSchema.parse(result);
}
