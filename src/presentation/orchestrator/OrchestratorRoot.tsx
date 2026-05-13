"use client";

import { useState } from "react";
import { useBoardData } from "@/presentation/board/BoardContext";
import { DraftPicker } from "./DraftPicker";
import { OrchestratorSession } from "./OrchestratorSession";
import { Phase5Inspector } from "./Phase5Inspector";

interface Props {
  onClose: () => void;
}

/**
 * Top-level orchestrator entry. Picks between the drafts list, an active
 * Phase 1-4 session, and the Phase 5 inspector for a committed Epic.
 * Selection lives in local state (not the URL) — drafts and snapshots are
 * durable in Mongo, so a refresh just lands the user back on the picker.
 */
export function OrchestratorRoot({ onClose }: Props) {
  const { activeBoardId } = useBoardData();
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeSnapshotId, setActiveSnapshotId] = useState<string | null>(null);

  if (!activeBoardId) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-sm text-zinc-500">Select a board first to draft an Epic.</p>
      </div>
    );
  }

  if (activeSnapshotId) {
    return (
      <Phase5Inspector
        key={activeSnapshotId}
        snapshotId={activeSnapshotId}
        onClose={onClose}
        onBackToPicker={() => setActiveSnapshotId(null)}
      />
    );
  }

  if (activeDraftId) {
    return (
      <OrchestratorSession
        draftId={activeDraftId}
        onClose={onClose}
        onBackToPicker={() => setActiveDraftId(null)}
      />
    );
  }

  return (
    <DraftPicker
      boardId={activeBoardId}
      onSelect={setActiveDraftId}
      onOpenCommittedEpic={setActiveSnapshotId}
      onClose={onClose}
    />
  );
}
