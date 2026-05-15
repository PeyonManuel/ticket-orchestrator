import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { OrionTool } from "./tools";

const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * Factory for the chat model used by every orchestrator actor. Server-only —
 * never import from client code (GOOGLE_API_KEY must not ship to the browser).
 *
 * Swap providers by setting `ORCHESTRATOR_MODEL` (e.g. `gemini-2.5-pro`) without
 * touching graph code. To change vendor entirely, replace this factory's body —
 * `withStructuredOutput` is supported across LangChain providers.
 */
export function createOrchestratorLLM(opts?: {
  temperature?: number;
}): ChatGoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set — required for the orchestrator AI actors.",
    );
  }
  const model = process.env.ORCHESTRATOR_MODEL ?? DEFAULT_MODEL;
  return new ChatGoogleGenerativeAI({
    model,
    apiKey,
    temperature: opts?.temperature ?? 0.5,
  });
}

/**
 * Binds a set of tools to an LLM for an agent-style tool-calling step.
 *
 * Kept separate from `createOrchestratorLLM` because `withStructuredOutput`
 * lives on the base chat model — binding tools returns a `RunnableBinding`
 * that doesn't expose it. Graph code typically wants both: a tool-bound model
 * for an exploratory step, and the bare model for the final structured
 * response. Pass an empty array and you get the bare model back unchanged.
 */
export function bindOrionTools(
  llm: ChatGoogleGenerativeAI,
  tools: OrionTool[],
) {
  if (tools.length === 0) return llm;
  return llm.bindTools(tools);
}
