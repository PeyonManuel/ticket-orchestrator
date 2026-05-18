import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { TicketProposal } from "@/domain/orchestrator/types";
import type { OrionTool } from "./registry";

/**
 * Builds a `get_ticket_details` tool bound to the current backlog of the
 * refinement chat (Phase 3). The active ticket is excluded so the LLM can't
 * fetch itself — the active ticket is already in the system prompt verbatim.
 *
 * Siblings + activeTicketId are captured in the closure so the tool args are
 * just `{ ticketId }`. Returns the ticket's field block as JSON; on miss or
 * self-reference, returns `{ error, knownIds }` so the LLM can recover next
 * round.
 */
export function createGetOtherTicketProposalTool(
  siblings: TicketProposal[],
  activeTicketId: string,
): OrionTool {
  const byId = new Map(siblings.map((t) => [t.id, t]));

  return tool(
    async ({ ticketId }: { ticketId: string }) => {
      if (ticketId === activeTicketId) {
        return JSON.stringify({
          error:
            "That is the active ticket — its details are already in the system prompt under CURRENT TICKET.",
        });
      }
      const hit = byId.get(ticketId);
      if (!hit) {
        return JSON.stringify({
          error: `Ticket id '${ticketId}' not found in the current backlog.`,
          knownIds: Array.from(byId.keys()).filter((id) => id !== activeTicketId),
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
        acceptanceCriteria: hit.acceptanceCriteria,
        risks: hit.risks,
      });
    },
    {
      name: "get_ticket_details",
      description:
        "Fetch the full field block (description, AC, risks, story points, label, discipline) of a sibling ticket in the current backlog. Use when the PO references another ticket by position/title and you need its details to give a grounded answer (e.g. consistency check, dependency reasoning). The active ticket is already in the system prompt — do NOT call this for it. Pass the exact `prop-xxxxxxxx` id shown in the SIBLINGS listing.",
      schema: z.object({
        ticketId: z
          .string()
          .min(3)
          .describe(
            "Exact `prop-xxxxxxxx` id of the sibling ticket from the SIBLINGS listing.",
          ),
      }),
    },
  );
}
