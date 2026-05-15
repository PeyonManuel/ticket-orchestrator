import { z } from "zod";
import { SystemMessage, HumanMessage, AIMessage } from "@langchain/core/messages";
import type {
  PlannerChatInput,
  PlannerChatOutput,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";

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

const SYSTEM_PROMPT = `You are the Planner in a 4-phase AI orchestrator. The PO is in Phase 4 (Sprint Plan) reviewing the proposed sprint allocation. Your job is to explain the plan and answer questions — capacity, sequencing, assignee choice, overflow.

Stay grounded in the actual numbers provided. If a sprint is over capacity, name which one and by how much. If a ticket is unassigned, explain why (missing role, no capacity left). Be specific — "Sprint 2 is at 110% of dev capacity (22 points vs 20 cap)" is better than "Sprint 2 is overloaded".

You do NOT mutate the plan. updatedPlan must always be null in your response. Plan edits happen via the UI.

Keep replies 2-5 sentences. Use a short list only if comparing multiple sprints.`;

const responseSchema = z.object({
  reply: z.string().min(1),
});

function summarisePlan(input: PlannerChatInput): string {
  const lines: string[] = [];
  lines.push(`Plan reasoning: ${input.currentPlan.reasoning}`);
  lines.push("");
  for (const s of input.sprints) {
    const assigned = input.currentPlan.assignments.filter((a) => a.sprintId === s.id);
    const points = assigned.reduce((sum, a) => {
      const t = input.backlog.tickets.find((tk) => tk.id === a.ticketId);
      return sum + (t?.storyPoints ?? 3);
    }, 0);
    lines.push(
      `Sprint "${s.name}": ${assigned.length} tickets, ${points} pts (capacity ${s.capacityPoints}).`,
    );
  }
  const unassigned = input.currentPlan.assignments.filter((a) => !a.sprintId);
  if (unassigned.length > 0) {
    lines.push(`Unassigned to any sprint: ${unassigned.length} ticket(s).`);
  }
  const overflow = input.currentPlan.overflow ?? [];
  if (overflow.length > 0) {
    lines.push(`Overflow (unschedulable): ${overflow.length} ticket(s).`);
  }
  return lines.join("\n");
}

export async function runPlannerChat(
  input: PlannerChatInput,
): Promise<PlannerChatOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.4 });
  const structured = llm.withStructuredOutput(responseSchema, {
    name: "planner_chat_response",
  });

  const memberList = input.members
    .map((m) => `${m.fullName} [${m.role}]`)
    .join(", ");

  const planText = summarisePlan(input);

  // `plannerTranscript` already ends with the just-sent user turn.
  const messages = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      `Team: ${memberList || "(none)"}\n\n${planText}`,
    ),
    ...input.plannerTranscript.map((t) =>
      t.role === "user" ? new HumanMessage(t.text) : new AIMessage(t.text),
    ),
  ];

  const result = await structured.invoke(messages, { signal: AbortSignal.timeout(25_000) });
  return { reply: result.reply, updatedPlan: null };
}
