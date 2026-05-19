import { describe, it, expect } from "vitest";
import {
  describeBlueprintMutationForFeedback,
  describeRefinementMutationForFeedback,
  validateBlueprintMutations,
  validateRefinementMutations,
} from "./mutationValidation";
import type {
  BacklogProposal,
  BlueprintMutation,
  RefinementMutation,
  TicketProposal,
} from "@/domain/orchestrator/types";

function mkTicket(id: string): TicketProposal {
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
  };
}

function mkBacklog(ticketIds: string[]): BacklogProposal {
  return {
    epicTitle: "Epic",
    epicDescription: "desc",
    tickets: ticketIds.map(mkTicket),
  };
}

describe("validateBlueprintMutations", () => {
  const backlog = mkBacklog(["t1", "t2", "t3"]);

  it("passes mutations that reference existing ticket ids", () => {
    const mutations: BlueprintMutation[] = [
      { kind: "removeTicket", ticketId: "t1" },
      { kind: "changeLabel", ticketId: "t2", label: "ux" },
    ];
    const { valid, failed } = validateBlueprintMutations(mutations, backlog);
    expect(valid).toEqual(mutations);
    expect(failed).toEqual([]);
  });

  it("rejects mutations referencing non-existent ticket ids", () => {
    const mutations: BlueprintMutation[] = [
      { kind: "removeTicket", ticketId: "ghost" },
    ];
    const { valid, failed } = validateBlueprintMutations(mutations, backlog);
    expect(valid).toEqual([]);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatch(/ticketId='ghost' does not exist/);
  });

  it("rejects renameTicket with neither title nor oneLiner", () => {
    const mutations: BlueprintMutation[] = [
      { kind: "renameTicket", ticketId: "t1" } as BlueprintMutation,
    ];
    const { failed } = validateBlueprintMutations(mutations, backlog);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatch(/at least one of: title, oneLiner/);
  });

  it("accepts renameTicket with just title or just oneLiner", () => {
    const m1: BlueprintMutation = {
      kind: "renameTicket",
      ticketId: "t1",
      title: "new title",
    };
    const m2: BlueprintMutation = {
      kind: "renameTicket",
      ticketId: "t2",
      oneLiner: "new oneliner",
    };
    const { valid, failed } = validateBlueprintMutations([m1, m2], backlog);
    expect(valid).toHaveLength(2);
    expect(failed).toEqual([]);
  });

  it("rejects addTicket when afterTicketId points to a non-existent ticket", () => {
    const m: BlueprintMutation = {
      kind: "addTicket",
      title: "new",
      oneLiner: "",
      label: "developer",
      hierarchyType: "task",
      afterTicketId: "ghost",
    };
    const { failed } = validateBlueprintMutations([m], backlog);
    expect(failed[0].reason).toMatch(/afterTicketId='ghost' does not exist/);
  });

  it("accepts addTicket with no afterTicketId (append at end)", () => {
    const m: BlueprintMutation = {
      kind: "addTicket",
      title: "new",
      oneLiner: "",
      label: "developer",
      hierarchyType: "task",
    };
    const { valid } = validateBlueprintMutations([m], backlog);
    expect(valid).toHaveLength(1);
  });

  it("rejects self-loop dependencies", () => {
    const m: BlueprintMutation = {
      kind: "addDependency",
      sourceTicketId: "t1",
      targetTicketId: "t1",
      linkKind: "blockedBy",
    };
    const { failed } = validateBlueprintMutations([m], backlog);
    expect(failed[0].reason).toMatch(/source and target cannot be the same/);
  });

  it("rejects dependencies pointing at non-existent source or target", () => {
    const m1: BlueprintMutation = {
      kind: "addDependency",
      sourceTicketId: "ghost",
      targetTicketId: "t1",
      linkKind: "blockedBy",
    };
    const m2: BlueprintMutation = {
      kind: "addDependency",
      sourceTicketId: "t1",
      targetTicketId: "ghost",
      linkKind: "blockedBy",
    };
    const { failed } = validateBlueprintMutations([m1, m2], backlog);
    expect(failed).toHaveLength(2);
    expect(failed[0].reason).toMatch(/sourceTicketId='ghost'/);
    expect(failed[1].reason).toMatch(/targetTicketId='ghost'/);
  });

  it("passes epic-edit mutations through (no ticket id to validate)", () => {
    const mutations: BlueprintMutation[] = [
      { kind: "editEpicTitle", title: "New" },
      { kind: "editEpicDescription", description: "New desc" },
    ];
    const { valid, failed } = validateBlueprintMutations(mutations, backlog);
    expect(valid).toHaveLength(2);
    expect(failed).toEqual([]);
  });

  it("partitions a mixed batch correctly", () => {
    const mutations: BlueprintMutation[] = [
      { kind: "removeTicket", ticketId: "t1" }, // valid
      { kind: "removeTicket", ticketId: "ghost" }, // invalid
      { kind: "editEpicTitle", title: "Renamed" }, // valid
    ];
    const { valid, failed } = validateBlueprintMutations(mutations, backlog);
    expect(valid).toHaveLength(2);
    expect(failed).toHaveLength(1);
  });
});

describe("validateRefinementMutations", () => {
  const ticket = mkTicket("active");

  it("passes all currently-supported mutation kinds", () => {
    const mutations: RefinementMutation[] = [
      { kind: "setDescription", description: "new" },
      {
        kind: "setAcceptanceCriteria",
        acceptanceCriteria: [
          { kind: "gherkin", given: "g", when: "w", outcome: "t" },
        ],
      },
      { kind: "setStoryPoints", storyPoints: 5 },
      { kind: "setLabel", label: "ux" },
      { kind: "setDiscipline", discipline: "developer" },
      { kind: "replaceRisks", risks: ["a", "b"] },
    ];
    const { valid, failed } = validateRefinementMutations(mutations, ticket);
    expect(valid).toEqual(mutations);
    expect(failed).toEqual([]);
  });

  it("accepts replaceRisks with an empty array (PO can clear all risks)", () => {
    const m: RefinementMutation = { kind: "replaceRisks", risks: [] };
    const { valid } = validateRefinementMutations([m], ticket);
    expect(valid).toHaveLength(1);
  });

  it("rejects setAcceptanceCriteria with empty array (AC of nothing is meaningless)", () => {
    const m: RefinementMutation = {
      kind: "setAcceptanceCriteria",
      acceptanceCriteria: [],
    };
    const { valid, failed } = validateRefinementMutations([m], ticket);
    expect(valid).toEqual([]);
    expect(failed).toHaveLength(1);
    expect(failed[0].reason).toMatch(/at least one criterion/);
  });
});

describe("describeBlueprintMutationForFeedback", () => {
  it("formats every blueprint mutation kind compactly", () => {
    const cases: Array<[BlueprintMutation, RegExp]> = [
      [{ kind: "addTicket", title: "X", oneLiner: "", label: "developer", hierarchyType: "task" }, /addTicket\(title="X"\)/],
      [{ kind: "removeTicket", ticketId: "t1" }, /removeTicket\(ticketId=t1\)/],
      [{ kind: "renameTicket", ticketId: "t1", title: "X" }, /renameTicket\(ticketId=t1\)/],
      [{ kind: "changeLabel", ticketId: "t1", label: "ux" }, /changeLabel\(ticketId=t1, label=ux\)/],
      [{ kind: "reorderTicket", ticketId: "t1", newIndex: 2 }, /reorderTicket\(ticketId=t1, newIndex=2\)/],
      [{ kind: "editEpicTitle", title: "X" }, /editEpicTitle/],
      [{ kind: "editEpicDescription", description: "X" }, /editEpicDescription/],
      [
        { kind: "addDependency", sourceTicketId: "a", targetTicketId: "b", linkKind: "blockedBy" },
        /addDependency\(source=a, target=b, kind=blockedBy\)/,
      ],
      [
        { kind: "removeDependency", sourceTicketId: "a", targetTicketId: "b", linkKind: "relatedTo" },
        /removeDependency\(source=a, target=b, kind=relatedTo\)/,
      ],
    ];
    for (const [m, pattern] of cases) {
      expect(describeBlueprintMutationForFeedback(m)).toMatch(pattern);
    }
  });
});

describe("describeRefinementMutationForFeedback", () => {
  it("formats every refinement mutation kind", () => {
    expect(describeRefinementMutationForFeedback({ kind: "setDescription", description: "x" })).toBe(
      "setDescription",
    );
    expect(
      describeRefinementMutationForFeedback({
        kind: "setAcceptanceCriteria",
        acceptanceCriteria: [
          { kind: "gherkin", given: "a", when: "b", outcome: "c" },
          { kind: "narrative", text: "d" },
        ],
      }),
    ).toBe("setAcceptanceCriteria(2 items)");
    expect(describeRefinementMutationForFeedback({ kind: "setStoryPoints", storyPoints: 8 })).toBe(
      "setStoryPoints(8)",
    );
    expect(describeRefinementMutationForFeedback({ kind: "setLabel", label: "qa" })).toBe(
      "setLabel(qa)",
    );
    expect(describeRefinementMutationForFeedback({ kind: "setDiscipline", discipline: "tester" })).toBe(
      "setDiscipline(tester)",
    );
    expect(describeRefinementMutationForFeedback({ kind: "replaceRisks", risks: ["a", "b"] })).toBe(
      "replaceRisks(2 items)",
    );
  });
});
