import { describe, it, expect } from "vitest";
import { computeDrift } from "./driftDetection";
import type { BoardColumn, Ticket } from "@/domain/analyst";
import type { EpicSnapshot, TicketProposal } from "@/domain/orchestrator/types";

function mkProposal(id: string, overrides: Partial<TicketProposal> = {}): TicketProposal {
  return {
    id,
    hierarchyType: "task",
    title: id,
    oneLiner: "",
    description: "",
    label: "developer",
    acceptanceCriteria: [],
    storyPoints: 3,
    risks: [],
    refined: true,
    transcript: [],
    ...overrides,
  };
}

function mkTicket(id: string, overrides: Partial<Ticket> = {}): Ticket {
  return {
    id,
    boardId: "b1",
    orgId: "o1",
    ticketNumber: "T-1",
    title: id,
    description: "",
    storyPoints: 3,
    columnId: "col-todo",
    workflowState: "todo",
    priority: "medium",
    label: "developer",
    fixVersion: "",
    links: [],
    assigneeIds: [],
    sprintIds: [],
    version: 1,
    hierarchyType: "task",
    parentTicketId: null,
    ...overrides,
  };
}

function mkSnapshot(ticketIds: string[], overrides: Partial<EpicSnapshot> = {}): EpicSnapshot {
  return {
    id: "snap-1",
    orgId: "o1",
    boardId: "b1",
    epicTicketId: "epic-1",
    draftId: null,
    createdAt: "2026-01-01",
    createdBy: null,
    transcript: [],
    blueprintTranscript: [],
    brainstormSummary: null,
    backlog: {
      epicTitle: "Test",
      epicDescription: "",
      tickets: ticketIds.map((id) => mkProposal(id)),
    },
    plannerTranscript: [],
    sprintPlan: null,
    planningSprints: [],
    planningMembers: [],
    ticketIds,
    ...overrides,
  };
}

const doneCol: BoardColumn = {
  id: "col-done",
  boardId: "b1",
  orgId: "o1",
  name: "Done",
  states: ["done"],
  color: "#000",
  order: 2,
  isDone: true,
  protected: false,
};
const todoCol: BoardColumn = {
  id: "col-todo",
  boardId: "b1",
  orgId: "o1",
  name: "Todo",
  states: ["todo"],
  color: "#000",
  order: 0,
  isDone: false,
  protected: false,
};

describe("computeDrift", () => {
  it("reports zero drift when snapshot and live tickets match exactly", () => {
    const snap = mkSnapshot(["t1", "t2"]);
    const tickets = [mkTicket("t1"), mkTicket("t2")];
    const report = computeDrift(snap, tickets, [todoCol]);
    expect(report.hasDrift).toBe(false);
    expect(report.removedTickets).toEqual([]);
    expect(report.addedTickets).toEqual([]);
    expect(report.changedTickets).toEqual([]);
  });

  it("flags removed tickets (in snapshot but not on board)", () => {
    const snap = mkSnapshot(["t1", "t2", "t3"]);
    const tickets = [mkTicket("t1")]; // t2, t3 gone
    const report = computeDrift(snap, tickets, [todoCol]);
    expect(report.removedTickets).toHaveLength(2);
    expect(report.removedTickets.map((t) => t.id).sort()).toEqual(["t2", "t3"]);
    expect(report.hasDrift).toBe(true);
  });

  it("flags added tickets (on board but not in snapshot)", () => {
    const snap = mkSnapshot(["t1"]);
    const tickets = [mkTicket("t1"), mkTicket("new-1"), mkTicket("new-2")];
    const report = computeDrift(snap, tickets, [todoCol]);
    expect(report.addedTickets).toHaveLength(2);
    expect(report.hasDrift).toBe(true);
  });

  it("flags field changes for tracked fields (title, storyPoints)", () => {
    const snap = mkSnapshot(["t1"]);
    snap.backlog!.tickets[0] = mkProposal("t1", { title: "old", storyPoints: 5 });
    const tickets = [mkTicket("t1", { title: "new", storyPoints: 8 })];
    const report = computeDrift(snap, tickets, [todoCol]);
    expect(report.changedTickets).toHaveLength(1);
    expect(report.changedTickets[0].changedFields.sort()).toEqual([
      "storyPoints",
      "title",
    ]);
  });

  it("does not flag unchanged fields", () => {
    const snap = mkSnapshot(["t1"]);
    snap.backlog!.tickets[0] = mkProposal("t1", { title: "same", storyPoints: 3 });
    const tickets = [mkTicket("t1", { title: "same", storyPoints: 3 })];
    const report = computeDrift(snap, tickets, [todoCol]);
    expect(report.changedTickets).toEqual([]);
  });

  it("computes completion percent from done-column tickets", () => {
    const snap = mkSnapshot(["t1", "t2", "t3", "t4"]);
    const tickets = [
      mkTicket("t1", { columnId: doneCol.id }),
      mkTicket("t2", { columnId: doneCol.id }),
      mkTicket("t3"),
      mkTicket("t4"),
    ];
    const report = computeDrift(snap, tickets, [todoCol, doneCol]);
    expect(report.completionPercent).toBe(50);
  });

  it("reports 0% completion when no tickets are in done columns", () => {
    const snap = mkSnapshot(["t1"]);
    const tickets = [mkTicket("t1")];
    const report = computeDrift(snap, tickets, [todoCol, doneCol]);
    expect(report.completionPercent).toBe(0);
  });

  it("reports 0% completion when there are no live tickets", () => {
    const snap = mkSnapshot(["t1"]);
    const report = computeDrift(snap, [], [todoCol, doneCol]);
    expect(report.completionPercent).toBe(0);
  });

  it("ignores null/undefined proposed field values (no spurious drift)", () => {
    const snap = mkSnapshot(["t1"]);
    snap.backlog!.tickets[0] = mkProposal("t1", { storyPoints: null });
    const tickets = [mkTicket("t1", { storyPoints: 5 })];
    const report = computeDrift(snap, tickets, [todoCol]);
    expect(report.changedTickets).toEqual([]);
  });

  it("handles an empty snapshot backlog gracefully", () => {
    const snap = mkSnapshot([]);
    snap.backlog = null;
    const report = computeDrift(snap, [mkTicket("t1")], [todoCol]);
    expect(report.addedTickets).toHaveLength(1);
    expect(report.removedTickets).toEqual([]);
  });

  it("rounds completionPercent (e.g., 1/3 → 33)", () => {
    const snap = mkSnapshot(["t1", "t2", "t3"]);
    const tickets = [
      mkTicket("t1", { columnId: doneCol.id }),
      mkTicket("t2"),
      mkTicket("t3"),
    ];
    const report = computeDrift(snap, tickets, [todoCol, doneCol]);
    expect(report.completionPercent).toBe(33);
  });
});
