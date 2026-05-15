import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * Embedding model for orchestrator RAG (Slice L). Server-only —
 * `GOOGLE_API_KEY` must never reach the browser.
 *
 * Defaults to `gemini-embedding-001` (3072-dim by default). Older `*-001`
 * models like `embedding-001` / `text-embedding-004` were removed from v1beta.
 * Changing models requires re-embedding every existing `epicEmbeddings`
 * document — vectors from different models aren't comparable.
 */
export function createOrchestratorEmbeddings(): GoogleGenerativeAIEmbeddings {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set — required for orchestrator embeddings.",
    );
  }
  const model = process.env.ORCHESTRATOR_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    model,
  });
}

export const EMBEDDING_DIMENSIONS = 3072;
