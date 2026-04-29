import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import * as repo from "@/infrastructure/persistence/repository";

interface PageProps {
  params: Promise<{ ticketNumber: string }>;
}

/**
 * Dedicated ticket route — `/tickets/OR-42`.
 *
 * Looks up the ticket by its human-readable number using the unique
 * `{ orgId, ticketNumber }` index (O(1)) and redirects to the board view
 * with the ticket modal pre-opened. This is what `getTicketShareUrl` points
 * to so shared links resolve without requiring the recipient to have the
 * correct board pre-loaded.
 *
 * The redirect (vs. rendering inline) keeps a single source of truth for
 * the ticket UI in the board's TicketModal, and ensures the URL the user
 * lands on also reflects the active board.
 */
export default async function TicketPage({ params }: PageProps) {
  const { ticketNumber } = await params;
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect(`/login?redirect=/tickets/${ticketNumber}`);
  }
  if (!orgId) {
    redirect("/onboarding");
  }

  const ticket = await repo.getTicketByNumber(orgId, ticketNumber);
  if (!ticket) {
    redirect("/?error=ticket-not-found");
  }

  // Forward to the board with the ticket modal pre-opened. The deep-link
  // useEffect inside BoardContext picks up `?ticket=...&modal=ticket` and
  // auto-selects the correct board via the loaded ticket data.
  redirect(`/?board=${ticket.boardId}&modal=ticket&ticket=${ticket.ticketNumber}`);
}
