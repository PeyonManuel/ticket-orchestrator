import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

const DEFAULT_MODEL = "gemini-2.5-flash";

/**
 * Factory for the chat model used by every orchestrator actor. Server-only —
 * never import from client code (GOOGLE_API_KEY must not ship to the browser).
 *
 * Swap providers by setting `ORCHESTRATOR_MODEL` (e.g. `gemini-2.5-pro`) without
 * touching graph code. To change vendor entirely, replace this factory's body —
 * `withStructuredOutput` is supported across LangChain providers.
 */
export function createOrchestratorLLM(opts?: { temperature?: number }): ChatGoogleGenerativeAI {
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
