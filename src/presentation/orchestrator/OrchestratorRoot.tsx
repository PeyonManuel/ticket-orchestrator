"use client";

import React, { useState } from "react";
import { useBoardData } from "@/presentation/board/BoardContext";
import { DraftPicker } from "./DraftPicker";
import { OrchestratorSession } from "./OrchestratorSession";

interface Props {
  onClose: () => void;
}

/**
 * Top-level orchestrator entry. Picks between the drafts list and an active
 * session. The "active draft id" lives in local state (not the URL) — drafts
 * are durable in Mongo, so a refresh just lands the user back on the picker.
 */
export function OrchestratorRoot({ onClose }: Props) {
  const { activeBoardId } = useBoardData();
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);

  if (!activeBoardId) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <p className="text-sm text-zinc-500">Select a board first to draft an Epic.</p>
      </div>
    );
  }

  if (!activeDraftId) {
    return (
      <DraftPicker
        boardId={activeBoardId}
        onSelect={setActiveDraftId}
        onClose={onClose}
      />
    );
  }

  return (
    <OrchestratorSession
      draftId={activeDraftId}
      onClose={onClose}
      onBackToPicker={() => setActiveDraftId(null)}
    />
  );
}
