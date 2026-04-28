/**
 * Per-request DataLoaders that batch and de-duplicate database lookups.
 *
 * Without this, a query like `tickets { linkedTickets { title } }` would issue
 * one DB call per ticket (classic N+1). DataLoader accumulates all the IDs
 * requested within a single tick of the event loop and fires a single batched
 * query.
 *
 * Loaders are scoped per request (created in the GraphQL context factory)
 * so that responses are not cached across users or orgs.
 */
import DataLoader from "dataloader";
import * as repo from "./repository";
import type { Ticket, Comment } from "@/domain/analyst";

export interface RequestLoaders {
  ticketById: DataLoader<string, Ticket | null>;
  commentsByTicketId: DataLoader<string, Comment[]>;
}

export function createRequestLoaders(orgId: string): RequestLoaders {
  return {
    ticketById: new DataLoader<string, Ticket | null>(async (ids) => {
      const tickets = await repo.getTicketsByIds(orgId, ids);
      const byId = new Map(tickets.map((t) => [t.id, t]));
      return ids.map((id) => byId.get(id) ?? null);
    }),

    commentsByTicketId: new DataLoader<string, Comment[]>(async (ticketIds) => {
      const all = await repo.getCommentsByTicketIds(orgId, ticketIds);
      const byTicket = new Map<string, Comment[]>();
      for (const c of all) {
        const list = byTicket.get(c.ticketId) ?? [];
        list.push(c);
        byTicket.set(c.ticketId, list);
      }
      return ticketIds.map((id) => byTicket.get(id) ?? []);
    }),
  };
}
