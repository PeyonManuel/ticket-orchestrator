/**
 * Repository: All MongoDB persistence with strict orgId tenant isolation.
 *
 * Every query and mutation requires an explicit `orgId` parameter and includes
 * it in the filter. Inserts always include `orgId`. This makes it physically
 * impossible to leak data across tenants.
 */
import type {
  Board,
  BoardColumn,
  Ticket,
  ReleaseVersion,
  CreateTicketInput,
  Comment,
  TicketHistoryEntry,
  HistoryFieldChange,
  HistoryEntryKind,
  BoardMember,
  Sprint,
  SprintAssignment,
  OrgMemberRole,
} from "@/domain/analyst";
import {
  type BacklogProposal,
  type BrainstormSummary,
  type BrainstormTurn,
  type EpicDraft,
  type EpicDraftIndexEntry,
  type EpicMemory,
  type EpicMemorySource,
  type EpicSnapshot,
  type EpicSnapshotIndexEntry,
  type InspectorTranscript,
  type InspectorTurn,
  type MemberSnapshot,
  type OrchestratorPhase,
  type SprintPlan,
  type SprintSnapshot,
  epicDraftSchema,
  epicMemorySchema,
  epicSnapshotSchema,
  inspectorTranscriptSchema,
} from "@/domain/orchestrator/types";
import clientPromise from "./mongo";
import {
  BoardSchema,
  BoardColumnSchema,
  TicketSchema,
  ReleaseVersionSchema,
  CommentSchema,
  TicketHistoryEntrySchema,
  BoardMemberSchema,
  UpdateTicketInputSchema,
  SprintSchema,
  SprintAssignmentSchema,
  OrgMemberRoleSchema,
} from "./schemas";
import { ensureIndexes } from "./indexes";
import type { z } from "zod";
import type { Collection } from "mongodb";

const DB_NAME = "orion";

/**
 * Typed collection accessor.
 *
 * MongoDB's default `_id` type is `ObjectId`. We use string UUIDs throughout,
 * so each collection is parameterized with `_id: string` to match.
 */
async function coll<T extends { _id: string }>(name: string): Promise<Collection<T>> {
  await ensureIndexes();
  const client = await clientPromise;
  return client.db(DB_NAME).collection<T>(name);
}

// ─── Mongo document shapes (with string _id) ─────────────────────────────────

interface BoardDoc {
  _id: string; orgId: string; name: string;
  type: "scrum" | "kanban" | "task";
  /** Stored as a Date (not string) so the partial index { deletedAt: { $type: "date" } } applies. */
  deletedAt?: Date | null;
  /**
   * Stable, immutable per-board prefix (e.g. "BACK") used for human-readable ticket numbers.
   * Unique within an org. Set on board creation; never mutated, even if the board is renamed.
   */
  code?: string;
  /**
   * Monotonic counter for the next ticket number on this board.
   * Atomically incremented during createTicket via $inc.
   */
  nextTicketNumber?: number;
}
interface ColumnDoc {
  _id: string; orgId: string; boardId: string; name: string;
  states: string[]; color: string; order: number;
  isDone?: boolean;
  protected?: boolean;
}
interface TicketDoc {
  _id: string; orgId: string; ticketNumber: string; boardId: string; columnId: string;
  hierarchyType: "epic" | "story" | "task"; parentTicketId: string | null;
  title: string; description: string; label: string; fixVersion: string;
  storyPoints: 1 | 2 | 3 | 5 | 8 | 13; workflowState: string;
  priority: "low" | "medium" | "high";
  /** Typed links replacing legacy `linkedTicketIds: string[]`. Old docs are migrated on read. */
  links?: { kind: "blockedBy" | "relatedTo" | "duplicates"; targetTicketId: string }[];
  /** Legacy field — read-only, auto-migrated to `links` (kind: "relatedTo") in `parseTicket`. */
  linkedTicketIds?: string[];
  assigneeIds: string[]; sprintIds?: string[]; version: number;
}
interface VersionDoc { _id: string; orgId: string; boardId: string; name: string; releaseDate: string }
interface BoardMemberDoc { _id: string; orgId: string; boardId: string; userId: string; role: "member" | "admin"; addedAt: string }
interface CommentDoc { _id: string; orgId: string; ticketId: string; authorId: string; body: string; createdAt: string; updatedAt: string }
interface HistoryDoc {
  _id: string; orgId: string; ticketId: string; actorId: string;
  timestamp: string; kind: HistoryEntryKind; changes: HistoryFieldChange[];
}

// ─── Boards ──────────────────────────────────────────────────────────────────

function parseBoard(d: BoardDoc): Board {
  return BoardSchema.parse({
    id: d._id,
    orgId: d.orgId,
    name: d.name,
    type: d.type,
    deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
  });
}

/**
 * Active boards only. Soft-deleted (`deletedAt` set) boards are excluded.
 * `{ deletedAt: null }` matches both null AND missing field, so this works
 * uniformly across boards created before and after the soft-delete column existed.
 */
export async function getBoards(orgId: string): Promise<Board[]> {
  const col = await coll<BoardDoc>("boards");
  const docs = await col.find({ orgId, deletedAt: null }).toArray();
  return docs.map(parseBoard);
}

/**
 * Soft-deleted boards for the current tenant, newest deletion first.
 * Backed by the partial index `{ orgId: 1, deletedAt: 1 }` (only indexes archived rows).
 */
export async function getArchivedBoards(orgId: string): Promise<Board[]> {
  const col = await coll<BoardDoc>("boards");
  const docs = await col
    .find({ orgId, deletedAt: { $type: "date" } })
    .sort({ deletedAt: -1 })
    .toArray();
  return docs.map(parseBoard);
}

export async function createBoard(
  orgId: string,
  input: Pick<Board, "name" | "type">
): Promise<Board> {
  const col = await coll<BoardDoc>("boards");
  const id = crypto.randomUUID();
  const code = await pickUniqueBoardCode(col, orgId, input.name);
  await col.insertOne({
    _id: id, orgId, name: input.name, type: input.type, deletedAt: null,
    code, nextTicketNumber: 1,
  });
  return parseBoard({ _id: id, orgId, name: input.name, type: input.type, deletedAt: null });
}

/**
 * Derives a 3–4 letter board prefix from the name (e.g. "Backend Sprint" → "BACK")
 * and ensures it does not collide with another board in the same org. On
 * collision, suffixes a numeric disambiguator: BACK, BACK2, BACK3, …
 */
async function pickUniqueBoardCode(
  col: Collection<BoardDoc>,
  orgId: string,
  name: string,
): Promise<string> {
  const base = (name || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "BOARD";
  const existing = await col
    .find({ orgId, code: { $exists: true } }, { projection: { code: 1 } })
    .toArray();
  const taken = new Set(existing.map((b) => b.code).filter((c): c is string => !!c));
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

/**
 * Returns the board's `code`, generating one for legacy boards that pre-date
 * the per-board counter. Idempotent under concurrent callers thanks to the
 * `code: { $exists: false }` guard on the update.
 */
async function ensureBoardCode(orgId: string, boardId: string): Promise<string> {
  const col = await coll<BoardDoc>("boards");
  const board = await col.findOne({ _id: boardId, orgId });
  if (!board) throw new Error("Board not found");
  if (board.code) return board.code;
  const code = await pickUniqueBoardCode(col, orgId, board.name);
  await col.updateOne(
    { _id: boardId, orgId, code: { $exists: false } },
    { $set: { code } }
  );
  const after = await col.findOne({ _id: boardId, orgId }, { projection: { code: 1 } });
  return after?.code ?? code;
}

/**
 * Soft-delete a board. Returns the updated board with `deletedAt` set.
 * Tickets and columns are not stamped — they're hidden naturally because every
 * read scopes by `boardId` and the parent board is filtered out.
 */
export async function archiveBoard(orgId: string, id: string): Promise<Board | null> {
  const col = await coll<BoardDoc>("boards");
  const result = await col.findOneAndUpdate(
    { _id: id, orgId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { returnDocument: "after" }
  );
  return result ? parseBoard(result) : null;
}

export async function restoreBoard(orgId: string, id: string): Promise<Board | null> {
  const col = await coll<BoardDoc>("boards");
  const result = await col.findOneAndUpdate(
    { _id: id, orgId, deletedAt: { $type: "date" } },
    { $set: { deletedAt: null } },
    { returnDocument: "after" }
  );
  return result ? parseBoard(result) : null;
}

/**
 * Hard-delete a board and cascade every owned record: columns, tickets,
 * comments scoped to those tickets, history, versions. Used by:
 *   - admin-driven immediate purge from the Trash UI, and
 *   - the scheduled cleanup endpoint that AWS EventBridge calls daily.
 *
 * Multi-step delete; not transactional. If a step fails midway the board is
 * already gone so a re-run picks up the orphans (each step is idempotent on
 * the boardId it scopes by).
 */
export async function purgeBoard(orgId: string, boardId: string): Promise<{
  board: number; columns: number; tickets: number; comments: number; history: number; versions: number;
}> {
  const client = await clientPromise;
  const db = client.db(DB_NAME);

  // Fetch ticket ids first so we can scope comment/history deletion.
  const tickets = await db
    .collection<TicketDoc>("tickets")
    .find({ orgId, boardId }, { projection: { _id: 1 } })
    .toArray();
  const ticketIds = tickets.map((t) => t._id);

  const [comments, history, columns, ticketsDel, versions, board] = await Promise.all([
    ticketIds.length
      ? db.collection("comments").deleteMany({ orgId, ticketId: { $in: ticketIds } })
      : Promise.resolve({ deletedCount: 0 } as { deletedCount: number }),
    ticketIds.length
      ? db.collection("ticketHistory").deleteMany({ orgId, ticketId: { $in: ticketIds } })
      : Promise.resolve({ deletedCount: 0 } as { deletedCount: number }),
    db.collection("columns").deleteMany({ orgId, boardId }),
    db.collection("tickets").deleteMany({ orgId, boardId }),
    db.collection("versions").deleteMany({ orgId, boardId }),
    db.collection<BoardDoc>("boards").deleteOne({ _id: boardId, orgId }),
  ]);

  return {
    board: board.deletedCount ?? 0,
    columns: columns.deletedCount ?? 0,
    tickets: ticketsDel.deletedCount ?? 0,
    comments: comments.deletedCount ?? 0,
    history: history.deletedCount ?? 0,
    versions: versions.deletedCount ?? 0,
  };
}

/**
 * Returns every (orgId, boardId) pair archived more than `cutoffDays` days ago.
 * Used by the scheduled cleanup endpoint to drive `purgeBoard` calls.
 */
export async function findBoardsToHardDelete(cutoffDays: number): Promise<Array<{ orgId: string; boardId: string }>> {
  const client = await clientPromise;
  const db = client.db(DB_NAME);
  const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000);
  const docs = await db
    .collection<BoardDoc>("boards")
    .find(
      { deletedAt: { $lte: cutoff } },
      { projection: { _id: 1, orgId: 1 } }
    )
    .toArray();
  return docs.map((d) => ({ orgId: d.orgId, boardId: d._id }));
}

// ─── Columns ─────────────────────────────────────────────────────────────────

function parseColumn(d: ColumnDoc): BoardColumn {
  return BoardColumnSchema.parse({
    id: d._id,
    orgId: d.orgId,
    boardId: d.boardId,
    name: d.name,
    states: d.states,
    color: d.color,
    order: d.order ?? 0,
    isDone: d.isDone ?? false,
    protected: d.protected ?? false,
  });
}

export async function getBoardColumns(orgId: string, boardId: string): Promise<BoardColumn[]> {
  const col = await coll<ColumnDoc>("columns");
  const docs = await col.find({ orgId, boardId }).sort({ order: 1 }).toArray();
  return docs.map(parseColumn);
}

export async function createColumn(
  orgId: string,
  input: Omit<BoardColumn, "id" | "orgId">
): Promise<BoardColumn> {
  const col = await coll<ColumnDoc>("columns");
  const id = crypto.randomUUID();
  await col.insertOne({ _id: id, orgId, ...input });
  return BoardColumnSchema.parse({ id, orgId, ...input });
}

/**
 * Counts how many columns on a board are flagged `isDone: true`.
 * Used to enforce the "every board must have ≥1 done column" invariant
 * before we permit toggling `isDone` off or deleting a done column.
 */
async function countDoneColumns(orgId: string, boardId: string): Promise<number> {
  const col = await coll<ColumnDoc>("columns");
  return col.countDocuments({ orgId, boardId, isDone: true });
}

export async function updateColumn(
  orgId: string,
  id: string,
  patch: Partial<Pick<BoardColumn, "name" | "states" | "color" | "isDone">>
): Promise<BoardColumn | null> {
  const col = await coll<ColumnDoc>("columns");

  if (patch.isDone === false) {
    const current = await col.findOne({ _id: id, orgId });
    if (current?.isDone === true) {
      const doneCount = await countDoneColumns(orgId, current.boardId);
      if (doneCount <= 1) {
        throw new Error("Cannot unmark the last 'Done' column — every board needs at least one.");
      }
    }
  }

  const result = await col.findOneAndUpdate(
    { _id: id, orgId },
    { $set: patch },
    { returnDocument: "after" }
  );
  if (!result) return null;
  return parseColumn(result);
}

export async function deleteColumn(orgId: string, id: string): Promise<boolean> {
  const col = await coll<ColumnDoc>("columns");
  const target = await col.findOne({ _id: id, orgId });
  if (!target) return false;
  if (target.protected === true) {
    throw new Error("Cannot delete a protected column.");
  }
  if (target.isDone === true) {
    const doneCount = await countDoneColumns(orgId, target.boardId);
    if (doneCount <= 1) {
      throw new Error("Cannot delete the last 'Done' column — every board needs at least one.");
    }
  }
  const result = await col.deleteOne({ _id: id, orgId });
  return result.deletedCount === 1;
}

export async function reorderColumns(
  orgId: string,
  boardId: string,
  orderedIds: string[]
): Promise<void> {
  const col = await coll<ColumnDoc>("columns");
  await Promise.all(
    orderedIds.map((id, index) =>
      col.updateOne(
        { _id: id, orgId, boardId },
        { $set: { order: index } }
      )
    )
  );
}

// ─── Tickets ─────────────────────────────────────────────────────────────────

/**
 * Parses a Mongo ticket doc into the typed `Ticket`.
 * Backcompat: docs that still carry the legacy `linkedTicketIds: string[]` are
 * lifted to typed `links` with `kind: "relatedTo"`. Old docs self-migrate on next write.
 */
function parseTicket(d: Record<string, unknown>): Ticket {
  const rawLinks = d.links;
  const legacyIds = d.linkedTicketIds;
  const links = Array.isArray(rawLinks)
    ? rawLinks
    : Array.isArray(legacyIds)
      ? (legacyIds as string[]).map((id) => ({ kind: "relatedTo" as const, targetTicketId: id }))
      : [];
  return TicketSchema.parse({
    id: d._id,
    orgId: d.orgId,
    ticketNumber: d.ticketNumber,
    boardId: d.boardId,
    columnId: d.columnId,
    hierarchyType: d.hierarchyType,
    parentTicketId: d.parentTicketId ?? null,
    title: d.title,
    description: d.description,
    label: d.label,
    fixVersion: d.fixVersion,
    storyPoints: d.storyPoints,
    workflowState: d.workflowState,
    priority: d.priority,
    links,
    assigneeIds: d.assigneeIds ?? [],
    sprintIds: d.sprintIds ?? [],
    version: d.version ?? 0,
  });
}

export async function getTickets(orgId: string, boardId: string): Promise<Ticket[]> {
  const col = await coll<TicketDoc>("tickets");
  const docs = await col.find({ orgId, boardId }).toArray();
  return docs.map(parseTicket);
}

export async function getTicketById(orgId: string, id: string): Promise<Ticket | null> {
  const col = await coll<TicketDoc>("tickets");
  const doc = await col.findOne({ _id: id, orgId });
  return doc ? parseTicket(doc) : null;
}

export async function getTicketsByIds(orgId: string, ids: readonly string[]): Promise<Ticket[]> {
  if (ids.length === 0) return [];
  const col = await coll<TicketDoc>("tickets");
  const docs = await col.find({ orgId, _id: { $in: ids as string[] } }).toArray();
  return docs.map(parseTicket);
}

/**
 * Look up a ticket by its human-readable ticket number (e.g. "OR-42").
 * Index-backed by `{ orgId: 1, ticketNumber: 1 }` (unique). O(1).
 *
 * Used by the dedicated `/tickets/[ticketNumber]` route so a shared link
 * resolves directly to the correct ticket without preloading every board.
 */
export async function getTicketByNumber(
  orgId: string,
  ticketNumber: string
): Promise<Ticket | null> {
  const col = await coll<TicketDoc>("tickets");
  const doc = await col.findOne({ orgId, ticketNumber });
  return doc ? parseTicket(doc) : null;
}

export async function createTicket(
  orgId: string,
  actorId: string,
  input: CreateTicketInput,
): Promise<Ticket> {
  const ticketNumber = await reserveTicketNumber(orgId, input.boardId);
  const col = await coll<TicketDoc>("tickets");
  const id = crypto.randomUUID();
  const doc = {
    _id: id,
    orgId,
    ticketNumber,
    ...input,
    parentTicketId: input.parentTicketId ?? null,
    links: [],
    assigneeIds: input.assigneeIds ?? [],
    sprintIds: input.sprintIds ?? [],
    version: 0,
  };
  await col.insertOne(doc);
  await recordHistory(orgId, id, actorId, "created", []);
  return parseTicket(doc);
}

/**
 * Atomically reserves the next ticket number for a board. Format: `${code}-${n}`,
 * where `n` starts at 1 and increments per board. Single round-trip via
 * findOneAndUpdate's $inc — safe under concurrent createTicket calls.
 */
async function reserveTicketNumber(orgId: string, boardId: string): Promise<string> {
  const code = await ensureBoardCode(orgId, boardId);
  const boards = await coll<BoardDoc>("boards");
  const updated = await boards.findOneAndUpdate(
    { _id: boardId, orgId },
    { $inc: { nextTicketNumber: 1 } },
    { returnDocument: "after" }
  );
  if (!updated) throw new Error("Board not found");
  // First-ever ticket on a legacy board (counter was missing) → $inc treats
  // missing as 0, so we land at 1. Number it as 1 either way.
  const n = updated.nextTicketNumber ?? 1;
  return `${code}-${n}`;
}

export type UpdateTicketResult =
  | { kind: "ok"; ticket: Ticket }
  | { kind: "conflict"; currentState: Ticket; conflictedFields: string[] };

/**
 * Updates a ticket using optimistic concurrency.
 *
 * The client must send the `expectedVersion` it last observed. The update is
 * only applied if the server's current `version` still matches. Otherwise we
 * return the current document plus the list of fields that diverge from the
 * patch so the UI can render a PR-style diff and let the user merge or discard.
 */
export async function updateTicket(
  orgId: string,
  actorId: string,
  id: string,
  patch: z.infer<typeof UpdateTicketInputSchema>
): Promise<UpdateTicketResult> {
  const validated = UpdateTicketInputSchema.parse(patch);
  const { expectedVersion, ...fieldsToSet } = validated;

  const col = await coll<TicketDoc>("tickets");
  const current = await col.findOne({ _id: id, orgId });
  if (!current) throw new Error("Ticket not found");

  if ((current.version ?? 0) !== expectedVersion) {
    const currentTicket = parseTicket(current);
    return {
      kind: "conflict",
      currentState: currentTicket,
      conflictedFields: computeConflictedFields(fieldsToSet, currentTicket),
    };
  }

  const updated = await col.findOneAndUpdate(
    { _id: id, orgId, version: expectedVersion },
    { $set: fieldsToSet, $inc: { version: 1 } },
    { returnDocument: "after" }
  );

  if (!updated) {
    // Lost race between the read and the update — re-read and report conflict
    const fresh = await col.findOne({ _id: id, orgId });
    if (!fresh) throw new Error("Ticket not found");
    const freshTicket = parseTicket(fresh);
    return {
      kind: "conflict",
      currentState: freshTicket,
      conflictedFields: computeConflictedFields(fieldsToSet, freshTicket),
    };
  }

  const newTicket = parseTicket(updated);
  const previousTicket = parseTicket(current);
  const changes = diffTickets(previousTicket, newTicket);

  if (changes.length > 0) {
    await recordHistory(orgId, id, actorId, "updated", changes);
  }
  const addedAssignees = newTicket.assigneeIds.filter((u) => !previousTicket.assigneeIds.includes(u));
  const removedAssignees = previousTicket.assigneeIds.filter((u) => !newTicket.assigneeIds.includes(u));
  await Promise.all([
    ...addedAssignees.map((userId) =>
      recordHistory(orgId, id, actorId, "assignee_added", [{ field: "assignee", from: null, to: userId }])
    ),
    ...removedAssignees.map((userId) =>
      recordHistory(orgId, id, actorId, "assignee_removed", [{ field: "assignee", from: userId, to: null }])
    ),
  ]);

  return { kind: "ok", ticket: newTicket };
}

function computeConflictedFields(patch: Record<string, unknown>, current: Ticket): string[] {
  const conflicted: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const currentValue = (current as unknown as Record<string, unknown>)[key];
    if (JSON.stringify(currentValue) !== JSON.stringify(value)) {
      conflicted.push(key);
    }
  }
  return conflicted;
}

function diffTickets(prev: Ticket, next: Ticket): HistoryFieldChange[] {
  const tracked: (keyof Ticket)[] = [
    "title", "description", "label", "fixVersion", "priority",
    "storyPoints", "workflowState", "columnId",
    "hierarchyType", "parentTicketId",
  ];
  const changes: HistoryFieldChange[] = [];
  for (const field of tracked) {
    const a = prev[field];
    const b = next[field];
    if (a !== b) {
      changes.push({ field, from: stringifyForHistory(a), to: stringifyForHistory(b) });
    }
  }
  return changes;
}

function stringifyForHistory(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

// ─── Release Versions ────────────────────────────────────────────────────────

export async function getReleaseVersions(orgId: string, boardId: string): Promise<ReleaseVersion[]> {
  const col = await coll<VersionDoc>("versions");
  const docs = await col.find({ orgId, boardId }).toArray();
  return docs.map((d) =>
    ReleaseVersionSchema.parse({
      id: d._id,
      orgId: d.orgId,
      boardId: d.boardId,
      name: d.name,
      releaseDate: d.releaseDate,
    })
  );
}

export async function createVersion(
  orgId: string,
  boardId: string,
  name: string,
  releaseDate: string
): Promise<ReleaseVersion> {
  const col = await coll<VersionDoc>("versions");
  const id = crypto.randomUUID();
  await col.insertOne({ _id: id, orgId, boardId, name, releaseDate });
  return ReleaseVersionSchema.parse({ id, orgId, boardId, name, releaseDate });
}

export async function deleteVersion(orgId: string, id: string): Promise<boolean> {
  const col = await coll<VersionDoc>("versions");
  const result = await col.deleteOne({ _id: id, orgId });
  return result.deletedCount === 1;
}

// ─── Board Members ───────────────────────────────────────────────────────────

export async function getBoardMembers(orgId: string, boardId: string): Promise<BoardMember[]> {
  const col = await coll<BoardMemberDoc>("boardMembers");
  const docs = await col.find({ orgId, boardId }).toArray();
  return docs.map((d) =>
    BoardMemberSchema.parse({
      orgId: d.orgId,
      boardId: d.boardId,
      userId: d.userId,
      role: d.role,
      addedAt: d.addedAt,
    })
  );
}

export async function addBoardMember(
  orgId: string,
  boardId: string,
  userId: string,
  role: BoardMember["role"]
): Promise<BoardMember> {
  const col = await coll<BoardMemberDoc>("boardMembers");
  const addedAt = new Date().toISOString();
  await col.updateOne(
    { orgId, boardId, userId },
    { $set: { orgId, boardId, userId, role, addedAt } },
    { upsert: true }
  );
  return BoardMemberSchema.parse({ orgId, boardId, userId, role, addedAt });
}

export async function removeBoardMember(
  orgId: string,
  boardId: string,
  userId: string
): Promise<boolean> {
  const col = await coll<BoardMemberDoc>("boardMembers");
  const result = await col.deleteOne({ orgId, boardId, userId });
  return result.deletedCount === 1;
}

export async function isBoardMember(
  orgId: string,
  boardId: string,
  userId: string
): Promise<boolean> {
  const col = await coll<BoardMemberDoc>("boardMembers");
  const found = await col.findOne({ orgId, boardId, userId });
  return found !== null;
}

// ─── Comments ────────────────────────────────────────────────────────────────

function parseComment(d: Record<string, unknown>): Comment {
  return CommentSchema.parse({
    id: d._id,
    orgId: d.orgId,
    ticketId: d.ticketId,
    authorId: d.authorId,
    body: d.body,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  });
}

export async function getComments(orgId: string, ticketId: string): Promise<Comment[]> {
  const col = await coll<CommentDoc>("comments");
  const docs = await col.find({ orgId, ticketId }).sort({ createdAt: 1 }).toArray();
  return docs.map(parseComment);
}

export async function getCommentsByTicketIds(
  orgId: string,
  ticketIds: readonly string[]
): Promise<Comment[]> {
  if (ticketIds.length === 0) return [];
  const col = await coll<CommentDoc>("comments");
  const docs = await col
    .find({ orgId, ticketId: { $in: ticketIds as string[] } })
    .sort({ createdAt: 1 })
    .toArray();
  return docs.map(parseComment);
}

export async function createComment(
  orgId: string,
  actorId: string,
  ticketId: string,
  body: string
): Promise<Comment> {
  const col = await coll<CommentDoc>("comments");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await col.insertOne({
    _id: id,
    orgId,
    ticketId,
    authorId: actorId,
    body,
    createdAt: now,
    updatedAt: now,
  });
  await recordHistory(orgId, ticketId, actorId, "commented", [
    { field: "comment", from: null, to: body },
  ]);
  return CommentSchema.parse({ id, orgId, ticketId, authorId: actorId, body, createdAt: now, updatedAt: now });
}

export async function updateComment(
  orgId: string,
  actorId: string,
  commentId: string,
  body: string
): Promise<Comment | null> {
  const col = await coll<CommentDoc>("comments");
  const previous = await col.findOne({ _id: commentId, orgId });
  if (!previous) return null;
  if (previous.authorId !== actorId) throw new Error("Forbidden: can only edit your own comments");

  const updatedAt = new Date().toISOString();
  const result = await col.findOneAndUpdate(
    { _id: commentId, orgId },
    { $set: { body, updatedAt } },
    { returnDocument: "after" }
  );
  if (!result) return null;
  await recordHistory(orgId, result.ticketId, actorId, "comment_edited", [
    { field: "comment", from: previous.body, to: body },
  ]);
  return parseComment(result);
}

export async function deleteComment(
  orgId: string,
  actorId: string,
  commentId: string
): Promise<boolean> {
  const col = await coll<CommentDoc>("comments");
  const previous = await col.findOne({ _id: commentId, orgId });
  if (!previous) return false;
  if (previous.authorId !== actorId) throw new Error("Forbidden: can only delete your own comments");

  const result = await col.deleteOne({ _id: commentId, orgId });
  if (result.deletedCount !== 1) return false;
  await recordHistory(orgId, previous.ticketId, actorId, "comment_deleted", [
    { field: "comment", from: previous.body, to: null },
  ]);
  return true;
}

// ─── Ticket History ──────────────────────────────────────────────────────────

export async function recordHistory(
  orgId: string,
  ticketId: string,
  actorId: string,
  kind: HistoryEntryKind,
  changes: HistoryFieldChange[]
): Promise<void> {
  const col = await coll<HistoryDoc>("ticketHistory");
  await col.insertOne({
    _id: crypto.randomUUID(),
    orgId,
    ticketId,
    actorId,
    timestamp: new Date().toISOString(),
    kind,
    changes,
  });
}

export async function getTicketHistory(
  orgId: string,
  ticketId: string
): Promise<TicketHistoryEntry[]> {
  const col = await coll<HistoryDoc>("ticketHistory");
  const docs = await col.find({ orgId, ticketId }).sort({ timestamp: -1 }).toArray();
  return docs.map((d) =>
    TicketHistoryEntrySchema.parse({
      id: d._id,
      orgId: d.orgId,
      ticketId: d.ticketId,
      actorId: d.actorId,
      timestamp: d.timestamp,
      kind: d.kind,
      changes: d.changes ?? [],
    })
  );
}

// ─── Seed ────────────────────────────────────────────────────────────────────

export async function seedBoardIfEmpty(
  orgId: string,
  seed: {
    boards: Board[];
    boardColumns: BoardColumn[];
    tickets: Ticket[];
    versions: ReleaseVersion[];
    boardId: string;
  }
): Promise<void> {
  const client = await clientPromise;
  await ensureIndexes();
  const database = client.db(DB_NAME);
  const existing = await database
    .collection<BoardDoc>("boards")
    .countDocuments({ orgId, _id: seed.boardId });
  if (existing > 0) return;

  await database.collection<BoardDoc>("boards").insertMany(
    seed.boards.map((b) => ({
      _id: b.id,
      orgId,
      name: b.name,
      type: b.type,
    }))
  );
  await database.collection<ColumnDoc>("columns").insertMany(
    seed.boardColumns.map((c, index) => ({
      _id: c.id,
      orgId,
      boardId: c.boardId,
      name: c.name,
      states: c.states,
      color: c.color,
      order: c.order ?? index,
    }))
  );
  if (seed.tickets.length > 0) {
    await database.collection<TicketDoc>("tickets").insertMany(
      seed.tickets.map((t) => ({
        _id: t.id,
        orgId,
        ticketNumber: t.ticketNumber,
        boardId: t.boardId,
        columnId: t.columnId,
        hierarchyType: t.hierarchyType,
        parentTicketId: t.parentTicketId,
        title: t.title,
        description: t.description,
        label: t.label,
        fixVersion: t.fixVersion,
        storyPoints: t.storyPoints,
        workflowState: t.workflowState,
        priority: t.priority,
        links: t.links,
        assigneeIds: t.assigneeIds ?? [],
        version: 0,
      }))
    );
  }
  if (seed.versions.length > 0) {
    await database.collection<VersionDoc>("versions").insertMany(
      seed.versions.map((v) => ({
        _id: v.id,
        orgId,
        boardId: seed.boardId,
        name: v.name,
        releaseDate: v.releaseDate,
      }))
    );
  }
}

// ─── Labels ──────────────────────────────────────────────────────────────────

interface LabelDoc { _id: string; orgId: string; label: string }

const DEFAULT_LABELS = [
  "backend", "frontend", "security", "infra", "ux", "qa",
  "devops", "api", "ai", "planning", "coordination",
  "analysis", "observability", "mlops",
];

/**
 * Returns the union of: default seed labels + any org-created labels.
 * Sorted alphabetically. De-duplicated.
 */
export async function getLabels(orgId: string): Promise<string[]> {
  const col = await coll<LabelDoc>("labels");
  const docs = await col.find({ orgId }).toArray();
  const set = new Set<string>(DEFAULT_LABELS);
  for (const d of docs) set.add(d.label);
  return Array.from(set).sort();
}

/**
 * Adds a label to the org-scoped vocabulary. Idempotent — upsert by (orgId, label).
 * Returns the normalized (lowercase, trimmed) label.
 */
export async function addLabel(orgId: string, label: string): Promise<string> {
  const normalized = label.trim().toLowerCase();
  if (!normalized) throw new Error("Label cannot be empty");
  const col = await coll<LabelDoc>("labels");
  await col.updateOne(
    { orgId, label: normalized },
    { $setOnInsert: { _id: crypto.randomUUID(), orgId, label: normalized } },
    { upsert: true }
  );
  return normalized;
}

// ─── Sprint ───────────────────────────────────────────────────────────────────

interface SprintDoc {
  _id: string; orgId: string; boardId: string; name: string;
  description?: string; goal?: string;
  startDate: string; endDate: string; capacityPoints: number;
  status: "planning" | "active" | "completed";
  completedPoints?: number;
}

function parseSprint(d: SprintDoc): Sprint {
  return SprintSchema.parse({
    id: d._id, orgId: d.orgId, boardId: d.boardId, name: d.name,
    description: d.description ?? "",
    goal: d.goal ?? "",
    startDate: d.startDate, endDate: d.endDate,
    capacityPoints: d.capacityPoints, status: d.status,
    completedPoints: d.completedPoints,
  });
}

export async function getSprints(orgId: string, boardId: string): Promise<Sprint[]> {
  const col = await coll<SprintDoc>("sprints");
  const docs = await col.find({ orgId, boardId }).sort({ startDate: 1 }).toArray();
  return docs.map(parseSprint);
}

export async function createSprint(
  orgId: string,
  input: {
    boardId: string;
    name?: string;
    description?: string;
    goal?: string;
    startDate: string;
    endDate: string;
    capacityPoints: number;
  }
): Promise<Sprint> {
  const col = await coll<SprintDoc>("sprints");
  const id = crypto.randomUUID();

  // Auto-name when not provided: `{boardName} {N+1}` where N is existing sprints on this board.
  let name = input.name?.trim();
  if (!name) {
    const boards = await coll<BoardDoc>("boards");
    const board = await boards.findOne({ _id: input.boardId, orgId });
    const existingCount = await col.countDocuments({ orgId, boardId: input.boardId });
    const boardName = board?.name ?? "Sprint";
    name = `${boardName} ${existingCount + 1}`;
  }

  const doc: SprintDoc = {
    _id: id,
    orgId,
    boardId: input.boardId,
    name,
    description: input.description ?? "",
    goal: input.goal ?? "",
    startDate: input.startDate,
    endDate: input.endDate,
    capacityPoints: input.capacityPoints,
    status: "planning",
  };
  await col.insertOne(doc);
  return parseSprint(doc);
}

export async function updateSprint(
  orgId: string,
  id: string,
  patch: Partial<Pick<Sprint, "name" | "description" | "goal" | "startDate" | "endDate" | "capacityPoints" | "status">>
): Promise<Sprint | null> {
  const col = await coll<SprintDoc>("sprints");

  // When transitioning from non-completed → completed, snapshot the
  // currently-done story points as immutable velocity history.
  const set: Partial<SprintDoc> = { ...patch };
  if (patch.status === "completed") {
    const current = await col.findOne({ _id: id, orgId });
    if (current && current.status !== "completed") {
      set.completedPoints = await sumDoneStoryPointsForSprint(orgId, current.boardId, id);
    }
  }

  const result = await col.findOneAndUpdate(
    { _id: id, orgId },
    { $set: set },
    { returnDocument: "after" }
  );
  return result ? parseSprint(result) : null;
}

/**
 * Sums `storyPoints` of tickets that:
 *   - belong to the given sprint, AND
 *   - sit in a column flagged `isDone: true`.
 * Used to snapshot velocity at sprint-completion time.
 */
async function sumDoneStoryPointsForSprint(
  orgId: string,
  boardId: string,
  sprintId: string,
): Promise<number> {
  const colsCol = await coll<ColumnDoc>("columns");
  const doneColumns = await colsCol
    .find({ orgId, boardId, isDone: true })
    .project<{ _id: string }>({ _id: 1 })
    .toArray();
  if (doneColumns.length === 0) return 0;
  const doneIds = doneColumns.map((c) => c._id);
  const ticketsCol = await coll<TicketDoc>("tickets");
  const tickets = await ticketsCol
    .find({ orgId, boardId, columnId: { $in: doneIds }, sprintIds: sprintId })
    .project<{ storyPoints: number }>({ storyPoints: 1 })
    .toArray();
  return tickets.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
}

export async function deleteSprint(orgId: string, id: string): Promise<boolean> {
  const col = await coll<SprintDoc>("sprints");
  const result = await col.deleteOne({ _id: id, orgId });
  return result.deletedCount > 0;
}

// ─── SprintAssignment ─────────────────────────────────────────────────────────

interface SprintAssignmentDoc {
  _id: string; orgId: string; sprintId: string; userId: string; availableHours: number;
}

function parseSprintAssignment(d: SprintAssignmentDoc): SprintAssignment {
  return SprintAssignmentSchema.parse({
    id: d._id, orgId: d.orgId, sprintId: d.sprintId,
    userId: d.userId, availableHours: d.availableHours,
  });
}

export async function getSprintAssignments(orgId: string, sprintId: string): Promise<SprintAssignment[]> {
  const col = await coll<SprintAssignmentDoc>("sprintAssignments");
  const docs = await col.find({ orgId, sprintId }).toArray();
  return docs.map(parseSprintAssignment);
}

export async function upsertSprintAssignment(
  orgId: string,
  input: { sprintId: string; userId: string; availableHours: number }
): Promise<SprintAssignment> {
  const col = await coll<SprintAssignmentDoc>("sprintAssignments");
  const id = crypto.randomUUID();
  await col.updateOne(
    { orgId, sprintId: input.sprintId, userId: input.userId },
    {
      $set: { availableHours: input.availableHours },
      $setOnInsert: { _id: id, orgId, sprintId: input.sprintId, userId: input.userId },
    },
    { upsert: true }
  );
  const doc = await col.findOne({ orgId, sprintId: input.sprintId, userId: input.userId });
  if (!doc) throw new Error("Failed to upsert sprint assignment");
  return parseSprintAssignment(doc);
}

export async function removeSprintAssignment(
  orgId: string, sprintId: string, userId: string
): Promise<boolean> {
  const col = await coll<SprintAssignmentDoc>("sprintAssignments");
  const result = await col.deleteOne({ orgId, sprintId, userId });
  return result.deletedCount > 0;
}

// ─── EpicSnapshot ─────────────────────────────────────────────────────────────

/**
 * Mongo doc shape for EpicSnapshot — rich typed frozen artifacts.
 * `planJson` is a legacy field carried for read-time backcompat; old documents
 * that have it (and lack the typed fields) will still parse, with empty
 * frozen artifacts. Old data should be re-committed to populate fully.
 */
interface EpicSnapshotDoc {
  _id: string;
  orgId: string;
  boardId?: string;
  epicTicketId: string;
  draftId?: string | null;
  createdAt: string;
  createdBy?: string | null;
  transcript?: BrainstormTurn[];
  blueprintTranscript?: BrainstormTurn[];
  brainstormSummary?: BrainstormSummary | null;
  backlog?: BacklogProposal | null;
  plannerTranscript?: BrainstormTurn[];
  sprintPlan?: SprintPlan | null;
  planningSprints?: SprintSnapshot[];
  planningMembers?: MemberSnapshot[];
  ticketIds?: string[];
  /** Legacy: pre-A.2 documents stored a JSON-encoded plan blob here. */
  planJson?: string;
}

function parseEpicSnapshot(d: EpicSnapshotDoc): EpicSnapshot {
  const backlog = d.backlog
    ? {
        ...d.backlog,
        tickets: d.backlog.tickets.map((t) => ({
          ...t,
          label: normalizeLabel(t.label as string),
        })),
      }
    : null;
  return epicSnapshotSchema.parse({
    id: d._id,
    orgId: d.orgId,
    boardId: d.boardId ?? "",
    epicTicketId: d.epicTicketId,
    draftId: d.draftId ?? null,
    createdAt: d.createdAt,
    createdBy: d.createdBy ?? null,
    transcript: d.transcript ?? [],
    blueprintTranscript: d.blueprintTranscript ?? [],
    brainstormSummary: d.brainstormSummary ?? null,
    backlog,
    plannerTranscript: d.plannerTranscript ?? [],
    sprintPlan: d.sprintPlan
      ? {
          ...d.sprintPlan,
          overflow: (d.sprintPlan.overflow ?? []).map((t) => ({
            ...t,
            label: normalizeLabel(t.label as string),
          })),
        }
      : null,
    planningSprints: d.planningSprints ?? [],
    planningMembers: d.planningMembers ?? [],
    ticketIds: d.ticketIds ?? [],
  });
}

export async function getEpicSnapshot(
  orgId: string, epicTicketId: string
): Promise<EpicSnapshot | null> {
  const col = await coll<EpicSnapshotDoc>("epicSnapshots");
  const doc = await col.findOne({ orgId, epicTicketId });
  return doc ? parseEpicSnapshot(doc) : null;
}

export async function getEpicSnapshotById(
  orgId: string, id: string
): Promise<EpicSnapshot | null> {
  const col = await coll<EpicSnapshotDoc>("epicSnapshots");
  const doc = await col.findOne({ _id: id, orgId });
  return doc ? parseEpicSnapshot(doc) : null;
}

/**
 * Lightweight projection used by the orchestrator picker. Returns
 * committed Epics for a board, newest first. Legacy snapshots that
 * predate the `boardId` field are intentionally skipped — they can't
 * be attributed to a specific board.
 */
export async function listCommittedEpicsByBoard(
  orgId: string, boardId: string,
): Promise<EpicSnapshotIndexEntry[]> {
  const col = await coll<EpicSnapshotDoc>("epicSnapshots");
  const docs = await col
    .find({ orgId, boardId })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map((d) => ({
    id: d._id,
    epicTicketId: d.epicTicketId,
    boardId: d.boardId ?? "",
    title: d.backlog?.epicTitle?.trim() || "Untitled Epic",
    createdAt: d.createdAt,
    createdBy: d.createdBy ?? null,
    ticketCount: d.ticketIds?.length ?? 0,
  }));
}

/**
 * Writes a single EpicSnapshot. Called once per Epic by `commitEpicDraft`.
 * Inputs are the typed frozen artifacts captured from the draft at commit time
 * plus the live ticket ids created by the commit pipeline.
 */
export async function createEpicSnapshot(
  orgId: string,
  input: {
    boardId: string;
    epicTicketId: string;
    draftId: string | null;
    createdBy: string | null;
    transcript: BrainstormTurn[];
    blueprintTranscript: BrainstormTurn[];
    brainstormSummary: BrainstormSummary | null;
    backlog: BacklogProposal | null;
    plannerTranscript: BrainstormTurn[];
    sprintPlan: SprintPlan | null;
    planningSprints: SprintSnapshot[];
    planningMembers: MemberSnapshot[];
    ticketIds: string[];
  },
): Promise<EpicSnapshot> {
  const col = await coll<EpicSnapshotDoc>("epicSnapshots");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const doc: EpicSnapshotDoc = {
    _id: id,
    orgId,
    boardId: input.boardId,
    epicTicketId: input.epicTicketId,
    draftId: input.draftId,
    createdAt,
    createdBy: input.createdBy,
    transcript: input.transcript,
    blueprintTranscript: input.blueprintTranscript,
    brainstormSummary: input.brainstormSummary,
    backlog: input.backlog,
    plannerTranscript: input.plannerTranscript,
    sprintPlan: input.sprintPlan,
    planningSprints: input.planningSprints,
    planningMembers: input.planningMembers,
    ticketIds: input.ticketIds,
  };
  await col.insertOne(doc);
  return parseEpicSnapshot(doc);
}

// ─── Phase 5 Inspector ────────────────────────────────────────────────────────

interface InspectorTranscriptDoc {
  _id: string;
  orgId: string;
  epicSnapshotId: string;
  turns: InspectorTurn[];
  updatedAt: string;
}

function parseInspectorTranscript(d: InspectorTranscriptDoc): InspectorTranscript {
  return inspectorTranscriptSchema.parse({
    id: d._id,
    orgId: d.orgId,
    epicSnapshotId: d.epicSnapshotId,
    turns: d.turns ?? [],
    updatedAt: d.updatedAt,
  });
}

/**
 * Returns the single per-Epic transcript or `null` if no Phase 5 turn has
 * been recorded yet. Callers (the Inspector boot flow) should treat `null`
 * as "transcript will be lazily created on first appendInspectorTurn".
 */
export async function getInspectorTranscript(
  orgId: string,
  epicSnapshotId: string,
): Promise<InspectorTranscript | null> {
  const col = await coll<InspectorTranscriptDoc>("inspectorTranscripts");
  const doc = await col.findOne({ orgId, epicSnapshotId });
  return doc ? parseInspectorTranscript(doc) : null;
}

/**
 * Append-only write. Creates the transcript doc on first call (upsert),
 * pushes the turn into `turns[]`, and bumps `updatedAt`. The unique index
 * on `(orgId, epicSnapshotId)` guarantees one transcript per Epic.
 */
export async function appendInspectorTurn(
  orgId: string,
  epicSnapshotId: string,
  turn: InspectorTurn,
): Promise<InspectorTranscript> {
  const col = await coll<InspectorTranscriptDoc>("inspectorTranscripts");
  const updatedAt = new Date().toISOString();
  await col.updateOne(
    { orgId, epicSnapshotId },
    {
      $push: { turns: turn },
      $set: { updatedAt },
      $setOnInsert: { _id: crypto.randomUUID(), orgId, epicSnapshotId },
    },
    { upsert: true },
  );
  const doc = await col.findOne({ orgId, epicSnapshotId });
  if (!doc) throw new Error("Failed to load InspectorTranscript after upsert");
  return parseInspectorTranscript(doc);
}

interface EpicMemoryDoc {
  _id: string;
  orgId: string;
  epicSnapshotId: string;
  content: string;
  tags: string[];
  source: EpicMemorySource;
  createdAt: string;
}

function parseEpicMemory(d: EpicMemoryDoc): EpicMemory {
  return epicMemorySchema.parse({
    id: d._id,
    orgId: d.orgId,
    epicSnapshotId: d.epicSnapshotId,
    content: d.content,
    tags: d.tags ?? [],
    source: d.source,
    createdAt: d.createdAt,
  });
}

/** Returns memories for an Epic, newest first. */
export async function listEpicMemories(
  orgId: string,
  epicSnapshotId: string,
): Promise<EpicMemory[]> {
  const col = await coll<EpicMemoryDoc>("epicMemories");
  const docs = await col
    .find({ orgId, epicSnapshotId })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map(parseEpicMemory);
}

/**
 * Writes a single `EpicMemory`. Called by the Inspector via the `saveInsight`
 * tool when a meaningful observation emerges from the conversation.
 */
export async function createEpicMemory(
  orgId: string,
  input: {
    epicSnapshotId: string;
    content: string;
    tags: string[];
    source: EpicMemorySource;
  },
): Promise<EpicMemory> {
  const col = await coll<EpicMemoryDoc>("epicMemories");
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const doc: EpicMemoryDoc = {
    _id: id,
    orgId,
    epicSnapshotId: input.epicSnapshotId,
    content: input.content,
    tags: input.tags,
    source: input.source,
    createdAt,
  };
  await col.insertOne(doc);
  return parseEpicMemory(doc);
}

// ─── Epic Drafts (Orchestrator) ───────────────────────────────────────────────

/**
 * Mongo doc shape for an epic draft. `_id` is the same UUID as `EpicDraft.id`.
 * Soft-delete via `deletedAt: Date` mirrors the Boards pattern.
 */
interface EpicDraftDoc {
  _id: string;
  orgId: string;
  boardId: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
  phase: OrchestratorPhase;
  transcript: BrainstormTurn[];
  blueprintTranscript?: BrainstormTurn[];
  brainstormSummary: BrainstormSummary | null;
  backlog: BacklogProposal | null;
  refinementCursor: number;
  sprintPlan?: SprintPlan | null;
  plannerTranscript?: BrainstormTurn[];
  planningSprints?: SprintSnapshot[];
  planningMembers?: MemberSnapshot[];
  lastSeenAt: string;
  deletedAt?: Date | null;
}

/**
 * Map legacy 10-value ProposalLabel set to the current 4-value set.
 * Drafts saved before the label simplification still carry old values like
 * "frontend"/"backend"/"observability"; collapse them on read so the Zod
 * schema accepts the doc.
 */
const LEGACY_LABEL_MAP: Record<string, "developer" | "ux" | "qa" | "po"> = {
  frontend: "developer",
  backend: "developer",
  api: "developer",
  infra: "developer",
  devops: "developer",
  ai: "developer",
  security: "developer",
  observability: "developer",
  ux: "ux",
  qa: "qa",
  po: "po",
  developer: "developer",
};

function normalizeLabel(label: string): "developer" | "ux" | "qa" | "po" {
  return LEGACY_LABEL_MAP[label] ?? "developer";
}

function parseEpicDraft(d: EpicDraftDoc): EpicDraft {
  return epicDraftSchema.parse({
    id: d._id,
    orgId: d.orgId,
    boardId: d.boardId,
    authorId: d.authorId,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    phase: d.phase,
    transcript: d.transcript ?? [],
    blueprintTranscript: d.blueprintTranscript ?? [],
    brainstormSummary: d.brainstormSummary ?? null,
    backlog: d.backlog ? {
      ...d.backlog,
      tickets: d.backlog.tickets.map((t) => ({
        ...t,
        label: normalizeLabel(t.label as string),
        transcript: t.transcript ?? [],
      })),
    } : null,
    refinementCursor: d.refinementCursor ?? 0,
    sprintPlan: d.sprintPlan ?? null,
    plannerTranscript: d.plannerTranscript ?? [],
    planningSprints: d.planningSprints ?? [],
    planningMembers: d.planningMembers ?? [],
    lastSeenAt: d.lastSeenAt ?? d.updatedAt,
  });
}

function toIndexEntry(d: EpicDraftDoc): EpicDraftIndexEntry {
  const fallbackTitle =
    d.backlog?.epicTitle?.trim() ||
    d.transcript.find((t) => t.role === "user")?.text?.slice(0, 60) ||
    "Untitled draft";
  return {
    id: d._id,
    title: fallbackTitle,
    phase: d.phase,
    updatedAt: d.updatedAt,
  };
}

export async function getEpicDrafts(
  orgId: string,
  boardId: string,
): Promise<EpicDraftIndexEntry[]> {
  const col = await coll<EpicDraftDoc>("epicDrafts");
  const docs = await col
    .find({ orgId, boardId, deletedAt: null })
    .sort({ updatedAt: -1 })
    .toArray();
  return docs.map(toIndexEntry);
}

export async function getEpicDraft(
  orgId: string,
  id: string,
): Promise<EpicDraft | null> {
  const col = await coll<EpicDraftDoc>("epicDrafts");
  const doc = await col.findOne({ _id: id, orgId, deletedAt: null });
  return doc ? parseEpicDraft(doc) : null;
}

/**
 * Create a fresh draft. The orchestrator machine seeds it; this just persists
 * the initial empty state so the draft has an id the rest of the flow keys off.
 */
export async function createEpicDraft(
  orgId: string,
  authorId: string,
  boardId: string,
): Promise<EpicDraft> {
  const col = await coll<EpicDraftDoc>("epicDrafts");
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const doc: EpicDraftDoc = {
    _id: id,
    orgId,
    boardId,
    authorId,
    createdAt: now,
    updatedAt: now,
    phase: "phase1Brainstorming",
    transcript: [],
    blueprintTranscript: [],
    brainstormSummary: null,
    backlog: null,
    refinementCursor: 0,
    lastSeenAt: now,
    deletedAt: null,
  };
  await col.insertOne(doc);
  return parseEpicDraft(doc);
}

/**
 * Replace the draft with a new state. The orchestrator machine is the single
 * writer, so a full overwrite is simpler and avoids subtle merge bugs across
 * nested arrays (transcript, backlog.tickets). Always bumps `updatedAt`.
 */
export async function saveEpicDraft(
  orgId: string,
  draft: EpicDraft,
): Promise<EpicDraft> {
  const col = await coll<EpicDraftDoc>("epicDrafts");
  const updatedAt = new Date().toISOString();
  const next: EpicDraftDoc = {
    _id: draft.id,
    orgId,
    boardId: draft.boardId,
    authorId: draft.authorId,
    createdAt: draft.createdAt,
    updatedAt,
    phase: draft.phase,
    transcript: draft.transcript,
    blueprintTranscript: draft.blueprintTranscript,
    brainstormSummary: draft.brainstormSummary,
    backlog: draft.backlog,
    refinementCursor: draft.refinementCursor,
    sprintPlan: draft.sprintPlan,
    plannerTranscript: draft.plannerTranscript,
    planningSprints: draft.planningSprints,
    planningMembers: draft.planningMembers,
    lastSeenAt: draft.lastSeenAt,
    deletedAt: null,
  };
  await col.updateOne(
    { _id: draft.id, orgId },
    { $set: next },
    { upsert: true },
  );
  return parseEpicDraft(next);
}

/**
 * Soft-delete: keeps the document for audit/restore, removed from list queries.
 * Matches the Boards pattern.
 */
export async function softDeleteEpicDraft(
  orgId: string,
  id: string,
): Promise<boolean> {
  const col = await coll<EpicDraftDoc>("epicDrafts");
  const result = await col.updateOne(
    { _id: id, orgId, deletedAt: null },
    { $set: { deletedAt: new Date() } },
  );
  return result.modifiedCount > 0;
}

/**
 * Commit a draft to the board:
 *  1. Creates the Epic ticket.
 *  2. Creates child story/task tickets with parentTicketId pointing at the Epic.
 *  3. Creates an EpicSnapshot capturing the plan JSON.
 *  4. Marks the draft committed.
 *
 * All tickets land in the board's first column (lowest `order`).
 */
export async function commitEpicDraft(
  orgId: string,
  draftId: string,
  actorId: string,
): Promise<{ epicTicketId: string; createdTicketIds: string[]; snapshotId: string }> {
  const draft = await getEpicDraft(orgId, draftId);
  if (!draft) throw new Error("Draft not found");
  if (!draft.backlog) throw new Error("Draft has no backlog to commit");

  const columns = await getBoardColumns(orgId, draft.boardId);
  if (columns.length === 0) throw new Error("Board has no columns");
  const backlogColumn = columns[0];

  const epicTicket = await createTicket(orgId, actorId, {
    boardId: draft.boardId,
    columnId: backlogColumn.id,
    hierarchyType: "epic",
    parentTicketId: null,
    title: draft.backlog.epicTitle,
    description: draft.backlog.epicDescription,
    label: "planning",
    fixVersion: "",
    workflowState: backlogColumn.states[0] ?? "backlog",
    priority: "medium",
    storyPoints: 1,
    assigneeIds: [],
  });

  // Materialize proposed sprints first so their tickets land in real sprints,
  // not in the placeholder ids the planner emitted client-side.
  const proposedSprints = draft.sprintPlan?.proposedSprints ?? [];
  const proposedSprintIdMap = new Map<string, string>();
  for (const proposed of proposedSprints) {
    const sprint = await createSprint(orgId, {
      boardId: draft.boardId,
      name: proposed.name,
      startDate: proposed.startDate,
      endDate: proposed.endDate,
      capacityPoints: proposed.capacityPoints,
    });
    proposedSprintIdMap.set(proposed.id, sprint.id);
  }

  const planAssignments = draft.sprintPlan?.assignments ?? [];

  const createdTicketIds: string[] = [];
  for (const proposal of draft.backlog.tickets) {
    const assignment = planAssignments.find((a) => a.ticketId === proposal.id);
    const child = await createTicket(orgId, actorId, {
      boardId: draft.boardId,
      columnId: backlogColumn.id,
      hierarchyType: proposal.hierarchyType,
      parentTicketId: epicTicket.id,
      title: proposal.title,
      description: proposal.description,
      label: proposal.label,
      fixVersion: "",
      workflowState: backlogColumn.states[0] ?? "backlog",
      priority: "medium",
      storyPoints: proposal.storyPoints ?? 1,
      assigneeIds: assignment?.assigneeUserId ? [assignment.assigneeUserId] : [],
    });
    if (assignment?.sprintId) {
      // Swap proposed-sprint placeholder ids for the real ids we just created.
      const realSprintId = proposedSprintIdMap.get(assignment.sprintId) ?? assignment.sprintId;
      const ticketsCol = await coll<{ _id: string; sprintIds: string[]; version: number }>("tickets");
      await ticketsCol.updateOne(
        { _id: child.id, orgId },
        { $set: { sprintIds: [realSprintId] }, $inc: { version: 1 } },
      );
    }
    createdTicketIds.push(child.id);
  }

  const snapshot = await createEpicSnapshot(orgId, {
    boardId: draft.boardId,
    epicTicketId: epicTicket.id,
    draftId: draft.id,
    createdBy: actorId,
    transcript: draft.transcript,
    blueprintTranscript: draft.blueprintTranscript,
    brainstormSummary: draft.brainstormSummary,
    backlog: draft.backlog,
    plannerTranscript: draft.plannerTranscript,
    sprintPlan: draft.sprintPlan,
    planningSprints: draft.planningSprints,
    planningMembers: draft.planningMembers,
    ticketIds: [epicTicket.id, ...createdTicketIds],
  });

  await saveEpicDraft(orgId, { ...draft, phase: "committed" });

  return { epicTicketId: epicTicket.id, createdTicketIds, snapshotId: snapshot.id };
}

// ─── Member Roles ─────────────────────────────────────────────────────────────

interface MemberRoleDoc { _id: string; orgId: string; userId: string; role: OrgMemberRole }

export async function getMemberRoles(
  orgId: string
): Promise<Array<{ userId: string; role: OrgMemberRole }>> {
  const col = await coll<MemberRoleDoc>("memberRoles");
  const docs = await col.find({ orgId }).toArray();
  return docs.map((d) => ({ userId: d.userId, role: OrgMemberRoleSchema.parse(d.role) }));
}

export async function setMemberRole(
  orgId: string, userId: string, role: OrgMemberRole | null
): Promise<boolean> {
  const col = await coll<MemberRoleDoc>("memberRoles");
  if (role === null) {
    await col.deleteOne({ orgId, userId });
  } else {
    await col.updateOne(
      { orgId, userId },
      { $set: { role }, $setOnInsert: { _id: crypto.randomUUID(), orgId, userId } },
      { upsert: true }
    );
  }
  return true;
}
