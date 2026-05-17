"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import type { ProposalLabel, TicketProposal } from "@/domain/orchestrator/types";

interface Props {
  tickets: TicketProposal[];
}

const NODE_W = 200;
const NODE_H = 64;
const H_GAP = 80;
const V_GAP = 24;

const LABEL_BG: Record<ProposalLabel, string> = {
  developer: "#d1fae5",
  ux: "#fce7f3",
  qa: "#fef3c7",
  po: "#e0e7ff",
};
const LABEL_BORDER: Record<ProposalLabel, string> = {
  developer: "#6ee7b7",
  ux: "#f9a8d4",
  qa: "#fcd34d",
  po: "#a5b4fc",
};
const LABEL_TEXT: Record<ProposalLabel, string> = {
  developer: "#065f46",
  ux: "#9d174d",
  qa: "#92400e",
  po: "#3730a3",
};

function computeLayout(tickets: TicketProposal[]): { nodes: Node[]; edges: Edge[] } {
  const byId = new Map(tickets.map((t) => [t.id, t]));

  // successor map: blocker id → [blocked ids]
  const successors = new Map<string, string[]>();
  const inCount = new Map<string, number>();
  tickets.forEach((t) => {
    successors.set(t.id, []);
    inCount.set(t.id, 0);
  });

  const edges: Edge[] = [];

  for (const t of tickets) {
    for (const dep of t.dependencies ?? []) {
      if (!byId.has(dep.targetProposalId)) continue;
      if (dep.kind === "blockedBy") {
        successors.get(dep.targetProposalId)?.push(t.id);
        inCount.set(t.id, (inCount.get(t.id) ?? 0) + 1);
        edges.push({
          id: `${dep.targetProposalId}->${t.id}`,
          source: dep.targetProposalId,
          target: t.id,
          label: "blocks",
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: "#6366f1" },
          labelStyle: { fontSize: 10, fill: "#6366f1" },
          animated: false,
        });
      } else {
        edges.push({
          id: `${t.id}--${dep.targetProposalId}-${dep.kind}`,
          source: t.id,
          target: dep.targetProposalId,
          label: dep.kind === "relatedTo" ? "related" : "duplicates",
          style: { stroke: "#a1a1aa", strokeDasharray: "4 3" },
          labelStyle: { fontSize: 10, fill: "#a1a1aa" },
          animated: false,
        });
      }
    }
  }

  // BFS level assignment
  const level = new Map<string, number>();
  const queue: string[] = [];
  tickets.forEach((t) => {
    if ((inCount.get(t.id) ?? 0) === 0) {
      level.set(t.id, 0);
      queue.push(t.id);
    }
  });

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const l = level.get(id) ?? 0;
    for (const sid of successors.get(id) ?? []) {
      const next = Math.max(level.get(sid) ?? 0, l + 1);
      level.set(sid, next);
      if (!queue.includes(sid)) queue.push(sid);
    }
  }

  // Tickets not reachable (isolated, or in a cycle) default to level 0
  tickets.forEach((t) => {
    if (!level.has(t.id)) level.set(t.id, 0);
  });

  // Group by level, sort each level by original array order
  const byLevel = new Map<number, string[]>();
  tickets.forEach((t) => {
    const l = level.get(t.id) ?? 0;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(t.id);
  });

  const nodes: Node[] = tickets.map((t) => {
    const l = level.get(t.id) ?? 0;
    const col = byLevel.get(l)!;
    const row = col.indexOf(t.id);
    return {
      id: t.id,
      position: { x: l * (NODE_W + H_GAP), y: row * (NODE_H + V_GAP) },
      data: { ticket: t },
      type: "ticketNode",
      width: NODE_W,
      height: NODE_H,
    };
  });

  return { nodes, edges };
}

function TicketNodeComponent({ data }: { data: { ticket: TicketProposal } }) {
  const { ticket } = data;
  const bg = LABEL_BG[ticket.label] ?? "#f4f4f5";
  const border = LABEL_BORDER[ticket.label] ?? "#d4d4d8";
  const text = LABEL_TEXT[ticket.label] ?? "#3f3f46";
  return (
    <div
      style={{
        width: NODE_W,
        minHeight: NODE_H,
        background: bg,
        border: `1.5px solid ${border}`,
        borderRadius: 10,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        boxShadow: "0 1px 4px rgba(0,0,0,0.07)",
      }}
    >
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: text,
          opacity: 0.7,
        }}
      >
        {ticket.label} · {ticket.hierarchyType}
      </span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: text,
          lineHeight: 1.3,
          wordBreak: "break-word",
        }}
      >
        {ticket.title}
      </span>
    </div>
  );
}

const nodeTypes = { ticketNode: TicketNodeComponent };

export function DependencyGraphView({ tickets }: Props) {
  const { nodes, edges } = useMemo(() => computeLayout(tickets), [tickets]);

  if (tickets.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        No tickets yet.
      </div>
    );
  }

  const hasDeps = tickets.some((t) => (t.dependencies ?? []).length > 0);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll={false}
        className="bg-zinc-50 dark:bg-zinc-950"
      >
        <Background color="#d4d4d8" gap={20} size={1} />
        <Controls position="bottom-right" showInteractive={false} />
      </ReactFlow>
      {!hasDeps && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-xl bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-700 px-5 py-3 text-center backdrop-blur-sm">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No dependencies set</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Add blockedBy / relatedTo links via each ticket row.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
