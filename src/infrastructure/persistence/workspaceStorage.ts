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
