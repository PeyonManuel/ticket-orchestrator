# Scheduled Board Purge — AWS EventBridge → /api/internal/cleanup-deleted-boards

The endpoint at `POST /api/internal/cleanup-deleted-boards` hard-deletes any
board that has been soft-archived for more than **30 days**, cascading every
ticket, column, comment, history row, and release version owned by it.

It is meant to be called once a day by **AWS EventBridge Scheduler** via an
**API destination** (HTTPS). Auth is a shared secret in the `X-Cleanup-Secret`
header — set `CLEANUP_SECRET` in the deployment environment to a long random
string and put the same value in the EventBridge connection.

## Environment variables

| Var               | Where  | Purpose                                                              |
|-------------------|--------|----------------------------------------------------------------------|
| `CLEANUP_SECRET`  | server | Shared secret. **Do NOT prefix with `NEXT_PUBLIC_`** (server-only).  |

Generate one:

```bash
openssl rand -hex 32
```

## EventBridge wiring (one-time setup)

1. **Connection** (EventBridge → API destinations → Connections → Create)
   - Authorization type: **API Key**
   - API key name: `X-Cleanup-Secret`
   - API key value: `<CLEANUP_SECRET>`

2. **API destination** (Create destination)
   - HTTP endpoint: `https://<your-domain>/api/internal/cleanup-deleted-boards`
   - HTTP method: `POST`
   - Connection: the one above

3. **Schedule** (EventBridge Scheduler → Schedules → Create schedule)
   - Schedule pattern: rate-based, **every 24 hours** (or cron `0 3 * * ? *` for 03:00 UTC).
   - Target: the API destination above.
   - Payload: `{}` (the endpoint reads no body).
   - Retry policy: keep defaults — the endpoint is idempotent.

## Local / preview environments

Run manually any time:

```bash
curl -X POST http://localhost:3001/api/internal/cleanup-deleted-boards \
  -H "X-Cleanup-Secret: $CLEANUP_SECRET"
```

Returns a JSON summary of how many boards were purged, plus per-board cascade counts.

## Why a cron over a MongoDB TTL index?

A TTL index on `boards.deletedAt` would only auto-delete the board document, leaving columns/tickets/comments/history orphaned. A scheduled cascade keeps the children consistent and emits a single audit log per purge.
