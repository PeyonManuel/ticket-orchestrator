import { describe, it, expect } from "vitest";
import {
  topologicalSort,
  detectCycles,
  indexById,
} from "./dependencyPolicy";
import type { ProposalDependency, TicketProposal } from "../types";

function mkProposal(
  id: string,
  deps: ProposalDependency[] = [],
  overrides: Partial<TicketProposal> = {},
): TicketProposal {
  return {
    id,
    hierarchyType: "task",
    title: id,
    oneLiner: "",
    description: "",
    label: "developer",
    storyPoints: null,
    risks: [],
    refined: false,
    transcript: [],
    dependencies: deps,
    ...overrides,
  };
}

const blockedBy = (target: string): ProposalDependency => ({
  kind: "blockedBy",
  targetProposalId: target,
});
const relatedTo = (target: string): ProposalDependency => ({
  kind: "relatedTo",
  targetProposalId: target,
});

describe("topologicalSort", () => {
  it("returns proposals in dependency order — blockers before blocked", () => {
    const a = mkProposal("a");
    const b = mkProposal("b", [blockedBy("a")]);
    const c = mkProposal("c", [blockedBy("b")]);
    const result = topologicalSort([c, b, a]);
    expect(result.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("preserves arbitrary order when there are no dependencies", () => {
    const a = mkProposal("a");
    const b = mkProposal("b");
    const c = mkProposal("c");
    // Insertion order is the iteration order; no edges means no reshuffling.
    expect(topologicalSort([a, b, c]).map((p) => p.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("ignores non-blockedBy edges (relatedTo, duplicates don't constrain order)", () => {
    const a = mkProposal("a", [relatedTo("b")]);
    const b = mkProposal("b");
    // 'a' relates to 'b' but isn't blocked by it — visit order wins.
    const result = topologicalSort([a, b]);
    expect(result.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("silently skips edges that point at unknown ids (external/already-met blockers)", () => {
    const a = mkProposal("a", [blockedBy("does-not-exist")]);
    expect(topologicalSort([a]).map((p) => p.id)).toEqual(["a"]);
  });

  it("throws a DependencyCycleError when blockedBy graph has a cycle", () => {
    const a = mkProposal("a", [blockedBy("b")]);
    const b = mkProposal("b", [blockedBy("a")]);
    expect(() => topologicalSort([a, b])).toThrow(/Dependency cycle/);
  });

  it("attaches the cycle path on the thrown error", () => {
    const a = mkProposal("a", [blockedBy("b")]);
    const b = mkProposal("b", [blockedBy("c")]);
    const c = mkProposal("c", [blockedBy("a")]);
    try {
      topologicalSort([a, b, c]);
      throw new Error("expected throw");
    } catch (err) {
      const cycle = (err as { cycle: string[] }).cycle;
      expect(cycle).toBeDefined();
      // The cycle starts and ends at the same id.
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    }
  });

  it("handles diamond dependencies — common ancestor visited once", () => {
    //     root
    //    /    \
    //   a      b
    //    \    /
    //     leaf
    const root = mkProposal("root");
    const a = mkProposal("a", [blockedBy("root")]);
    const b = mkProposal("b", [blockedBy("root")]);
    const leaf = mkProposal("leaf", [blockedBy("a"), blockedBy("b")]);
    const result = topologicalSort([leaf, b, a, root]);
    const order = result.map((p) => p.id);
    // root must come first, leaf last; a/b between.
    expect(order.indexOf("root")).toBeLessThan(order.indexOf("a"));
    expect(order.indexOf("root")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("a")).toBeLessThan(order.indexOf("leaf"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("leaf"));
    expect(result.length).toBe(4);
  });
});

describe("detectCycles", () => {
  it("returns an empty list for an acyclic graph", () => {
    expect(detectCycles([mkProposal("a"), mkProposal("b")])).toEqual([]);
  });

  it("returns the cycle for a 2-node loop", () => {
    const a = mkProposal("a", [blockedBy("b")]);
    const b = mkProposal("b", [blockedBy("a")]);
    const cycles = detectCycles([a, b]);
    expect(cycles).toHaveLength(1);
    expect(cycles[0][0]).toBe(cycles[0][cycles[0].length - 1]);
  });

  it("returns the cycle for self-loops", () => {
    const a = mkProposal("a", [blockedBy("a")]);
    const cycles = detectCycles([a]);
    expect(cycles).toHaveLength(1);
  });
});

describe("indexById", () => {
  it("maps proposals by id", () => {
    const a = mkProposal("a");
    const b = mkProposal("b");
    const map = indexById([a, b]);
    expect(map.get("a")).toBe(a);
    expect(map.get("b")).toBe(b);
    expect(map.size).toBe(2);
  });

  it("throws on duplicate ids — silent corruption is unacceptable", () => {
    const dup1 = mkProposal("dup");
    const dup2 = mkProposal("dup");
    expect(() => indexById([dup1, dup2])).toThrow(/Duplicate proposal id: dup/);
  });

  it("returns an empty map for an empty input", () => {
    expect(indexById([]).size).toBe(0);
  });
});
