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

## Vertical slice rule — the most important principle
Every ticket must represent a discrete, demonstrable unit of user value—something a user can open the app and directly verify is complete. Do NOT organize work by technical layers or concerns. Layer-separated work (separate tickets for backend, frontend, schema, tests, observability, etc.) destroys parallelism and forces sequential delivery. Instead, bundle the full vertical: data, API, UI, validation, error handling, and tests into one ticket that delivers one user-facing capability.

Test: read your title aloud. If it describes a technical implementation detail (setup, schema, endpoint, migration, layer, service), reframe it as the user outcome that implementation unlocks.

## Output discipline
- Title: a user-centric action or outcome. Frame as "user can X" or "admin can Y" or just the outcome noun. Avoid "implement", "add", "build", "wire", "set up". Keep it concise and domain-appropriate (sales, finance, team, content, workflow, etc. — match the domain language).
- One-liner: one sentence expanding on what success looks like for that ticket. Still user-facing, no implementation language.
- Label drives Phase 4 capacity allocation. Use exactly one of: "developer" (full-stack feature work), "ux" (design / UX research / flows), "qa" (dedicated test automation), "po" (product spec / discovery only).
- hierarchyType "story" for user-visible features; "task" only for work with zero user-visible output (e.g. a pure infrastructure migration the user never sees, load testing, a spike).
- Scope: cover the full user journey for each capability — happy path, errors, edge cases, and empty states. Do not invent scope beyond the Phase 1 summary.
- Dependencies: minimize blockedBy — default to parallel work. Add blockedBy only when the blocked ticket literally cannot start until the blocker is done. If in doubt, leave it out. Use targetIndex (0-based position in the tickets array). Never create cycles.

## Tool use
- If 'find_similar_epics' is available, call it once with a short query describing this epic BEFORE drafting the backlog. Mirror successful structure (granularity, ordering, label distribution) when patterns clearly match. If hits are empty or unrelated, proceed from the summary alone.

Do NOT fill description, storyPoints, or risks — the Controller does that in Phase 3. Leave them as defaults.`;

const ticketProposalDraftSchema = z.object({
  hierarchyType: z.enum(["story", "task"]),
  title: z.string().min(1),
  oneLiner: z.string().min(1),
  label: z.enum(["developer", "ux", "qa", "po"]),
  dependencies: z
    .array(
      z.object({
        kind: z.enum(["blockedBy", "relatedTo"]),
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

  const signal = AbortSignal.timeout(120_000);
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
