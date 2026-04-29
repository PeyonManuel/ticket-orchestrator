/**
 * LEGACY — Preserved for reference only.
 *
 * This was the localStorage snapshot layer for the now-removed
 * `analystWorkspaceMachine`. The application now persists via MongoDB through
 * GraphQL mutations. No code imports this file anymore.
 *
 * Kept for reference if we ever want to add an offline-first cache layer
 * on top of Apollo (e.g. apollo3-cache-persist).
 */
import type { AnalystMachineContext } from "@/domain/analyst";

const STORAGE_KEY = "orion-workspace-v1";

type PersistedSnapshot = Pick<
  AnalystMachineContext,
  | "boards"
  | "boardColumns"
  | "tickets"
  | "activeBoardId"
  | "releaseVersions"
  | "currentUserRole"
  | "labels"
>;

export function loadWorkspaceSnapshot(): Partial<AnalystMachineContext> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AnalystMachineContext>;
  } catch {
    return {};
  }
}

export function saveWorkspaceSnapshot(context: AnalystMachineContext): void {
  if (typeof window === "undefined") return;
  try {
    const snapshot: PersistedSnapshot = {
      boards: context.boards,
      boardColumns: context.boardColumns,
      tickets: context.tickets,
      activeBoardId: context.activeBoardId,
      releaseVersions: context.releaseVersions,
      currentUserRole: context.currentUserRole,
      labels: context.labels,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore storage errors (quota, private mode, etc.)
  }
}
