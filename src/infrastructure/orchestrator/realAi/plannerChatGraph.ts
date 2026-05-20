import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  AIMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type {
  PlannerChatInput,
  PlannerChatOutput,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";
import { toolsForPhase } from "../tools";
import { createFindSimilarEpicsTool } from "../tools/findSimilarEpics";
import { createFindSimilarTicketsTool } from "../tools/findSimilarTickets";
import { createGetProposalDetailsTool } from "../tools/getProposalDetails";
import { countEpicEmbeddings, countTicketEmbeddings } from "../rag/store";
import { runAgentLoop } from "./agentLoop";

/**
 * Phase 4 planner chat. The plan itself is produced by the deterministic
 * `slicingPolicy.produceSprintPlan` — this actor only handles conversational
 * back-and-forth about it: "why is sprint 2 overloaded", "can we move ticket X",
 * "what happens if we add capacity"...
 *
 * For now `updatedPlan` is always null. Plan mutations come from the PO via
 * the UI affordances (reassign dropdowns, drag-and-drop). The chat is
 * explanatory.
 */

const BASE_PROMPT = `You are the Planner in a 4-phase AI orchestrator. The PO is in Phase 4 (Sprint Plan) reviewing the proposed sprint allocation. Your job is to explain the plan and answer questions — capacity, sequencing, assignee choice, overflow.

Stay grounded in the actual numbers provided. If a sprint is over capacity, name which one and by how much. If a ticket is unassigned, explain why (missing role, no capacity left). Be specific — "Sprint 2 is at 110% of dev capacity (22 points vs 20 cap)" is better than "Sprint 2 is overloaded".

The CURRENT PLAN STATE below is the live state you see right now — the PO may have reassigned tickets between turns. Treat it as authoritative for this turn. If the PO says they moved something, look at the current plan rather than asking them to describe the change.

When the PO references a ticket by name, position, or topic, find the matching \`prop-xxxxxxxx\` id in the plan listing. Use that id to call tools — never invent ids, never use "#N" display numbers.

You do NOT mutate the plan. updatedPlan must always be null in your response. Plan edits happen via the UI.

==== ON-DEMAND CONTEXT (TOOLS) ====
The plan listing above gives you each ticket's id, title, label, points, sprint, and assignee — enough to answer most capacity/sequencing questions directly. For deeper questions (scope, risks, AC, dependencies on a specific ticket), call a tool. Tool results are visible only to you — paraphrase them in plain language for the PO; never dump JSON. If empty, acknowledge it rather than pretending.

- \`get_proposal_details(ticketId)\` — full field block (description, oneLiner, acceptance criteria, risks, dependencies) for any ticket in the current backlog. Use when the PO asks "what does X involve?", "what are the risks on X?", "does X depend on anything?", or you're suggesting a sequence change and want to verify blockers before answering. Skip for pure capacity math.
- \`find_similar_tickets(query, topK)\` — past committed tickets with their stored points. Use when the PO asks "is X really 5 points?" or "did similar work usually take that long?". Skip for capacity-math questions answerable from the plan above.
- \`find_similar_epics(query, topK)\` — past Epics this team committed. Use when the PO asks "how did we plan a similar Epic?" or "did sprint sequencing like this work before?". Skip for routine plan explanation.

Keep replies 2-5 sentences. Use a short list only if comparing multiple sprints.`;

const responseSchema = z.object({
  reply: z.string().min(1),
});

function summarisePlan(input: PlannerChatInput): string {
  const lines: string[] = [];
  const memberById = new Map(input.members.map((m) => [m.userId, m]));
  const ticketLine = (a: { ticketId: string; assigneeUserId: string | null }) => {
    const t = input.backlog.tickets.find((tk) => tk.id === a.ticketId);
    if (!t) return `  - ${a.ticketId} (ticket missing from backlog)`;
    const discipline = t.discipline ?? t.label ?? "?";
    const assignee = a.assigneeUserId
      ? (memberById.get(a.assigneeUserId)?.fullName ?? a.assigneeUserId)
      : "unassigned";
    return `  - ${t.id} "${t.title}" [${discipline}, ${t.storyPoints ?? "?"} pts] → ${assignee}`;
  };

  for (const s of input.sprints) {
    const assigned = input.currentPlan.assignments.filter((a) => a.sprintId === s.id);
    const epicPoints = assigned.reduce((sum, a) => {
      const t = input.backlog.tickets.find((tk) => tk.id === a.ticketId);
      return sum + (t?.storyPoints ?? 3);
    }, 0);
    const existingPoints = s.usedPoints ?? 0;
    const totalUsed = epicPoints + existingPoints;
    const existingNote = existingPoints > 0 ? `, ${existingPoints} pts already from other tickets` : "";
    lines.push(
      `Sprint "${s.name}" (id=${s.id}): ${assigned.length} new tickets, ${epicPoints} epic pts + ${existingPoints} existing = ${totalUsed} total used (capacity ${s.capacityPoints})${existingNote}.`,
    );
    for (const a of assigned) lines.push(ticketLine(a));
  }

  // Tickets the planner created proposed sprints for, or that landed assignment-only
  // (sprintId set to a sprint not in the list — defensive). The proposed sprints'
  // assignments still surface here as "unassigned to listed sprint", which is fine
  // for chat reasoning.
  const listedSprintIds = new Set(input.sprints.map((s) => s.id));
  const otherAssigned = input.currentPlan.assignments.filter(
    (a) => a.sprintId && !listedSprintIds.has(a.sprintId),
  );
  if (otherAssigned.length > 0) {
    lines.push(`Assigned to proposed/extra sprints: ${otherAssigned.length} ticket(s).`);
    for (const a of otherAssigned) lines.push(ticketLine(a));
  }

  const unassigned = input.currentPlan.assignments.filter((a) => !a.sprintId);
  if (unassigned.length > 0) {
    lines.push(`Unassigned to any sprint: ${unassigned.length} ticket(s).`);
    for (const a of unassigned) lines.push(ticketLine(a));
  }
  return lines.join("\n");
}

export async function runPlannerChat(
  input: PlannerChatInput,
  ctx?: { orgId?: string },
): Promise<PlannerChatOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.4 });

  // Tool-calling pre-step (Slice T, extended). Planner chat is informational,
  // not mutational. `get_proposal_details` lets the AI fetch deep ticket info
  // on demand — the plan summary only carries title/label/points/assignee so
  // the prompt stays small. RAG tools are gated on corpus availability so
  // first-run orgs skip them.
  const hasEpicCorpus =
    !!ctx?.orgId && (await countEpicEmbeddings(ctx.orgId)) > 0;
  const hasTicketCorpus =
    !!ctx?.orgId && (await countTicketEmbeddings(ctx.orgId)) > 0;
  const tools = [
    ...toolsForPhase("plannerChat"),
    createGetProposalDetailsTool(input.backlog.tickets),
    ...(hasEpicCorpus ? [createFindSimilarEpicsTool(ctx!.orgId!)] : []),
    ...(hasTicketCorpus ? [createFindSimilarTicketsTool(ctx!.orgId!)] : []),
  ];

  const memberList = input.members
    .map((m) => `${m.fullName} [${m.role}]`)
    .join(", ");

  const planText = summarisePlan(input);

  // Plan state lives in the SystemMessage so the model treats it as
  // authoritative current context. Transcript then flows as clean
  // Human/AI alternation (Gemini requires this).
  const systemPrompt = [
    BASE_PROMPT,
    "",
    "=== CURRENT PLAN (live state) ===",
    `Team: ${memberList || "(none)"}`,
    planText,
    "=== END PLAN ===",
  ].join("\n");

  const initialMessages: BaseMessage[] = [
    new SystemMessage(systemPrompt),
    ...input.plannerTranscript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  const signal = AbortSignal.timeout(30_000);
  const messages =
    tools.length > 0
      ? await runAgentLoop(llm, tools, initialMessages, 3, signal)
      : initialMessages;

  const structured = llm.withStructuredOutput(responseSchema, {
    name: "planner_chat_response",
  });
  const result = await structured.invoke(messages, { signal });
  return { reply: result.reply, updatedPlan: null };
}
