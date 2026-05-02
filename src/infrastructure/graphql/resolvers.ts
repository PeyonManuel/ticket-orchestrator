import { clerkClient } from "@clerk/nextjs/server";
import * as repo from "@/infrastructure/persistence/repository";
import type { RequestLoaders } from "@/infrastructure/persistence/loaders";
import type { Ticket, BoardMember } from "@/domain/analyst";
import { logger } from "@/infrastructure/observability/logger";

export interface GraphQLContext {
  userId: string | null;
  orgId: string | null;
  isAdmin: boolean;
  loaders: RequestLoaders | null;
}

interface AuthedContext extends GraphQLContext {
  userId: string;
  orgId: string;
  loaders: RequestLoaders;
}

function requireAuth(ctx: GraphQLContext): asserts ctx is AuthedContext {
  if (!ctx.userId || !ctx.orgId || !ctx.loaders) {
    throw new Error("Unauthorized: missing user or active organization");
  }
}

function requireAdmin(ctx: GraphQLContext): asserts ctx is AuthedContext {
  requireAuth(ctx);
  if (!ctx.isAdmin) throw new Error("Forbidden: admin only");
}

// Cursor encoding for ticket pagination — opaque base64(`<id>`).
function encodeCursor(id: string): string {
  return Buffer.from(id, "utf8").toString("base64url");
}

export const resolvers = {
  Query: {
    boards: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.getBoards(ctx.orgId);
    },
    archivedBoards: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return repo.getArchivedBoards(ctx.orgId);
    },
    boardColumns: (_p: unknown, { boardId }: { boardId: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.getBoardColumns(ctx.orgId, boardId);
    },
    tickets: async (
      _p: unknown,
      { boardId, first, after }: { boardId: string; first: number; after: string | null },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      const all = await repo.getTickets(ctx.orgId, boardId);
      // Sort by ticket id for stable cursor order
      const sorted = all.slice().sort((a, b) => a.id.localeCompare(b.id));
      const startIndex = after
        ? sorted.findIndex((t) => encodeCursor(t.id) === after) + 1
        : 0;
      const slice = sorted.slice(startIndex, startIndex + first);
      const hasNextPage = startIndex + first < sorted.length;
      return {
        edges: slice.map((node) => ({ cursor: encodeCursor(node.id), node })),
        pageInfo: {
          endCursor: slice.length > 0 ? encodeCursor(slice[slice.length - 1].id) : null,
          hasNextPage,
        },
      };
    },
    ticket: (_p: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return ctx.loaders.ticketById.load(id);
    },
    ticketByNumber: (
      _p: unknown,
      { ticketNumber }: { ticketNumber: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return repo.getTicketByNumber(ctx.orgId, ticketNumber);
    },
    ticketHistory: (_p: unknown, { ticketId }: { ticketId: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.getTicketHistory(ctx.orgId, ticketId);
    },
    releaseVersions: (_p: unknown, { boardId }: { boardId: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.getReleaseVersions(ctx.orgId, boardId);
    },
    boardMembers: (_p: unknown, { boardId }: { boardId: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.getBoardMembers(ctx.orgId, boardId);
    },
    labels: (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.getLabels(ctx.orgId);
    },
    orgMembers: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      const client = await clerkClient();
      const { data } = await client.organizations.getOrganizationMembershipList({
        organizationId: ctx.orgId,
        limit: 100,
      });
      return data
        .map((m) => {
          const u = m.publicUserData;
          if (!u) return null;
          const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ").trim()
            || u.identifier
            || u.userId;
          return {
            userId: u.userId,
            fullName,
            imageUrl: u.imageUrl ?? null,
            emailAddress: u.identifier ?? null,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m !== null);
    },
  },

  Ticket: {
    comments: (parent: Ticket, _a: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return ctx.loaders.commentsByTicketId.load(parent.id);
    },
    history: (parent: Ticket, _a: unknown, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.getTicketHistory(ctx.orgId, parent.id);
    },
  },

  UpdateTicketResult: {
    __resolveType(obj: unknown) {
      if (obj && typeof obj === "object" && "conflictedFields" in obj) return "ConflictError";
      return "Ticket";
    },
  },

  Mutation: {
    createBoard: async (
      _p: unknown,
      { input }: { input: { name: string; type?: "scrum" | "kanban" | "task" } },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      const board = await repo.createBoard(ctx.orgId, { name: input.name, type: input.type ?? "scrum" });
      const palette = ["#4f46e5", "#0ea5e9", "#22c55e"];
      const defaults = [
        { name: "To Do", states: ["todo"], color: palette[0] },
        { name: "In Progress", states: ["inProgress"], color: palette[1] },
        { name: "Done", states: ["done"], color: palette[2] },
      ];
      for (let i = 0; i < defaults.length; i++) {
        await repo.createColumn(ctx.orgId, { boardId: board.id, ...defaults[i], order: i });
      }
      return board;
    },
    archiveBoard: async (_p: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const board = await repo.archiveBoard(ctx.orgId, id);
      if (!board) throw new Error("Board not found or already archived");
      logger.info("board", "archived", { orgId: ctx.orgId, boardId: id });
      return board;
    },
    restoreBoard: async (_p: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const board = await repo.restoreBoard(ctx.orgId, id);
      if (!board) throw new Error("Board not found or not archived");
      logger.info("board", "restored", { orgId: ctx.orgId, boardId: id });
      return board;
    },
    purgeBoard: async (_p: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      const counts = await repo.purgeBoard(ctx.orgId, id);
      logger.warn("board", "purged (hard delete)", { orgId: ctx.orgId, boardId: id, counts });
      return counts.board > 0;
    },
    createColumn: async (
      _p: unknown,
      { input }: { input: { boardId: string; name: string; states: string[]; color: string } },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      const existing = await repo.getBoardColumns(ctx.orgId, input.boardId);
      return repo.createColumn(ctx.orgId, { ...input, order: existing.length });
    },
    updateColumn: (
      _p: unknown,
      { id, input }: { id: string; input: { name?: string; states?: string[]; color?: string } },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return repo.updateColumn(ctx.orgId, id, input);
    },
    deleteColumn: (_p: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return repo.deleteColumn(ctx.orgId, id);
    },
    reorderColumns: async (
      _p: unknown,
      { boardId, orderedIds }: { boardId: string; orderedIds: string[] },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      await repo.reorderColumns(ctx.orgId, boardId, orderedIds);
      return true;
    },

    createTicket: (
      _p: unknown,
      { input }: { input: Parameters<typeof repo.createTicket>[2] },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return repo.createTicket(ctx.orgId, ctx.userId, input);
    },
    updateTicket: async (
      _p: unknown,
      { id, input }: { id: string; input: Parameters<typeof repo.updateTicket>[3] },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      const result = await repo.updateTicket(ctx.orgId, ctx.userId, id, input);
      if (result.kind === "ok") return result.ticket;
      return {
        currentState: result.currentState,
        conflictedFields: result.conflictedFields,
        message:
          "This ticket was modified by someone else after you opened it. Review the changes and choose how to proceed.",
      };
    },

    addComment: (
      _p: unknown,
      { ticketId, body }: { ticketId: string; body: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return repo.createComment(ctx.orgId, ctx.userId, ticketId, body);
    },
    editComment: (
      _p: unknown,
      { commentId, body }: { commentId: string; body: string },
      ctx: GraphQLContext
    ) => {
      requireAuth(ctx);
      return repo.updateComment(ctx.orgId, ctx.userId, commentId, body);
    },
    deleteComment: (_p: unknown, { commentId }: { commentId: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.deleteComment(ctx.orgId, ctx.userId, commentId);
    },

    addBoardMember: (
      _p: unknown,
      { boardId, userId, role }: { boardId: string; userId: string; role: BoardMember["role"] },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return repo.addBoardMember(ctx.orgId, boardId, userId, role);
    },
    removeBoardMember: (
      _p: unknown,
      { boardId, userId }: { boardId: string; userId: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return repo.removeBoardMember(ctx.orgId, boardId, userId);
    },

    createVersion: (
      _p: unknown,
      { boardId, name, releaseDate }: { boardId: string; name: string; releaseDate: string },
      ctx: GraphQLContext
    ) => {
      requireAdmin(ctx);
      return repo.createVersion(ctx.orgId, boardId, name, releaseDate);
    },
    deleteVersion: (_p: unknown, { id }: { id: string }, ctx: GraphQLContext) => {
      requireAdmin(ctx);
      return repo.deleteVersion(ctx.orgId, id);
    },

    addLabel: (_p: unknown, { label }: { label: string }, ctx: GraphQLContext) => {
      requireAuth(ctx);
      return repo.addLabel(ctx.orgId, label);
    },
  },
};
