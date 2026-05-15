import clientPromise from "@/infrastructure/persistence/mongo";
import type { EpicSnapshot } from "@/domain/orchestrator/types";
import { createOrchestratorEmbeddings, EMBEDDING_DIMENSIONS } from "./embeddings";

const DB_NAME = "orion";
const COLLECTION = "epicEmbeddings";

interface EpicEmbeddingDoc {
  _id: string;
  orgId: string;
  boardId: string;
  epicSnapshotId: string;
  epicTicketId: string;
  title: string;
  text: string;
  embedding: number[];
  createdAt: string;
}

export interface SimilarEpicHit {
  epicSnapshotId: string;
  epicTicketId: string;
  boardId: string;
  title: string;
  text: string;
  createdAt: string;
  similarity: number;
}

/**
 * Composes the text used to embed an Epic. Kept short and dense so the
 * embedding stays semantically focused: epic title, description, then a
 * one-line-per-ticket inventory. We deliberately exclude the planner
 * transcript and refined ticket descriptions — those add noise without
 * improving recall for the "find similar past epics" use case.
 */
export function composeEpicEmbeddingText(snapshot: EpicSnapshot): string {
  const backlog = snapshot.backlog;
  const ticketsBlock = backlog
    ? backlog.tickets
        .map((t) => `- [${t.label}] ${t.title} — ${t.oneLiner}`)
        .join("\n")
    : "";
  const epicTitle = backlog?.epicTitle ?? "(untitled epic)";
  const epicDescription = backlog?.epicDescription ?? "";
  return [
    `Epic: ${epicTitle}`,
    epicDescription,
    ticketsBlock ? `Tickets:\n${ticketsBlock}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Embeds the snapshot's composed text and writes (or replaces) the doc for it.
 * Idempotent on `(orgId, epicSnapshotId)` — re-running on the same snapshot
 * just re-embeds (useful if the embedding model changes).
 */
export async function embedAndStoreEpic(snapshot: EpicSnapshot): Promise<void> {
  const text = composeEpicEmbeddingText(snapshot);
  const embeddings = createOrchestratorEmbeddings();
  const vector = await embeddings.embedQuery(text);
  if (vector.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding length mismatch: got ${vector.length}, expected ${EMBEDDING_DIMENSIONS}. ` +
        `Did the model change? Update EMBEDDING_DIMENSIONS in rag/embeddings.ts and re-embed all docs.`,
    );
  }
  const client = await clientPromise;
  const col = client.db(DB_NAME).collection<EpicEmbeddingDoc>(COLLECTION);
  const doc: EpicEmbeddingDoc = {
    _id: `emb_${snapshot.id}`,
    orgId: snapshot.orgId,
    boardId: snapshot.boardId,
    epicSnapshotId: snapshot.id,
    epicTicketId: snapshot.epicTicketId,
    title: snapshot.backlog?.epicTitle ?? "(untitled epic)",
    text,
    embedding: vector,
    createdAt: snapshot.createdAt,
  };
  await col.replaceOne({ _id: doc._id, orgId: snapshot.orgId }, doc, {
    upsert: true,
  });
}

/**
 * Quick count of how many epic embeddings exist for an org. Used by graph
 * code to decide whether to bother registering the RAG tool at all — when
 * the corpus is empty (fresh org, no past commits), the agent loop is pure
 * latency overhead.
 */
export async function countEpicEmbeddings(orgId: string): Promise<number> {
  const client = await clientPromise;
  const col = client.db(DB_NAME).collection<EpicEmbeddingDoc>(COLLECTION);
  return col.countDocuments({ orgId });
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Returns the top-K most similar past Epics for an org. In-process cosine
 * over the org's epic embeddings — fine for <100 epics/org (microseconds).
 * Upgrade to Atlas Vector Search if scale demands.
 */
export async function searchSimilarEpics(
  orgId: string,
  query: string,
  topK: number = 5,
): Promise<SimilarEpicHit[]> {
  const embeddings = createOrchestratorEmbeddings();
  const queryVector = await embeddings.embedQuery(query);

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection<EpicEmbeddingDoc>(COLLECTION);
  const docs = await col.find({ orgId }).toArray();
  const scored = docs.map((d) => ({
    epicSnapshotId: d.epicSnapshotId,
    epicTicketId: d.epicTicketId,
    boardId: d.boardId,
    title: d.title,
    text: d.text,
    createdAt: d.createdAt,
    similarity: cosineSimilarity(queryVector, d.embedding),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, Math.max(0, topK));
}
