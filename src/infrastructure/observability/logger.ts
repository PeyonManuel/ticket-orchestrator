/**
 * Orion centralized logger.
 *
 * Toggle: set `NEXT_PUBLIC_DEV_LOGS=true` in your env. The `NEXT_PUBLIC_` prefix
 * is required so Next.js inlines the value into the client bundle as well as
 * exposing it server-side. With the flag off, debug/info/warn become no-ops.
 * `error` always emits, regardless of the flag.
 *
 * Browser output is grouped per-event (`console.groupCollapsed`) so a busy app
 * stays readable — click a row to expand the payload. Server output is a
 * single-line structured JSON record so it pipes cleanly into log shippers
 * (Datadog/Logtail/CloudWatch) when we put one in front later.
 *
 * This module is the single seam for observability in the app — swap in pino
 * or a hosted shipper here without touching call sites.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogScope =
  | "auth"        // Clerk session, org resolution, redirects
  | "graphql"     // server-side resolver invocations + timings
  | "apollo"      // client-side queries/mutations + cache writes
  | "board"       // board CRUD (create / archive / restore / purge)
  | "column"      // column CRUD
  | "ticket"      // ticket CRUD + conflict resolution
  | "comment"     // comment CRUD
  | "label"       // label CRUD
  | "version"     // release version CRUD
  | "ai"          // AI orchestrator state-machine transitions + node IO
  | "cleanup"     // scheduled purges (EventBridge → /api/internal/*)
  | "infra";      // mongo connect/index, etc.

const SCOPE_COLOR: Record<LogScope, string> = {
  auth:    "#a78bfa",
  graphql: "#22d3ee",
  apollo:  "#34d399",
  board:   "#f59e0b",
  column:  "#fbbf24",
  ticket:  "#60a5fa",
  comment: "#94a3b8",
  label:   "#c084fc",
  version: "#f472b6",
  ai:      "#f87171",
  cleanup: "#fb923c",
  infra:   "#64748b",
};

const LEVEL_GLYPH: Record<LogLevel, string> = {
  debug: "·",
  info:  "›",
  warn:  "⚠",
  error: "✖",
};

const isBrowser = typeof window !== "undefined";

function devLogsEnabled(): boolean {
  // NEXT_PUBLIC_ vars are inlined at build time on the client and read from
  // process.env on the server — same expression works in both environments.
  return process.env.NEXT_PUBLIC_DEV_LOGS === "true";
}

function shouldEmit(level: LogLevel): boolean {
  if (level === "error") return true; // errors always log
  return devLogsEnabled();
}

function emitBrowser(level: LogLevel, scope: LogScope, msg: string, data?: unknown) {
  const color = SCOPE_COLOR[scope];
  const tag = `%c[${scope.toUpperCase()}]%c ${LEVEL_GLYPH[level]} ${msg}`;
  const tagStyle = `color:${color};font-weight:600`;
  const msgStyle = level === "error"
    ? "color:#fca5a5"
    : level === "warn"
    ? "color:#fcd34d"
    : "color:inherit";

  if (data === undefined) {
    // No payload — just print the line, no group needed.
    if (level === "error") console.error(tag, tagStyle, msgStyle);
    else if (level === "warn") console.warn(tag, tagStyle, msgStyle);
    else console.log(tag, tagStyle, msgStyle);
    return;
  }

  // Has payload — open a collapsed group so the page log stays scannable.
  console.groupCollapsed(tag, tagStyle, msgStyle);
  if (level === "error") console.error(data);
  else console.log(data);
  console.groupEnd();
}

function emitServer(level: LogLevel, scope: LogScope, msg: string, data?: unknown) {
  const record = {
    ts: new Date().toISOString(),
    level,
    scope,
    msg,
    ...(data !== undefined ? { data } : {}),
  };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function emit(level: LogLevel, scope: LogScope, msg: string, data?: unknown) {
  if (!shouldEmit(level)) return;
  if (isBrowser) emitBrowser(level, scope, msg, data);
  else emitServer(level, scope, msg, data);
}

export const logger = {
  debug: (scope: LogScope, msg: string, data?: unknown) => emit("debug", scope, msg, data),
  info:  (scope: LogScope, msg: string, data?: unknown) => emit("info",  scope, msg, data),
  warn:  (scope: LogScope, msg: string, data?: unknown) => emit("warn",  scope, msg, data),
  error: (scope: LogScope, msg: string, data?: unknown) => emit("error", scope, msg, data),

  /**
   * Time an async operation and emit a single info log on success or error on
   * failure. Returns the wrapped promise's result. Use for resolvers, mutations,
   * and any awaited unit of work whose duration matters.
   */
  async time<T>(scope: LogScope, label: string, fn: () => Promise<T>, extra?: Record<string, unknown>): Promise<T> {
    const start = performance.now();
    try {
      const out = await fn();
      const ms = Math.round(performance.now() - start);
      emit("info", scope, `${label} ✓ ${ms}ms`, extra);
      return out;
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      emit("error", scope, `${label} ✖ ${ms}ms`, { err: err instanceof Error ? err.message : err, ...extra });
      throw err;
    }
  },
};

export const loggerEnabled = devLogsEnabled;
