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
  /** ISO-8601 string. Set when archived; null/absent on active boards. */
  deletedAt: z.string().nullable().optional(),
});

export const BoardColumnSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  boardId: z.string(),
  name: z.string().min(1),
  states: z.array(z.string()),
  color: z.string(),
  order: z.number().int().nonnegative().default(0),
  /** Default false so column docs created before this field still parse. */
  isDone: z.boolean().default(false),
  /** Default false so existing columns are not retroactively protected. */
  protected: z.boolean().default(false),
});

export const LinkKindSchema = z.enum(["blockedBy", "relatedTo", "duplicates"]);

export const TicketLinkSchema = z.object({
  kind: LinkKindSchema,
  targetTicketId: z.string(),
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
  links: z.array(TicketLinkSchema),
  assigneeIds: z.array(z.string()),
  /** Default empty so ticket docs predating multi-sprint membership still parse. */
  sprintIds: z.array(z.string()).default([]),
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
  links: z.array(TicketLinkSchema).optional(),
  assigneeIds: z.array(z.string()).optional(),
  sprintIds: z.array(z.string()).optional(),
  hierarchyType: z.enum(["epic", "story", "task"]).optional(),
  parentTicketId: z.string().nullable().optional(),
  /** Version client last observed — required for optimistic concurrency */
  expectedVersion: z.number().int().nonnegative(),
});

export const OrgMemberRoleSchema = z.enum(["developer", "ux", "tester", "po"]);

export const SprintSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  boardId: z.string(),
  name: z.string().min(1),
  description: z.string().default(""),
  goal: z.string().default(""),
  startDate: z.string(),
  endDate: z.string(),
  capacityPoints: z.number().int().nonnegative(),
  status: z.enum(["planning", "active", "completed"]),
  completedPoints: z.number().int().nonnegative().optional(),
});

export const SprintAssignmentSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  sprintId: z.string(),
  userId: z.string(),
  availableHours: z.number().nonnegative(),
});

export const CreateSprintInputSchema = z.object({
  boardId: z.string(),
  /** Optional — server auto-generates `{boardName} {N}` when omitted. */
  name: z.string().min(1).optional(),
  description: z.string().default(""),
  goal: z.string().default(""),
  startDate: z.string(),
  endDate: z.string(),
  capacityPoints: z.number().int().nonnegative().default(0),
});

export const UpdateSprintInputSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  goal: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  capacityPoints: z.number().int().nonnegative().optional(),
  status: z.enum(["planning", "active", "completed"]).optional(),
});

export const UpsertSprintAssignmentInputSchema = z.object({
  sprintId: z.string(),
  userId: z.string(),
  availableHours: z.number().nonnegative(),
});

export type BoardSchemaType = z.infer<typeof BoardSchema>;
export type BoardColumnSchemaType = z.infer<typeof BoardColumnSchema>;
export type TicketSchemaType = z.infer<typeof TicketSchema>;
export type ReleaseVersionSchemaType = z.infer<typeof ReleaseVersionSchema>;
export type CommentSchemaType = z.infer<typeof CommentSchema>;
export type TicketHistoryEntrySchemaType = z.infer<typeof TicketHistoryEntrySchema>;
export type BoardMemberSchemaType = z.infer<typeof BoardMemberSchema>;
