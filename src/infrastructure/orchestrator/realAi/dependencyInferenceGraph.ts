import { z } from "zod";
import { createOrchestratorLLM } from "../llm";
import type {
  DependencyInferenceOutput,
  ProposalDependency,
  TicketProposal,
} from "@/domain/orchestrator/types";
import { detectCycles } from "@/domain/orchestrator/policies/dependencyPolicy";

/**
 * Deterministic dependency inference step that reads ticket titles + descriptions
 * and infers blockedBy relationships. Temperature=0, structured output for consistency.
 *
 * Inputs: backlog tickets (with titles + full descriptions), existing dependencies, epic context
 * Output: refined list of dependencies to apply to each ticket
 *
 * Algorithm:
 * 1. Build ticket index (id → title + description)
 * 2. Call LLM with structured output to infer dependencies from semantic relationships
 * 3. Filter result: exclude cycles, reject non-existent target ids
 * 4. Return refined dependencies list
 */
export async function inferDependencies(
  tickets: TicketProposal[],
  _currentDependencies: ProposalDependency[],
  epicSummary?: { summary: string; goals: string[] },
): Promise<DependencyInferenceOutput[]> {
  const llm = createOrchestratorLLM({ temperature: 0 });

  const ticketIndex = tickets.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
  }));

  const systemPrompt = buildSystemPrompt(ticketIndex, epicSummary);

  const responseSchema = z.object({
    dependencies: z.array(
      z.object({
        ticketId: z.string(),
        dependencies: z
          .array(
            z.object({
              kind: z.enum(["blockedBy", "relatedTo", "duplicates"]),
              targetProposalId: z.string(),
            }),
          )
          .default([]),
      }),
    ),
  });

  const structured = llm.withStructuredOutput(responseSchema, {
    name: "dependency_inference",
  });

  const result = await structured.invoke(systemPrompt);

  // Validate and clean result
  const validTicketIds = new Set(tickets.map((t) => t.id));
  const validated: DependencyInferenceOutput[] = result.dependencies.map(
    (item) => ({
      ticketId: item.ticketId,
      dependencies: (item.dependencies ?? [])
        .filter((d) => validTicketIds.has(d.targetProposalId)) // reject non-existent targets
        .filter((d) => d.targetProposalId !== item.ticketId), // reject self-loops
    }),
  );

  // Detect cycles and remove them
  const ticketsWithDeps = tickets.map((t) => ({
    ...t,
    dependencies: validated.find((v) => v.ticketId === t.id)?.dependencies ?? [],
  }));
  const cycles = detectCycles(ticketsWithDeps);

  if (cycles.length > 0) {
    // Remove all dependencies involved in cycles
    const cycleIds = new Set(cycles.flat());
    return validated.map((item) => ({
      ...item,
      dependencies: item.dependencies.filter(
        (d) => !cycleIds.has(item.ticketId) && !cycleIds.has(d.targetProposalId),
      ),
    }));
  }

  return validated;
}

/**
 * Build the system prompt for dependency inference. Instructs the LLM to examine
 * ticket titles and descriptions and identify true blocking relationships.
 */
function buildSystemPrompt(
  ticketIndex: Array<{ id: string; title: string; description: string }>,
  epicSummary?: { summary: string; goals: string[] },
): string {
  const lines: string[] = [];

  lines.push("You are an expert software architect analyzing ticket dependencies.");
  lines.push(
    "Your task: examine the following tickets and infer true blocking relationships (blockedBy edges).",
  );
  lines.push("");

  if (epicSummary) {
    lines.push("## Epic Context");
    lines.push(`**Why:** ${epicSummary.summary}`);
    lines.push(`**Goals:** ${epicSummary.goals.join("; ")}`);
    lines.push("");
  }

  lines.push("## Tickets");
  for (const ticket of ticketIndex) {
    lines.push(`**[${ticket.id}] ${ticket.title}**`);
    if (ticket.description) {
      lines.push(`${ticket.description}`);
    }
    lines.push("");
  }

  lines.push("## Dependency Inference Rules");
  lines.push("- DEFAULT: no dependency. Parallel work is always preferred over sequential.");
  lines.push(
    "- Only add blockedBy when the blocker's OUTPUT is a literal input the blocked ticket needs to compile or run — not just 'related' or 'would be nice to have first'.",
  );
  lines.push(
    "- Hard examples (add): DB schema migration blocks the API that writes to those tables.",
  );
  lines.push(
    "- Soft examples (do NOT add): UI polish blocked by backend API (both can be developed in parallel with a mock); tests blocked by feature (tests can be written first); deployment blocked by everything (too coarse).",
  );
  lines.push("- Each ticket should have AT MOST ONE blockedBy dep. Never fan-out.");
  lines.push("- Never create cycles (ticket A blocks B, B blocks A).");
  lines.push("- Use ONLY blockedBy kind.");
  lines.push("- Output a list for EACH ticket, most will be empty.");
  lines.push("");

  lines.push("## Output Format");
  lines.push("Return a JSON object with this exact shape:");
  lines.push(
    '{ "dependencies": [ { "ticketId": "t1", "dependencies": [ { "kind": "blockedBy", "targetProposalId": "t2" } ] }, ... ] }',
  );
  lines.push("");

  lines.push("## Determinism Requirement");
  lines.push(
    "- Your output must be deterministic: running inference on the same tickets must always produce the same dependencies.",
  );
  lines.push(
    "- Do not use randomness or weighted scoring. Apply consistent logical rules.",
  );

  return lines.join("\n");
}
