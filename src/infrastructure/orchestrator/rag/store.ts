import clientPromise from "@/infrastructure/persistence/mongo";
import type {
  EpicSnapshot,
  ProposalLabel,
  ProposalStoryPoints,
} from "@/domain/orchestrator/types";
import { createOrchestratorEmbeddings, EMBEDDING_DIMENSIONS } from "./embeddings";

const DB_NAME = "orion";
const COLLECTION = "epicEmbeddings";
const TICKET_COLLECTION = "ticketEmbeddings";

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

// ─── Ticket embeddings (Slice O) ────────────────────────────────────

interface TicketEmbeddingDoc {
  _id: string;
  orgId: string;
  boardId: string;
  ticketId: string;
  epicSnapshotId: string;
  title: string;
  oneLiner: string;
  label: ProposalLabel;
  hierarchyType: "story" | "task";
  storyPoints: ProposalStoryPoints;
  embedding: number[];
  createdAt: string;
}

export interface SimilarTicketHit {
  ticketId: string;
  title: string;
  oneLiner: string;
  label: ProposalLabel;
  hierarchyType: "story" | "task";
  storyPoints: ProposalStoryPoints;
  similarity: number;
}

export interface TicketEmbeddingInput {
  ticketId: string;
  title: string;
  oneLiner: string;
  label: ProposalLabel;
  hierarchyType: "story" | "task";
  storyPoints: ProposalStoryPoints;
}

function composeTicketEmbeddingText(t: TicketEmbeddingInput): string {
  return [`${t.title}`, t.oneLiner].filter(Boolean).join(" — ");
}

/**
 * Embeds and stores a batch of committed tickets so future Phase 3 refinement
 * can anchor story-point estimates against past work. Uses `embedDocuments` for
 * one round trip per epic instead of N. Skips tickets without `storyPoints` —
 * those aren't useful estimation anchors.
 */
export async function embedAndStoreCommittedTickets(
  orgId: string,
  boardId: string,
  epicSnapshotId: string,
  tickets: TicketEmbeddingInput[],
  createdAt: string,
): Promise<void> {
  if (tickets.length === 0) return;
  const embeddings = createOrchestratorEmbeddings();
  const texts = tickets.map((t) => composeTicketEmbeddingText(t));
  const vectors = await embeddings.embedDocuments(texts);

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection<TicketEmbeddingDoc>(TICKET_COLLECTION);

  for (let i = 0; i < tickets.length; i++) {
    const vector = vectors[i];
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Ticket embedding length mismatch: got ${vector.length}, expected ${EMBEDDING_DIMENSIONS}.`,
      );
    }
    const t = tickets[i];
    const doc: TicketEmbeddingDoc = {
      _id: `tkemb_${t.ticketId}`,
      orgId,
      boardId,
      ticketId: t.ticketId,
      epicSnapshotId,
      title: t.title,
      oneLiner: t.oneLiner,
      label: t.label,
      hierarchyType: t.hierarchyType,
      storyPoints: t.storyPoints,
      embedding: vector,
      createdAt,
    };
    await col.replaceOne({ _id: doc._id, orgId }, doc, { upsert: true });
  }
}

export async function countTicketEmbeddings(orgId: string): Promise<number> {
  const client = await clientPromise;
  const col = client.db(DB_NAME).collection<TicketEmbeddingDoc>(TICKET_COLLECTION);
  return col.countDocuments({ orgId });
}

/**
 * Top-K most similar past committed tickets for an org. Same in-process cosine
 * pattern as `searchSimilarEpics`; returns each hit's stored story points so
 * the Controller can anchor its estimate.
 */
export async function searchSimilarTickets(
  orgId: string,
  query: string,
  topK: number = 5,
): Promise<SimilarTicketHit[]> {
  const embeddings = createOrchestratorEmbeddings();
  const queryVector = await embeddings.embedQuery(query);

  const client = await clientPromise;
  const col = client.db(DB_NAME).collection<TicketEmbeddingDoc>(TICKET_COLLECTION);
  const docs = await col.find({ orgId }).toArray();
  const scored = docs.map((d) => ({
    ticketId: d.ticketId,
    title: d.title,
    oneLiner: d.oneLiner,
    label: d.label,
    hierarchyType: d.hierarchyType,
    storyPoints: d.storyPoints,
    similarity: cosineSimilarity(queryVector, d.embedding),
  }));
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, Math.max(0, topK));
}
