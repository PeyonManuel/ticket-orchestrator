import { describe, it, expect } from "vitest";
import {
  applyBlueprintMutation,
  applyBlueprintMutations,
  applyRefinementMutation,
  applyRefinementMutations,
} from "./orchestrator.machine";
import type {
  BacklogProposal,
  BlueprintMutation,
  TicketProposal,
} from "../types";

function mkTicket(id: string, overrides: Partial<TicketProposal> = {}): TicketProposal {
  return {
    id,
    hierarchyType: "task",
    title: id,
    oneLiner: "",
    description: "",
    label: "developer",
    storyPoints: 3,
    risks: [],
    refined: false,
    transcript: [],
    ...overrides,
  };
}

function mkBacklog(ticketIds: string[]): BacklogProposal {
  return {
    epicTitle: "Epic",
    epicDescription: "desc",
    tickets: ticketIds.map((id) => mkTicket(id)),
  };
}

describe("applyBlueprintMutation — addTicket", () => {
  it("appends a new ticket with a generated id when no afterTicketId given", () => {
    const before = mkBacklog(["t1", "t2"]);
    const m: BlueprintMutation = {
      kind: "addTicket",
      title: "Added",
      oneLiner: "one",
      label: "developer",
      hierarchyType: "task",
    };
    const { backlog, touchedIds } = applyBlueprintMutation(before, m);
    expect(backlog.tickets).toHaveLength(3);
    expect(backlog.tickets[2].title).toBe("Added");
    expect(touchedIds).toHaveLength(1);
    expect(touchedIds[0]).toBe(backlog.tickets[2].id);
  });

  it("inserts after the requested afterTicketId", () => {
    const before = mkBacklog(["t1", "t2", "t3"]);
    const m: BlueprintMutation = {
      kind: "addTicket",
      title: "Insert",
      oneLiner: "",
      label: "developer",
      hierarchyType: "task",
      afterTicketId: "t1",
    };
    const { backlog } = applyBlueprintMutation(before, m);
    expect(backlog.tickets.map((t) => t.title)).toEqual([
      "t1",
      "Insert",
      "t2",
      "t3",
    ]);
  });

  it("appends when afterTicketId doesn't exist (defensive)", () => {
    const before = mkBacklog(["t1"]);
    const m: BlueprintMutation = {
      kind: "addTicket",
      title: "X",
      oneLiner: "",
      label: "developer",
      hierarchyType: "task",
      afterTicketId: "ghost",
    };
    const { backlog } = applyBlueprintMutation(before, m);
    expect(backlog.tickets).toHaveLength(2);
    expect(backlog.tickets[1].title).toBe("X");
  });
});

describe("applyBlueprintMutation — removeTicket", () => {
  it("removes the ticket and returns no touchedIds", () => {
    const before = mkBacklog(["t1", "t2"]);
    const { backlog, touchedIds } = applyBlueprintMutation(before, {
      kind: "removeTicket",
      ticketId: "t1",
    });
    expect(backlog.tickets.map((t) => t.id)).toEqual(["t2"]);
    expect(touchedIds).toEqual([]);
  });

  it("no-ops silently on unknown ticket id (defensive against hallucinations)", () => {
    const before = mkBacklog(["t1"]);
    const { backlog } = applyBlueprintMutation(before, {
      kind: "removeTicket",
      ticketId: "ghost",
    });
    expect(backlog.tickets).toHaveLength(1);
  });
});

describe("applyBlueprintMutation — renameTicket", () => {
  it("updates title only", () => {
    const before = mkBacklog(["t1"]);
    const { backlog, touchedIds } = applyBlueprintMutation(before, {
      kind: "renameTicket",
      ticketId: "t1",
      title: "Renamed",
    });
    expect(backlog.tickets[0].title).toBe("Renamed");
    expect(backlog.tickets[0].oneLiner).toBe("");
    expect(touchedIds).toEqual(["t1"]);
  });

  it("updates oneLiner only", () => {
    const before = mkBacklog(["t1"]);
    const { backlog } = applyBlueprintMutation(before, {
      kind: "renameTicket",
      ticketId: "t1",
      oneLiner: "New oneliner",
    });
    expect(backlog.tickets[0].title).toBe("t1");
    expect(backlog.tickets[0].oneLiner).toBe("New oneliner");
  });

  it("no-ops when neither title nor oneLiner provided", () => {
    const before = mkBacklog(["t1"]);
    const { backlog, touchedIds } = applyBlueprintMutation(before, {
      kind: "renameTicket",
      ticketId: "t1",
    } as BlueprintMutation);
    expect(backlog).toBe(before);
    expect(touchedIds).toEqual([]);
  });
});

describe("applyBlueprintMutation — changeLabel + reorderTicket", () => {
  it("changes the label on the matching ticket", () => {
    const before = mkBacklog(["t1"]);
    const { backlog } = applyBlueprintMutation(before, {
      kind: "changeLabel",
      ticketId: "t1",
      label: "ux",
    });
    expect(backlog.tickets[0].label).toBe("ux");
  });

  it("reorders a ticket to the requested newIndex", () => {
    const before = mkBacklog(["t1", "t2", "t3", "t4"]);
    const { backlog, touchedIds } = applyBlueprintMutation(before, {
      kind: "reorderTicket",
      ticketId: "t1",
      newIndex: 2,
    });
    expect(backlog.tickets.map((t) => t.id)).toEqual(["t2", "t3", "t1", "t4"]);
    expect(touchedIds).toEqual(["t1"]);
  });

  it("clamps newIndex to valid range", () => {
    const before = mkBacklog(["t1", "t2"]);
    const { backlog } = applyBlueprintMutation(before, {
      kind: "reorderTicket",
      ticketId: "t1",
      newIndex: 999,
    });
    expect(backlog.tickets.map((t) => t.id)).toEqual(["t2", "t1"]);
  });

  it("no-ops when reorder target is already the current index", () => {
    const before = mkBacklog(["t1", "t2"]);
    const { backlog, touchedIds } = applyBlueprintMutation(before, {
      kind: "reorderTicket",
      ticketId: "t1",
      newIndex: 0,
    });
    expect(backlog).toBe(before);
    expect(touchedIds).toEqual([]);
  });
});

describe("applyBlueprintMutation — epic edits", () => {
  it("updates epicTitle", () => {
    const before = mkBacklog(["t1"]);
    const { backlog, touchedIds } = applyBlueprintMutation(before, {
      kind: "editEpicTitle",
      title: "New Epic",
    });
    expect(backlog.epicTitle).toBe("New Epic");
    expect(touchedIds).toEqual([]);
  });

  it("updates epicDescription", () => {
    const before = mkBacklog(["t1"]);
    const { backlog } = applyBlueprintMutation(before, {
      kind: "editEpicDescription",
      description: "New desc",
    });
    expect(backlog.epicDescription).toBe("New desc");
  });
});

describe("applyBlueprintMutation — dependencies", () => {
  it("adds a blockedBy dependency to the source ticket", () => {
    const before = mkBacklog(["t1", "t2"]);
    const { backlog } = applyBlueprintMutation(before, {
      kind: "addDependency",
      sourceTicketId: "t1",
      targetTicketId: "t2",
      linkKind: "blockedBy",
    });
    expect(backlog.tickets[0].dependencies).toEqual([
      { kind: "blockedBy", targetProposalId: "t2" },
    ]);
  });

  it("does not duplicate an existing dependency", () => {
    const before = mkBacklog(["t1", "t2"]);
    const after1 = applyBlueprintMutation(before, {
      kind: "addDependency",
      sourceTicketId: "t1",
      targetTicketId: "t2",
      linkKind: "blockedBy",
    });
    const after2 = applyBlueprintMutation(after1.backlog, {
      kind: "addDependency",
      sourceTicketId: "t1",
      targetTicketId: "t2",
      linkKind: "blockedBy",
    });
    expect(after2.backlog.tickets[0].dependencies).toHaveLength(1);
  });

  it("rejects self-loop addDependency", () => {
    const before = mkBacklog(["t1"]);
    const { backlog } = applyBlueprintMutation(before, {
      kind: "addDependency",
      sourceTicketId: "t1",
      targetTicketId: "t1",
      linkKind: "blockedBy",
    });
    expect(backlog).toBe(before);
  });

  it("rejects addDependency when source or target is unknown", () => {
    const before = mkBacklog(["t1"]);
    const { backlog } = applyBlueprintMutation(before, {
      kind: "addDependency",
      sourceTicketId: "t1",
      targetTicketId: "ghost",
      linkKind: "blockedBy",
    });
    expect(backlog).toBe(before);
  });

  it("removes a matching dependency", () => {
    const before = mkBacklog(["t1", "t2"]);
    before.tickets[0].dependencies = [
      { kind: "blockedBy", targetProposalId: "t2" },
      { kind: "relatedTo", targetProposalId: "t2" },
    ];
    const { backlog } = applyBlueprintMutation(before, {
      kind: "removeDependency",
      sourceTicketId: "t1",
      targetTicketId: "t2",
      linkKind: "blockedBy",
    });
    expect(backlog.tickets[0].dependencies).toEqual([
      { kind: "relatedTo", targetProposalId: "t2" },
    ]);
  });
});

describe("applyBlueprintMutations (batch)", () => {
  it("applies mutations in order and accumulates touchedIds", () => {
    const before = mkBacklog(["t1"]);
    const { backlog, touchedIds } = applyBlueprintMutations(before, [
      { kind: "addTicket", title: "X", oneLiner: "", label: "developer", hierarchyType: "task" },
      { kind: "changeLabel", ticketId: "t1", label: "ux" },
    ]);
    expect(backlog.tickets).toHaveLength(2);
    expect(backlog.tickets[0].label).toBe("ux");
    expect(touchedIds).toContain("t1");
    expect(touchedIds).toHaveLength(2);
  });

  it("deduplicates touchedIds across multiple mutations of the same ticket", () => {
    const before = mkBacklog(["t1"]);
    const { touchedIds } = applyBlueprintMutations(before, [
      { kind: "changeLabel", ticketId: "t1", label: "ux" },
      { kind: "renameTicket", ticketId: "t1", title: "X" },
    ]);
    expect(touchedIds).toEqual(["t1"]);
  });
});

describe("applyRefinementMutation", () => {
  const base = mkTicket("active");

  it("setDescription replaces description", () => {
    expect(
      applyRefinementMutation(base, {
        kind: "setDescription",
        description: "new",
      }).description,
    ).toBe("new");
  });

  it("setStoryPoints sets points (Fibonacci enforced upstream)", () => {
    expect(
      applyRefinementMutation(base, { kind: "setStoryPoints", storyPoints: 8 })
        .storyPoints,
    ).toBe(8);
  });

  it("setLabel updates label", () => {
    expect(
      applyRefinementMutation(base, { kind: "setLabel", label: "qa" }).label,
    ).toBe("qa");
  });

  it("setDiscipline updates discipline (drives capacity matching)", () => {
    expect(
      applyRefinementMutation(base, { kind: "setDiscipline", discipline: "tester" })
        .discipline,
    ).toBe("tester");
  });

  it("replaceRisks replaces the full risk list (not a delta)", () => {
    const withRisks = mkTicket("t1", { risks: ["a"] });
    expect(
      applyRefinementMutation(withRisks, { kind: "replaceRisks", risks: ["b", "c"] })
        .risks,
    ).toEqual(["b", "c"]);
  });

  it("returns a new object (never mutates input)", () => {
    const original = mkTicket("t1");
    const after = applyRefinementMutation(original, {
      kind: "setLabel",
      label: "ux",
    });
    expect(after).not.toBe(original);
    expect(original.label).toBe("developer");
  });
});

describe("applyRefinementMutations (batch)", () => {
  it("composes mutations left-to-right", () => {
    const base = mkTicket("t1");
    const result = applyRefinementMutations(base, [
      { kind: "setLabel", label: "ux" },
      { kind: "setStoryPoints", storyPoints: 5 },
    ]);
    expect(result.label).toBe("ux");
    expect(result.storyPoints).toBe(5);
  });

  it("last-write-wins when the same field is touched twice", () => {
    const base = mkTicket("t1");
    const result = applyRefinementMutations(base, [
      { kind: "setLabel", label: "ux" },
      { kind: "setLabel", label: "qa" },
    ]);
    expect(result.label).toBe("qa");
  });
});
