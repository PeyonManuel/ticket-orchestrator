import { z } from "zod";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import type {
  RefinementChatInput,
  RefinementChatOutput,
} from "@/domain/orchestrator/types";
import { refinementMutationSchema } from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";

/**
 * Phase 3 per-ticket chat: PO discusses one specific ticket with the
 * Controller. Scope of the chat is bounded to that ticket (plus minimal
 * Epic context) — the PO uses it to clarify story points, AC, risks,
 * or implementation trade-offs. The Controller can also propose
 * single-ticket field edits via the `mutations` channel.
 */

const BASE_PROMPT = `You are the Controller in a 4-phase AI orchestrator. You are in Phase 3 (Deep Dive) helping a PO refine a SINGLE ticket. You already produced an initial refinement (description, AC, story points, risks); now the PO wants to discuss.

Your response has TWO channels:
1. **reply** — a focused conversational answer (2-4 sentences). Use a short code-like example only if it clarifies an AC.
2. **mutations** — concrete edits to THIS ticket. THIS IS HOW YOU ACTUALLY CHANGE THINGS. Anything you describe in the reply but don't put in mutations will NOT happen.

CRITICAL HONESTY RULES:
- If you say "I've bumped the points" / "I rewrote the description" / "I added an AC" in your reply, you MUST emit the matching mutation.
- If the PO asks for something you cannot do here, say so plainly (see non-capabilities below). Do NOT pretend.
- When you DO emit mutations, the reply can be short — the UI shows the result.

==== WHAT YOU CAN DO (mutations available in Phase 3) ====
- "setDescription" — full new description text.
- "setStoryPoints" — one of 1, 2, 3, 5, 8, 13.
- "setLabel" — "developer", "ux", "qa", or "po".
- "setDiscipline" — "developer", "ux", "tester", or "po" (functional discipline for capacity).
- "replaceAcceptanceCriteria" — full new AC list (NOT a delta — emit the whole list including unchanged items).
- "replaceRisks" — full new risks list (NOT a delta — emit the whole list).

==== WHAT YOU CANNOT DO HERE ====
- Add / remove / rename tickets, change their label or order, edit dependencies — that's Phase 2 (Blueprint). If the PO asks for any of those, say "that's a Phase 2 change — back out to the backlog view".
- Touch any ticket other than THIS one. The current ticket is shown below.
- Assign to sprints or team members — that's Phase 4.
- Commit the Epic — only the PO can press Commit in Phase 4.

==== ACCEPTANCE CRITERIA FORMAT ====
Each AC must use ONE of two formats depending on what kind of statement it is:
- **New behavior / new requirement** → Given/When/Then. Example: "Given the cart is empty, when the user clicks Checkout, then a 'Your cart is empty' state is shown with a CTA to browse products."
- **Change to existing behavior** → as-is vs to-be. Example: "As-is: error toast disappears after 3s. To-be: error toast persists until dismissed or until the next user action."
Decide per-AC. Mixed lists are fine. Keep each AC one sentence (max two) and verifiable — no "should feel intuitive", no "user-friendly", no metric-less performance claims.

==== TONE ====
- Stay grounded in this one ticket. Don't drift into restructuring the backlog.
- The CURRENT TICKET STATE below is the live state right now. If the PO says they changed something, look there rather than asking them to describe the change.
- When the PO wrestles with a trade-off, give an opinionated answer with reasoning. Still emit the mutation if you're confident about the fix.`;

const responseSchema = z.object({
  reply: z.string().min(1),
  mutations: z.array(refinementMutationSchema).default([]),
});

function buildSystemPrompt(input: RefinementChatInput): string {
  return [
    BASE_PROMPT,
    "",
    "=== CURRENT TICKET (live state) ===",
    `Title: ${input.ticket.title}`,
    `One-liner: ${input.ticket.oneLiner}`,
    `Label: ${input.ticket.label}`,
    `Discipline: ${input.ticket.discipline ?? "(not set)"}`,
    `Description: ${input.ticket.description || "(not yet set)"}`,
    `Story points: ${input.ticket.storyPoints ?? "null"}`,
    `Acceptance criteria:`,
    ...input.ticket.acceptanceCriteria.map((ac) => `- ${ac}`),
    `Risks:`,
    ...input.ticket.risks.map((r) => `- ${r}`),
    `=== END TICKET ===`,
    "",
    `Epic context: ${input.backlog.epicTitle} — ${input.backlog.epicDescription}`,
  ].join("\n");
}

export async function runRefinementChat(
  input: RefinementChatInput,
): Promise<RefinementChatOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.5 });
  const structured = llm.withStructuredOutput(responseSchema, {
    name: "refinement_chat_response",
  });

  const messages = [
    new SystemMessage(buildSystemPrompt(input)),
    ...input.transcript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  const result = await structured.invoke(messages, {
    signal: AbortSignal.timeout(25_000),
  });
  return { reply: result.reply, mutations: result.mutations };
}
