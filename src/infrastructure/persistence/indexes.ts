import clientPromise from "./mongo";
import { logger } from "@/infrastructure/observability/logger";

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

  await logger.time("infra", "ensureIndexes", () =>
    Promise.all([
      db.collection("boards").createIndex({ orgId: 1 }),
      // Partial index on archived boards only — keeps the active-listing index
      // narrow and gives O(log N) listing of "Trash" per tenant.
      db.collection("boards").createIndex(
        { orgId: 1, deletedAt: 1 },
        { partialFilterExpression: { deletedAt: { $type: "date" } } }
      ),
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
      // Sprints: list by board, ordered by startDate for timeline views
      db.collection("sprints").createIndex({ orgId: 1, boardId: 1, startDate: 1 }),
      // SprintAssignments: unique per user per sprint; secondary for user lookup
      db.collection("sprintAssignments").createIndex(
        { orgId: 1, sprintId: 1, userId: 1 },
        { unique: true }
      ),
      db.collection("sprintAssignments").createIndex({ orgId: 1, userId: 1 }),
      // EpicSnapshots: one snapshot per epic (unique), fast lookup by epicTicketId
      db.collection("epicSnapshots").createIndex(
        { orgId: 1, epicTicketId: 1 },
        { unique: true }
      ),
      // Per-board committed-Epic listing (newest first) for the orchestrator picker.
      db.collection("epicSnapshots").createIndex(
        { orgId: 1, boardId: 1, createdAt: -1 },
      ),
      // MemberRoles: one role per user per org
      db.collection("memberRoles").createIndex(
        { orgId: 1, userId: 1 },
        { unique: true }
      ),
      // EpicDrafts: list per board, newest activity first; soft-deleted ones excluded.
      db.collection("epicDrafts").createIndex({ orgId: 1, boardId: 1, updatedAt: -1 }),
      db.collection("epicDrafts").createIndex(
        { orgId: 1, deletedAt: 1 },
        { partialFilterExpression: { deletedAt: { $type: "date" } } },
      ),
      // Phase 5 InspectorTranscripts: one per Epic snapshot.
      db.collection("inspectorTranscripts").createIndex(
        { orgId: 1, epicSnapshotId: 1 },
        { unique: true },
      ),
      // Phase 5 EpicMemories: list per Epic snapshot, newest first.
      db.collection("epicMemories").createIndex(
        { orgId: 1, epicSnapshotId: 1, createdAt: -1 },
      ),
      // Slice L RAG: one embedding doc per committed Epic snapshot. Vector
      // search is done in-process via cosine over the org's epics (<100/org
      // realistically) — Atlas Vector Search is overkill at this scale and
      // its async index-build timing complicates dev/test setup. Revisit if
      // an org accumulates thousands of epics.
      db.collection("epicEmbeddings").createIndex(
        { orgId: 1, epicSnapshotId: 1 },
        { unique: true },
      ),
      db.collection("epicEmbeddings").createIndex(
        { orgId: 1, boardId: 1, createdAt: -1 },
      ),
    ]),
  );

  indexesEnsured = true;
}
