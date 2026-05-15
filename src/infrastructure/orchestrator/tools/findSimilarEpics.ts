import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { searchSimilarEpics } from "../rag/store";
import type { OrionTool } from "./registry";

/**
 * Builds a `find_similar_epics` tool bound to a specific org. The orgId is
 * captured in the closure rather than passed as a tool argument so the LLM
 * cannot accidentally (or maliciously) target a different tenant.
 *
 * Returns up to `topK` hits ranked by cosine similarity. Each result includes
 * the epic title, similarity score, and a 300-char snippet of the embedded
 * text (epic description + ticket inventory).
 */
export function createFindSimilarEpicsTool(orgId: string): OrionTool {
  return tool(
    async ({ query, topK }: { query: string; topK: number }) => {
      const hits = await searchSimilarEpics(orgId, query, topK);
      if (hits.length === 0) {
        return JSON.stringify({
          hits: [],
          note: "No prior committed epics found for this org. Suggestions cannot be grounded in past history yet.",
        });
      }
      return JSON.stringify({
        hits: hits.map((h) => ({
          title: h.title,
          similarity: Number(h.similarity.toFixed(3)),
          snippet: h.text.slice(0, 300),
        })),
      });
    },
    {
      name: "find_similar_epics",
      description:
        "Search past committed Epics in this organization by semantic similarity. Use this BEFORE proposing scope or structure for a new Epic — surfaces what the team has built before, naming conventions, ticket granularity, and patterns that worked. Pass a natural-language query describing the kind of epic you're researching. Returns up to topK hits with titles + 300-char snippets.",
      schema: z.object({
        query: z
          .string()
          .min(3)
          .describe(
            "Natural-language description of the epic you want to find precedents for. E.g. 'guest checkout for mobile' or 'admin reporting dashboard'.",
          ),
        topK: z
          .number()
          .int()
          .min(1)
          .max(8)
          .describe("How many hits to return. Default 3."),
      }),
    },
  );
}
