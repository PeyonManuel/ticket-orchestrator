import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { TicketProposal } from "@/domain/orchestrator/types";
import type { OrionTool } from "./registry";

/**
 * Builds a `get_proposal_details` tool bound to the current backlog of the
 * planner chat (Phase 4). The summary in the system prompt shows each
 * ticket's id, title, label, points, and sprint/assignee — enough for plan
 * explanation. This tool covers the long-tail: "what does this ticket
 * actually entail?", "what are the risks on prop-xxx?", "are there
 * dependencies that should force a different sequence?".
 *
 * Backlog is captured in the closure so the tool args are just `{ ticketId }`.
 * Returns the full field block as JSON; on miss returns `{ error, knownIds }`
 * so the LLM can recover next round.
 */
export function createGetProposalDetailsTool(
  tickets: TicketProposal[],
): OrionTool {
  const byId = new Map(tickets.map((t) => [t.id, t]));

  return tool(
    async ({ ticketId }: { ticketId: string }) => {
      const hit = byId.get(ticketId);
      if (!hit) {
        return JSON.stringify({
          error: `Ticket id '${ticketId}' not found in the current backlog.`,
          knownIds: Array.from(byId.keys()),
        });
      }
      return JSON.stringify({
        id: hit.id,
        title: hit.title,
        oneLiner: hit.oneLiner,
        description: hit.description,
        label: hit.label,
        discipline: hit.discipline,
        storyPoints: hit.storyPoints,
        risks: hit.risks,
        acceptanceCriteria: hit.acceptanceCriteria,
        dependencies: hit.dependencies ?? [],
      });
    },
    {
      name: "get_proposal_details",
      description:
        "Fetch the full field block (description, oneLiner, acceptance criteria, risks, dependencies) of a ticket in the current backlog. Use when the PO asks about a specific ticket's scope/effort/risks/blockers and the short title shown in the plan above isn't enough to give a grounded answer. Pass the exact `prop-xxxxxxxx` id shown in the plan listing.",
      schema: z.object({
        ticketId: z
          .string()
          .min(3)
          .describe(
            "Exact `prop-xxxxxxxx` id of the ticket from the plan listing.",
          ),
      }),
    },
  );
}
