import { z } from "zod";
import {
  SystemMessage,
  HumanMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import type {
  ArchitectInput,
  ArchitectOutput,
} from "@/domain/orchestrator/types";
import { createOrchestratorLLM } from "../llm";
import { toolsForPhase } from "../tools";
import { createFindSimilarEpicsTool } from "../tools/findSimilarEpics";
import { countEpicEmbeddings } from "../rag/store";
import { runAgentLoop } from "./agentLoop";

/**
 * Phase 2 Architect — proposes the initial backlog from a Phase 1 summary.
 *
 * Returns titles + one-liners + labels + hierarchyType. Description, acceptance
 * criteria, story points, and risks stay null/empty — those land in Phase 3
 * (Controller). Keeping the Architect's output shape minimal makes the LLM's
 * job easier and matches how the mock partitioned responsibility.
 */

const SYSTEM_PROMPT = `You are the Architect in a 4-phase AI orchestrator. The Analyst just handed you a Phase 1 summary; you produce the initial backlog of tickets.

Output discipline:
- Title: short and concrete (e.g. "Add API endpoints for cart CRUD"). No prefixes like "Story:" or "Task:".
- One-liner: a single sentence that scopes the work tighter than the title.
- Label drives Phase 4 capacity allocation. Use exactly one of: "developer" (engineering work), "ux" (design / UX research / interaction), "qa" (test automation / quality), "po" (product spec / discovery / coordination).
- hierarchyType "story" for user-visible outcomes; "task" for internal supporting work.
- Consider the magnitude of the work to decide how many tickets to propose. Cover: data model / contracts, core flow, edge cases (empty / error / loading), persistence, observability, tests, rollout/flag, UX polish.
- Do not invent scope beyond the Phase 1 summary. If the summary explicitly excludes something, exclude it.
- Dependencies: after drafting the ticket list, add blockedBy links where one ticket genuinely cannot start until another finishes (e.g. "DB schema" blockedBy "data model design"). Use targetIndex (0-based position in the tickets array). Leave empty when order is flexible. Never create cycles.

Tool use:
- If 'find_similar_epics' is available, call it once with a short query describing this epic BEFORE drafting the backlog. Mirror successful structure (granularity, ordering, label distribution) when patterns clearly match. If hits are empty or unrelated, proceed from the summary alone.

Do NOT fill description, acceptanceCriteria, storyPoints, or risks — the Controller does that in Phase 3. Leave them as defaults.`;

const ticketProposalDraftSchema = z.object({
  hierarchyType: z.enum(["story", "task"]),
  title: z.string().min(1),
  oneLiner: z.string().min(1),
  label: z.enum(["developer", "ux", "qa", "po"]),
  dependencies: z
    .array(
      z.object({
        kind: z.enum(["blockedBy", "relatedTo", "duplicates"]),
        targetIndex: z
          .number()
          .int()
          .describe("0-based index of the other ticket in this tickets array"),
      }),
    )
    .default([])
    .describe(
      "Dependency links. Use blockedBy when this ticket genuinely cannot start before another finishes. Use relatedTo sparingly. Avoid cycles.",
    ),
});

const architectResponseSchema = z.object({
  epicTitle: z.string().min(1).describe("Short Epic name. No 'Epic —' prefix."),
  epicDescription: z
    .string()
    .min(1)
    .describe("2-3 sentence Epic description. Mirror the Phase 1 summary."),
  tickets: z.array(ticketProposalDraftSchema).min(4).max(15),
});

function uid(prefix: string): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    "randomUUID" in globalThis.crypto
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function runArchitectBacklog(
  input: ArchitectInput,
  ctx?: { orgId?: string },
): Promise<ArchitectOutput> {
  const llm = createOrchestratorLLM({ temperature: 0.5 });

  // Same fast-path as analystGraph: skip the RAG tool when the org has no
  // committed epics yet, so first-time users don't pay an agent-loop round
  // trip for an empty result set.
  const hasRagCorpus =
    !!ctx?.orgId && (await countEpicEmbeddings(ctx.orgId)) > 0;
  const tools = [
    ...toolsForPhase("phase2"),
    ...(hasRagCorpus ? [createFindSimilarEpicsTool(ctx!.orgId!)] : []),
  ];

  const summaryText = [
    `Summary: ${input.summary.summary}`,
    `Goals:`,
    ...input.summary.goals.map((g) => `- ${g}`),
  ].join("\n");

  // Redraft path: include the PO's prior feedback from the blueprint chat so
  // the new draft reacts to it rather than reproducing the previous one.
  const hints = input.hints ?? [];
  const userHints = hints
    .filter((t) => t.role === "user")
    .map((t) => `- ${t.text}`)
    .join("\n");
  const hintsBlock = userHints
    ? `\n\nThe PO has reviewed a previous draft of this backlog and provided this feedback:\n${userHints}\n\nProduce a NEW draft that incorporates the feedback. Do not simply reproduce the prior draft.`
    : "";

  const initialMessages: BaseMessage[] = [
    new SystemMessage(SYSTEM_PROMPT),
    new HumanMessage(
      `Produce the backlog for this Epic.\n\n${summaryText}${hintsBlock}`,
    ),
  ];

  const signal = AbortSignal.timeout(45_000);
  const messages = await runAgentLoop(llm, tools, initialMessages, 4, signal);

  const structured = llm.withStructuredOutput(architectResponseSchema, {
    name: "architect_response",
  });
  const result = await structured.invoke(messages, { signal });

  // Assign ids first so dependency resolution can reference them by index.
  const ids = result.tickets.map(() => uid("prop"));

  return {
    epicTitle: result.epicTitle,
    epicDescription: result.epicDescription,
    tickets: result.tickets.map((t, i) => ({
      id: ids[i],
      hierarchyType: t.hierarchyType,
      title: t.title,
      oneLiner: t.oneLiner,
      description: "",
      label: t.label,
      acceptanceCriteria: [],
      storyPoints: null,
      risks: [],
      refined: false,
      transcript: [],
      dependencies: (t.dependencies ?? [])
        .filter((d) => d.targetIndex !== i && d.targetIndex >= 0 && d.targetIndex < ids.length)
        .map((d) => ({ kind: d.kind, targetProposalId: ids[d.targetIndex] })),
    })),
  };
}
