import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { OrionTool } from "./tools";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_LMSTUDIO_MODEL = "local-model";

/**
 * Factory for the chat model used by every orchestrator actor. Server-only —
 * never import from client code (API keys must not ship to the browser).
 *
 * Provider is selected by ORCHESTRATOR_PROVIDER env var:
 *   - "gemini" (default): Gemini via GOOGLE_API_KEY
 *   - "lmstudio": local LM Studio OpenAI-compatible endpoint at
 *     LMSTUDIO_BASE_URL (default: http://localhost:1234/v1).
 *     Set ORCHESTRATOR_MODEL to the model name shown in LM Studio.
 *
 * `withStructuredOutput` is supported across both providers.
 */
export function createOrchestratorLLM(opts?: {
  temperature?: number;
}): BaseChatModel {
  const provider = process.env.ORCHESTRATOR_PROVIDER ?? "gemini";
  const temperature = opts?.temperature ?? 0.5;

  if (provider === "lmstudio") {
    const baseURL =
      process.env.LMSTUDIO_BASE_URL ?? "http://localhost:1234/v1";
    const model = process.env.ORCHESTRATOR_MODEL ?? DEFAULT_LMSTUDIO_MODEL;
    return new ChatOpenAI({
      model,
      temperature,
      apiKey: "lm-studio",
      configuration: { baseURL },
    });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set — required when ORCHESTRATOR_PROVIDER=gemini (default).",
    );
  }
  const model = process.env.ORCHESTRATOR_MODEL ?? DEFAULT_GEMINI_MODEL;
  return new ChatGoogleGenerativeAI({ model, apiKey, temperature });
}

/**
 * Binds a set of tools to an LLM for an agent-style tool-calling step.
 */
export function bindOrionTools(
  llm: BaseChatModel,
  tools: OrionTool[],
) {
  if (tools.length === 0) return llm;
  return (llm as BaseChatModel & { bindTools: (t: OrionTool[]) => unknown }).bindTools(tools);
}
