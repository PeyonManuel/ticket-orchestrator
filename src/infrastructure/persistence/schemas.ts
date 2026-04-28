import { z } from "zod";

const StoryPointsSchema = z.union([
  z.literal(1), z.literal(2), z.literal(3),
  z.literal(5), z.literal(8), z.literal(13),
]);

export const BoardSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string().min(1),
  type: z.enum(["scrum", "kanban", "task"]),
});

export const BoardColumnSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  boardId: z.string(),
  name: z.string().min(1),
  states: z.array(z.string()),
  color: z.string(),
  order: z.number().int().nonnegative().default(0),
});

export const TicketSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  ticketNumber: z.string(),
  boardId: z.string(),
  columnId: z.string(),
  hierarchyType: z.enum(["epic", "story", "task"]),
  parentTicketId: z.string().nullable(),
  title: z.string().min(1),
  description: z.string(),
  label: z.string(),
  fixVersion: z.string(),
  storyPoints: StoryPointsSchema,
  workflowState: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  linkedTicketIds: z.array(z.string()),
  assigneeIds: z.array(z.string()),
  version: z.number().int().nonnegative(),
});

export const ReleaseVersionSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  boardId: z.string(),
  name: z.string().min(1),
  releaseDate: z.string(),
});

export const BoardMemberSchema = z.object({
  orgId: z.string(),
  boardId: z.string(),
  userId: z.string(),
  role: z.enum(["member", "admin"]),
  addedAt: z.string(),
});

export const CommentSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  ticketId: z.string(),
  authorId: z.string(),
  body: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const HistoryEntryKindSchema = z.enum([
  "created",
  "updated",
  "assignee_added",
  "assignee_removed",
  "commented",
  "comment_edited",
  "comment_deleted",
]);

export const HistoryFieldChangeSchema = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
});

export const TicketHistoryEntrySchema = z.object({
  id: z.string(),
  orgId: z.string(),
  ticketId: z.string(),
  actorId: z.string(),
  timestamp: z.string(),
  kind: HistoryEntryKindSchema,
  changes: z.array(HistoryFieldChangeSchema),
});

export const CreateTicketInputSchema = z.object({
  boardId: z.string(),
  columnId: z.string(),
  hierarchyType: z.enum(["epic", "story", "task"]),
  parentTicketId: z.string().nullable(),
  title: z.string().min(1),
  description: z.string(),
  label: z.string(),
  fixVersion: z.string(),
  workflowState: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  storyPoints: StoryPointsSchema,
  assigneeIds: z.array(z.string()).optional(),
});

export const UpdateTicketInputSchema = z.object({
  columnId: z.string().optional(),
  workflowState: z.string().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  label: z.string().optional(),
  fixVersion: z.string().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  storyPoints: StoryPointsSchema.optional(),
  linkedTicketIds: z.array(z.string()).optional(),
  assigneeIds: z.array(z.string()).optional(),
  /** Version client last observed — required for optimistic concurrency */
  expectedVersion: z.number().int().nonnegative(),
});

export type BoardSchemaType = z.infer<typeof BoardSchema>;
export type BoardColumnSchemaType = z.infer<typeof BoardColumnSchema>;
export type TicketSchemaType = z.infer<typeof TicketSchema>;
export type ReleaseVersionSchemaType = z.infer<typeof ReleaseVersionSchema>;
export type CommentSchemaType = z.infer<typeof CommentSchema>;
export type TicketHistoryEntrySchemaType = z.infer<typeof TicketHistoryEntrySchema>;
export type BoardMemberSchemaType = z.infer<typeof BoardMemberSchema>;
