import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchSimilarTickets } from "../rag/store";
import type { OrionTool } from "./registry";

/**
 * Builds a `find_similar_tickets` tool bound to a specific org. Used by the
 * Phase 3 Controller to anchor story-point estimates against past committed
 * tickets — what did the team estimate (and presumably deliver) for similar
 * work? Each hit returns the stored Fibonacci point value.
 *
 * orgId is captured in the closure so the LLM can't target a different tenant.
 */
export function createFindSimilarTicketsTool(orgId: string): OrionTool {
  return tool(
    async ({ query, topK }: { query: string; topK: number }) => {
      const hits = await searchSimilarTickets(orgId, query, topK);
      if (hits.length === 0) {
        return JSON.stringify({
          hits: [],
          note: "No prior committed tickets found. Estimate from first principles.",
        });
      }
      return JSON.stringify({
        hits: hits.map((h) => ({
          title: h.title,
          oneLiner: h.oneLiner,
          label: h.label,
          hierarchyType: h.hierarchyType,
          storyPoints: h.storyPoints,
          similarity: Number(h.similarity.toFixed(3)),
        })),
      });
    },
    {
      name: "find_similar_tickets",
      description:
        "Search past committed tickets in this organization by semantic similarity, returning their stored story points. Use this BEFORE estimating storyPoints for the current ticket so the estimate is anchored in real team history rather than a guess. Pass a short query: the ticket title plus the one-liner (e.g. 'Add password reset flow — user submits email, receives token link, sets new password'). Returns hits with title, label, hierarchyType, storyPoints (Fibonacci), and similarity score.",
      schema: z.object({
        query: z
          .string()
          .min(3)
          .describe(
            "Natural-language description of the ticket — typically `${title} — ${oneLiner}`.",
          ),
        topK: z
          .number()
          .int()
          .min(1)
          .max(8)
          .describe("How many hits to return. Default 5."),
      }),
    },
  );
}
