import type { APIRequestContext } from "@playwright/test";

const SEED_SECRET = process.env.SEED_SECRET;

/**
 * Hits the dev-only seed endpoint that provisions a board with 6 completed
 * sprints + done-column tickets + role assignments. Idempotent on the board
 * name (`"{boardName} (Seeded)"`).
 *
 * Requires `SEED_SECRET` to match the server's env var. The endpoint must
 * be enabled on the dev server hosting the E2E run.
 */
export async function seedFixtureBoard(
  request: APIRequestContext,
  opts: { baseURL: string; boardName?: string } = { baseURL: "" },
): Promise<{ boardId: string; boardName: string }> {
  if (!SEED_SECRET) {
    throw new Error("SEED_SECRET env var not set — cannot seed fixtures.");
  }
  const response = await request.post(
    `${opts.baseURL}/api/internal/seed-orchestrator-fixtures`,
    {
      headers: { "X-Seed-Secret": SEED_SECRET },
      data: { boardName: opts.boardName ?? "E2E Demo" },
    },
  );
  if (!response.ok()) {
    throw new Error(
      `Seed endpoint failed (${response.status()}): ${await response.text()}`,
    );
  }
  return (await response.json()) as { boardId: string; boardName: string };
}
