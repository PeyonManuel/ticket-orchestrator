/**
 * Scheduled cleanup endpoint: hard-deletes any board that has been
 * soft-archived for more than `RETENTION_DAYS` (default 30) and cascades all
 * owned children (columns, tickets, comments, history, versions).
 *
 * Trigger: AWS EventBridge Scheduler → API Destination (HTTPS) hits this URL
 * once a day. See `docs/eventbridge-cleanup-setup.md`.
 *
 * Auth: shared secret in the `X-Cleanup-Secret` header. Set
 * `CLEANUP_SECRET` in env (server-only — do NOT prefix with NEXT_PUBLIC_).
 * Plain header auth keeps the EventBridge wiring trivial; rotate on schedule.
 *
 * Idempotent: safe to re-run. If a previous run died midway through a board's
 * cascade, the next run picks up the orphans because each delete is scoped by
 * `boardId`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { findBoardsToHardDelete, purgeBoard } from "@/infrastructure/persistence/repository";
import { logger } from "@/infrastructure/observability/logger";

const RETENTION_DAYS = 30;

export async function POST(req: NextRequest) {
  const expected = process.env.CLEANUP_SECRET;
  if (!expected) {
    logger.error("cleanup", "CLEANUP_SECRET not configured — refusing to run");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const provided = req.headers.get("x-cleanup-secret");
  if (provided !== expected) {
    logger.warn("cleanup", "rejected request with bad/missing secret");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const candidates = await findBoardsToHardDelete(RETENTION_DAYS);
  logger.info("cleanup", `found ${candidates.length} board(s) past retention`, {
    retentionDays: RETENTION_DAYS,
  });

  const results: Array<{ orgId: string; boardId: string; ok: boolean; counts?: unknown; error?: string }> = [];
  for (const { orgId, boardId } of candidates) {
    try {
      const counts = await purgeBoard(orgId, boardId);
      logger.info("cleanup", "purged board", { orgId, boardId, counts });
      results.push({ orgId, boardId, ok: true, counts });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("cleanup", "purge failed", { orgId, boardId, err: msg });
      results.push({ orgId, boardId, ok: false, error: msg });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return NextResponse.json({
    retentionDays: RETENTION_DAYS,
    candidatesFound: candidates.length,
    purged: okCount,
    failed: candidates.length - okCount,
    results,
  });
}

// Block accidental browser hits.
export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
