import { describe, it, expect, vi } from "vitest";
import { runDependencyInference } from "../mockAi";
import type { TicketProposal, DependencyInferenceOutput } from "@/domain/orchestrator/types";

function mkTicket(
  id: string,
  title: string,
  description: string = "",
): TicketProposal {
  return {
    id,
    hierarchyType: "task",
    title,
    oneLiner: title,
    description,
    label: "developer",
    storyPoints: 3,
    risks: [],
    refined: false,
    transcript: [],
  };
}

describe("runDependencyInference (mock) — determinism & patterns", () => {
  it("returns output for each ticket", async () => {
    const tickets = [
      mkTicket("t1", "Database schema migration", "Create initial tables and indexes"),
      mkTicket("t2", "User API endpoint", "Implement REST API that queries user table"),
    ];

    const result = await runDependencyInference({
      tickets,
      currentDependencies: [],
      epicSummary: {
        summary: "Build user management system",
        goals: ["Goal 1"],
      },
    });

    expect(result).toHaveLength(2);
    expect(result.every((r) => r.ticketId && Array.isArray(r.dependencies))).toBe(true);
  });

  it("infers API blocked by database schema", async () => {
    const tickets = [
      mkTicket("t1", "Database schema migration", "Create user table"),
      mkTicket("t2", "User API endpoint", "Implement REST API that queries user table"),
    ];

    const result = await runDependencyInference({
      tickets,
      currentDependencies: [],
      epicSummary: { summary: "Build app", goals: [] },
    });

    // t2 (API) should be blocked by t1 (schema)
    const t2 = result.find((r) => r.ticketId === "t2");
    const blocksSchema = t2?.dependencies?.some(
      (d) => d.kind === "blockedBy" && d.targetProposalId === "t1",
    );
    expect(blocksSchema).toBe(true);
  });

  it("returns consistent results on repeat", async () => {
    const tickets = [
      mkTicket("t1", "Database schema", ""),
      mkTicket("t2", "API endpoint", ""),
    ];

    const result1 = await runDependencyInference({
      tickets,
      currentDependencies: [],
      epicSummary: { summary: "Build app", goals: [] },
    });

    const result2 = await runDependencyInference({
      tickets,
      currentDependencies: [],
      epicSummary: { summary: "Build app", goals: [] },
    });

    expect(result1).toEqual(result2);
  });

  it("produces no self-loops", async () => {
    const tickets = [
      mkTicket("t1", "Database schema", ""),
      mkTicket("t2", "API endpoint", ""),
    ];

    const result = await runDependencyInference({
      tickets,
      currentDependencies: [],
      epicSummary: { summary: "Build app", goals: [] },
    });

    const allDeps = result.flatMap((r) => r.dependencies);
    const hasSelfLoop = allDeps.some((d) => {
      const source = result.find((r) => r.dependencies?.includes(d));
      return source && d.targetProposalId === source.ticketId;
    });

    expect(hasSelfLoop).toBe(false);
  });
});
