"use client";

import React, { useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@apollo/client/react";
import { GET_EPIC_DRAFT } from "@/infrastructure/graphql/operations";
import type {
  EpicDraft,
  MemberSnapshot,
  SprintSnapshot,
  TeamMemberCapacity,
} from "@/domain/orchestrator/types";
import { draftDisplayTitle } from "@/domain/orchestrator/types";
import { computeCapacities } from "@/domain/orchestrator/policies/capacityPolicy";
import { useOrchestrator } from "./useOrchestrator";
import { PhaseHeader } from "./PhaseHeader";
import { Phase1Brainstorm } from "./Phase1Brainstorm";
import { Phase2BulkList } from "./Phase2BulkList";
import { Phase3Wizard } from "./Phase3Wizard";
import { Phase4SprintPlan } from "./Phase4SprintPlan";
import { useBoardData } from "@/presentation/board/BoardContext";

interface Props {
  draftId: string;
  onClose: () => void;
  onBackToPicker: () => void;
}

export function OrchestratorSession({ draftId, onClose, onBackToPicker }: Props) {
  const { data, loading, error } = useQuery<{ epicDraft: EpicDraft | null }>(
    GET_EPIC_DRAFT,
    {
      variables: { id: draftId },
      fetchPolicy: "network-only",
    },
  );

  if (loading || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-zinc-400">Loading draft…</p>
      </div>
    );
  }
  if (error || !data.epicDraft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-zinc-500">Couldn&apos;t load this draft.</p>
        <button
          onClick={onBackToPicker}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          ← Back to drafts
        </button>
      </div>
    );
  }

  return (
    <ActiveSession
      initialDraft={data.epicDraft}
      onClose={onClose}
      onBackToPicker={onBackToPicker}
    />
  );
}

function ActiveSession({
  initialDraft,
  onClose,
  onBackToPicker,
}: {
  initialDraft: EpicDraft;
  onClose: () => void;
  onBackToPicker: () => void;
}) {
  const { sprints, orgMembers, allTickets, boardColumns } = useBoardData();

  /**
   * Seed capacities at machine init for resumed Phase 4+ drafts so the planner
   * chat actor has real velocity from the first user message. For fresh Phase 1
   * drafts these are unused until `ADVANCE_TO_PLANNING` re-dispatches them.
   */
  const initialCapacities = useMemo<TeamMemberCapacity[]>(() => {
    const phase = initialDraft.phase;
    const needsCapacities =
      phase === "phase4SprintPlanning" ||
      phase === "committing" ||
      phase === "committed";
    if (!needsCapacities) return [];
    if (initialDraft.planningMembers.length === 0) return [];
    return computeCapacities({
      members: initialDraft.planningMembers,
      sprints,
      tickets: allTickets,
      columns: boardColumns,
    });
    // initialDraft is captured once; subsequent capacity refreshes flow through
    // REFRESH_CAPACITIES below as sprints/tickets/columns change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { state, send, flush, forceFlush, commitDraft, draft, error, saveStatus } =
    useOrchestrator(initialDraft, initialCapacities);
  const saving = saveStatus !== "idle";

  const phase = draft.phase;
  const value = state.value as Record<string, unknown>;
  const workflow = (value.workflow ?? {}) as string | Record<string, unknown>;

  const isPhase1Thinking = useMemo(
    () => state.matches({ workflow: { phase1Brainstorming: "awaitingAnalyst" } }),
    [state],
  );
  const isPhase2Generating = useMemo(
    () => state.matches({ workflow: { phase2Structuring: "generatingBacklog" } }),
    [state],
  );
  const isAwaitingBlueprintReply = useMemo(
    () => state.matches({ workflow: { phase2Structuring: "awaitingBlueprintReply" } }),
    [state],
  );
  const isAwaitingRefinementReply = useMemo(
    () => state.matches({ workflow: { phase3Refining: "awaitingRefinementReply" } }),
    [state],
  );
  const isPhase3Analyzing = useMemo(
    () => state.matches({ workflow: { phase3Refining: "refiningTicket" } }),
    [state],
  );
  const atSummary = useMemo(
    () => state.matches({ workflow: { phase3Refining: "readyToCommit" } }),
    [state],
  );
  const isPhase4Generating = useMemo(
    () => state.matches({ workflow: { phase4SprintPlanning: "generatingPlan" } }),
    [state],
  );
  const isAwaitingPlannerReply = useMemo(
    () => state.matches({ workflow: { phase4SprintPlanning: "awaitingPlannerReply" } }),
    [state],
  );

  const [isCommitting, setIsCommitting] = React.useState(false);
  const [commitError, setCommitError] = React.useState<string | null>(null);

  const handleCommit = async () => {
    setIsCommitting(true);
    setCommitError(null);
    try {
      // Force-flush BEFORE server reads the draft — throws on failure so a
      // save error surfaces as a commit error rather than silently racing.
      await forceFlush();
      await commitDraft();
      // Transition the machine only after the server commit succeeds.
      // committing → committed via two synchronous sends.
      const now = new Date().toISOString();
      send({ type: "COMMIT_EPIC", now });
      send({ type: "COMMIT_EPIC", now });
      onClose();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : "Commit failed");
      setIsCommitting(false);
    }
  };

  const handleAdvanceToPlan = () => {
    const sprintSnapshots: SprintSnapshot[] = sprints
      .filter((s) => s.status !== "completed")
      .map((s) => ({
        id: s.id,
        name: s.name,
        startDate: s.startDate,
        endDate: s.endDate,
        capacityPoints: s.capacityPoints,
        status: s.status,
      }));

    const memberSnapshots: MemberSnapshot[] = orgMembers
      .filter((m) => m.role != null)
      .map((m) => ({
        userId: m.userId,
        fullName: m.fullName ?? m.emailAddress ?? m.userId,
        role: m.role as MemberSnapshot["role"],
      }));

    const capacities = computeCapacities({
      members: memberSnapshots,
      sprints,
      tickets: allTickets,
      columns: boardColumns,
    });

    send({
      type: "ADVANCE_TO_PLANNING",
      now: new Date().toISOString(),
      sprints: sprintSnapshots,
      members: memberSnapshots,
      capacities,
    });
  };

  /**
   * Keep machine context capacities in sync with the live board: if a sprint
   * completes or a ticket moves to Done while the user is in Phase 4, the
   * next planner chat reply should reflect updated velocity.
   */
  useEffect(() => {
    if (draft.planningMembers.length === 0) return;
    if (
      draft.phase !== "phase4SprintPlanning" &&
      draft.phase !== "committing" &&
      draft.phase !== "committed"
    ) {
      return;
    }
    const refreshed = computeCapacities({
      members: draft.planningMembers,
      sprints,
      tickets: allTickets,
      columns: boardColumns,
    });
    send({ type: "REFRESH_CAPACITIES", capacities: refreshed });
  }, [draft.phase, draft.planningMembers, sprints, allTickets, boardColumns, send]);

  const handleAbandon = async () => {
    if (!confirm("Abandon this draft? It will be removed from your active drafts.")) return;
    send({ type: "ABANDON_DRAFT", now: new Date().toISOString() });
    await flush();
    onBackToPicker();
  };

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-zinc-950">
      <PhaseHeader
        phase={phase}
        title={draftDisplayTitle(draft)}
        saving={saving}
        onClose={onClose}
        onAbandon={handleAbandon}
      />

      {(error || commitError) && (
        <div className="px-6 pt-3">
          <div className="max-w-3xl mx-auto rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 px-4 py-2.5 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between">
            <span>{commitError ?? error}</span>
            {error && !commitError && (
              <button
                onClick={() => send({ type: "RETRY", now: new Date().toISOString() })}
                className="font-medium hover:underline"
              >
                Retry
              </button>
            )}
            {commitError && (
              <button
                onClick={() => setCommitError(null)}
                className="font-medium hover:underline"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        <AnimatePresence mode="sync" initial={false}>
          {typeof workflow === "object" && "phase1Brainstorming" in workflow && (
            <PhasePane key="p1">
              <Phase1Brainstorm
                draft={draft}
                isThinking={isPhase1Thinking}
                canAdvance={draft.brainstormSummary !== null}
                send={send}
              />
            </PhasePane>
          )}
          {typeof workflow === "object" && "phase2Structuring" in workflow && (
            <PhasePane key="p2">
              <Phase2BulkList
                draft={draft}
                isGenerating={isPhase2Generating}
                isAwaitingBlueprintReply={isAwaitingBlueprintReply}
                aiMode={state.context.aiMode}
                aiTouchedTicketIds={state.context.aiTouchedTicketIds}
                pendingBlueprintMutations={state.context.pendingBlueprintMutations}
                send={send}
              />
            </PhasePane>
          )}
          {typeof workflow === "object" && "phase3Refining" in workflow && (
            <PhasePane key="p3">
              <Phase3Wizard
                draft={draft}
                isAnalyzing={isPhase3Analyzing}
                isAwaitingRefinementReply={isAwaitingRefinementReply}
                atSummary={atSummary}
                aiMode={state.context.aiMode}
                aiTouchedTicketIds={state.context.aiTouchedTicketIds}
                pendingRefinementMutations={state.context.pendingRefinementMutations}
                send={send}
                onAdvanceToPlan={handleAdvanceToPlan}
              />
            </PhasePane>
          )}
          {typeof workflow === "object" && "phase4SprintPlanning" in workflow && (
            <PhasePane key="p4">
              <Phase4SprintPlan
                draft={draft}
                capacities={state.context.capacities}
                isGeneratingPlan={isPhase4Generating}
                isAwaitingPlannerReply={isAwaitingPlannerReply}
                send={send}
                onCommit={handleCommit}
                isCommitting={isCommitting}
              />
            </PhasePane>
          )}
          {(workflow === "committing" || workflow === "committed") && (
            <PhasePane key="committed">
              <div className="flex h-full flex-col items-center justify-center gap-3 px-6">
                <div className="h-12 w-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white text-2xl">
                  ✓
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Epic committed
                </p>
                <button
                  onClick={onClose}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                >
                  Close
                </button>
              </div>
            </PhasePane>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PhasePane({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0"
    >
      {children}
    </motion.div>
  );
}
