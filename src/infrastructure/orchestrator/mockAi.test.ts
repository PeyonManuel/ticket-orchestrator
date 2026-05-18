import { describe, it, expect } from "vitest";
import type {
  BacklogProposal,
  TicketProposal,
} from "@/domain/orchestrator/types";
import { runBlueprintChat, runRefinementChat } from "./mockAi";

function mkProposal(over: Partial<TicketProposal> = {}): TicketProposal {
  return {
    id: "prop-aaaa1111",
    hierarchyType: "story",
    title: "Sample ticket",
    oneLiner: "A short summary",
    description: "",
    label: "developer",
    acceptanceCriteria: [],
    storyPoints: null,
    risks: [],
    refined: false,
    transcript: [],
    ...over,
  };
}

function mkBacklog(over: Partial<BacklogProposal> = {}): BacklogProposal {
  return {
    epicTitle: "Test Epic",
    epicDescription: "An epic for unit tests.",
    tickets: [
      mkProposal({ id: "prop-001", title: "Build core schema" }),
      mkProposal({ id: "prop-002", title: "Add API endpoints" }),
      mkProposal({ id: "prop-003", title: "Wire UI" }),
    ],
    ...over,
  };
}

describe("mockAi.runBlueprintChat — deterministic mutation triggers", () => {
  it("rename ticket N to X → emits renameTicket with the real id", async () => {
    const backlog = mkBacklog();
    const result = await runBlueprintChat({
      transcript: [],
      currentBacklog: backlog,
      userMessage: "rename ticket 2 to Customer onboarding API",
    });
    expect(result.mutations).toEqual([
      {
        kind: "renameTicket",
        ticketId: "prop-002",
        title: "Customer onboarding API",
      },
    ]);
    expect(result.reply).toMatch(/applied 1 change/i);
    expect(result.reply).not.toMatch(/correction/i);
  });

  it("remove ticket N → emits removeTicket with the real id", async () => {
    const backlog = mkBacklog();
    const result = await runBlueprintChat({
      transcript: [],
      currentBacklog: backlog,
      userMessage: "remove ticket 1",
    });
    expect(result.mutations).toEqual([
      { kind: "removeTicket", ticketId: "prop-001" },
    ]);
    expect(result.reply).toMatch(/applied 1 change/i);
  });

  it("change label of ticket N to <label> → emits changeLabel", async () => {
    const backlog = mkBacklog();
    const result = await runBlueprintChat({
      transcript: [],
      currentBacklog: backlog,
      userMessage: "change label of ticket 3 to ux",
    });
    expect(result.mutations).toEqual([
      { kind: "changeLabel", ticketId: "prop-003", label: "ux" },
    ]);
  });

  it("rename ticket 99 (out of range) → validation rejects + splice appears", async () => {
    const backlog = mkBacklog();
    const result = await runBlueprintChat({
      transcript: [],
      currentBacklog: backlog,
      userMessage: "rename ticket 99 to Ghost ticket",
    });
    // No valid mutation survives validation.
    expect(result.mutations).toEqual([]);
    // The splice fires in the AI's voice.
    expect(result.reply).toMatch(/correction/i);
    expect(result.reply).toMatch(/not applied/i);
    expect(result.reply).toMatch(/prop-bogus99/);
  });

  it("non-trigger message falls through to the existing reply heuristic", async () => {
    const backlog = mkBacklog();
    const result = await runBlueprintChat({
      transcript: [],
      currentBacklog: backlog,
      userMessage: "Why did you put the API task before the UI task?",
    });
    expect(result.mutations ?? []).toEqual([]);
    expect(result.reply).toMatch(/critical path|sequencing|structure/i);
  });
});

describe("mockAi.runRefinementChat — deterministic mutation triggers", () => {
  it("make it 8 points → emits setStoryPoints(8)", async () => {
    const result = await runRefinementChat({
      transcript: [],
      ticket: mkProposal({ id: "prop-001", storyPoints: 3 }),
      backlog: mkBacklog(),
      userMessage: "make it 8 points",
    });
    expect(result.mutations).toEqual([
      { kind: "setStoryPoints", storyPoints: 8 },
    ]);
  });

  it("set to 5 sp → emits setStoryPoints(5)", async () => {
    const result = await runRefinementChat({
      transcript: [],
      ticket: mkProposal(),
      backlog: mkBacklog(),
      userMessage: "set to 5 sp",
    });
    expect(result.mutations).toEqual([
      { kind: "setStoryPoints", storyPoints: 5 },
    ]);
  });

  it("non-Fibonacci point value (4) → no mutation; falls through", async () => {
    const result = await runRefinementChat({
      transcript: [],
      ticket: mkProposal(),
      backlog: mkBacklog(),
      userMessage: "make it 4 points",
    });
    expect(result.mutations ?? []).toEqual([]);
    // Falls through to the existing wantsPoints heuristic.
    expect(result.reply).toMatch(/points|estimate/i);
  });

  it("change label to ux → emits setLabel + setDiscipline together", async () => {
    const result = await runRefinementChat({
      transcript: [],
      ticket: mkProposal({ label: "developer", discipline: "developer" }),
      backlog: mkBacklog(),
      userMessage: "change label to ux",
    });
    expect(result.mutations).toEqual([
      { kind: "setLabel", label: "ux" },
      { kind: "setDiscipline", discipline: "ux" },
    ]);
  });

  it("change label to qa → discipline maps to 'tester'", async () => {
    const result = await runRefinementChat({
      transcript: [],
      ticket: mkProposal(),
      backlog: mkBacklog(),
      userMessage: "change label to qa",
    });
    expect(result.mutations).toEqual([
      { kind: "setLabel", label: "qa" },
      { kind: "setDiscipline", discipline: "tester" },
    ]);
  });

  it("non-trigger message falls through to the existing reply heuristic", async () => {
    const result = await runRefinementChat({
      transcript: [],
      ticket: mkProposal({ title: "Auth flow" }),
      backlog: mkBacklog(),
      userMessage: "What's the scope of this ticket?",
    });
    expect(result.mutations ?? []).toEqual([]);
    expect(result.reply).toMatch(/auth flow|scope/i);
  });
});
