import clientPromise from "./mongo";

const DB_NAME = "orion";

let indexesEnsured = false;

/**
 * Ensures MongoDB indexes exist. Idempotent and safe to call repeatedly.
 *
 * All compound indexes lead with `orgId` so that:
 *   - Tenant isolation queries are index-backed (every query filters by orgId)
 *   - `orgId` is also a viable shard key for horizontal partitioning at scale
 */
export async function ensureIndexes(): Promise<void> {
  if (indexesEnsured) return;
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  await Promise.all([
    db.collection("boards").createIndex({ orgId: 1 }),
    db.collection("columns").createIndex({ orgId: 1, boardId: 1, order: 1 }),
    db.collection("tickets").createIndex({ orgId: 1, boardId: 1, columnId: 1 }),
    db.collection("tickets").createIndex({ orgId: 1, ticketNumber: 1 }, { unique: true }),
    db.collection("versions").createIndex({ orgId: 1, boardId: 1 }),
    db.collection("comments").createIndex({ orgId: 1, ticketId: 1, createdAt: 1 }),
    db.collection("ticketHistory").createIndex({ orgId: 1, ticketId: 1, timestamp: -1 }),
    db.collection("boardMembers").createIndex(
      { orgId: 1, boardId: 1, userId: 1 },
      { unique: true }
    ),
    db.collection("boardMembers").createIndex({ orgId: 1, userId: 1 }),
    db.collection("labels").createIndex({ orgId: 1, label: 1 }, { unique: true }),
  ]);

  indexesEnsured = true;
}
