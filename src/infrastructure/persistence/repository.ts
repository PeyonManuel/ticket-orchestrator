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
} from "@/domain/analyst";
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

interface BoardDoc { _id: string; orgId: string; name: string; type: "scrum" | "kanban" | "task" }
interface ColumnDoc {
  _id: string; orgId: string; boardId: string; name: string;
  states: string[]; color: string; order: number;
}
interface TicketDoc {
  _id: string; orgId: string; ticketNumber: string; boardId: string; columnId: string;
  hierarchyType: "epic" | "story" | "task"; parentTicketId: string | null;
  title: string; description: string; label: string; fixVersion: string;
  storyPoints: 1 | 2 | 3 | 5 | 8 | 13; workflowState: string;
  priority: "low" | "medium" | "high"; linkedTicketIds: string[];
  assigneeIds: string[]; version: number;
}
interface VersionDoc { _id: string; orgId: string; boardId: string; name: string; releaseDate: string }
interface BoardMemberDoc { _id: string; orgId: string; boardId: string; userId: string; role: "member" | "admin"; addedAt: string }
interface CommentDoc { _id: string; orgId: string; ticketId: string; authorId: string; body: string; createdAt: string; updatedAt: string }
interface HistoryDoc {
  _id: string; orgId: string; ticketId: string; actorId: string;
  timestamp: string; kind: HistoryEntryKind; changes: HistoryFieldChange[];
}

// ─── Boards ──────────────────────────────────────────────────────────────────

export async function getBoards(orgId: string): Promise<Board[]> {
  const col = await coll<BoardDoc>("boards");
  const docs = await col.find({ orgId }).toArray();
  return docs.map((d) =>
    BoardSchema.parse({ id: d._id, orgId: d.orgId, name: d.name, type: d.type })
  );
}

export async function createBoard(
  orgId: string,
  input: Pick<Board, "name" | "type">
): Promise<Board> {
  const col = await coll<BoardDoc>("boards");
  const id = crypto.randomUUID();
  await col.insertOne({ _id: id, orgId, name: input.name, type: input.type });
  return BoardSchema.parse({ id, orgId, name: input.name, type: input.type });
}

// ─── Columns ─────────────────────────────────────────────────────────────────

export async function getBoardColumns(orgId: string, boardId: string): Promise<BoardColumn[]> {
  const col = await coll<ColumnDoc>("columns");
  const docs = await col.find({ orgId, boardId }).sort({ order: 1 }).toArray();
  return docs.map((d) =>
    BoardColumnSchema.parse({
      id: d._id,
      orgId: d.orgId,
      boardId: d.boardId,
      name: d.name,
      states: d.states,
      color: d.color,
      order: d.order ?? 0,
    })
  );
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

export async function updateColumn(
  orgId: string,
  id: string,
  patch: Partial<Pick<BoardColumn, "name" | "states" | "color">>
): Promise<BoardColumn | null> {
  const col = await coll<ColumnDoc>("columns");
  const result = await col.findOneAndUpdate(
    { _id: id, orgId },
    { $set: patch },
    { returnDocument: "after" }
  );
  if (!result) return null;
  return BoardColumnSchema.parse({
    id: result._id,
    orgId: result.orgId,
    boardId: result.boardId,
    name: result.name,
    states: result.states,
    color: result.color,
    order: result.order ?? 0,
  });
}

export async function deleteColumn(orgId: string, id: string): Promise<boolean> {
  const col = await coll<ColumnDoc>("columns");
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

function parseTicket(d: Record<string, unknown>): Ticket {
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
    linkedTicketIds: d.linkedTicketIds ?? [],
    assigneeIds: d.assigneeIds ?? [],
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

export async function createTicket(
  orgId: string,
  actorId: string,
  input: CreateTicketInput,
  ticketNumber: string
): Promise<Ticket> {
  const col = await coll<TicketDoc>("tickets");
  const id = crypto.randomUUID();
  const doc = {
    _id: id,
    orgId,
    ticketNumber,
    ...input,
    parentTicketId: input.parentTicketId ?? null,
    linkedTicketIds: [],
    assigneeIds: input.assigneeIds ?? [],
    version: 0,
  };
  await col.insertOne(doc);
  await recordHistory(orgId, id, actorId, "created", []);
  return parseTicket(doc);
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
        linkedTicketIds: t.linkedTicketIds,
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
