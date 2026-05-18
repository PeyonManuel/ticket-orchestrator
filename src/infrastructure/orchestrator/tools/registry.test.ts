import { describe, it, expect, beforeEach } from "vitest";
import { registerTool, toolsForPhase, type OrionTool } from "./registry";

// Build the smallest object that satisfies the StructuredToolInterface contract
// the registry actually touches (only the `name` field is inspected).
function mkTool(name: string): OrionTool {
  return { name } as OrionTool;
}

describe("toolsForPhase + registerTool", () => {
  // Reset any tools left over by other tests / by app bootstrap before each
  // test — the registry is a singleton; tests share state otherwise.
  beforeEach(() => {
    const phases = [
      "phase1",
      "phase2",
      "phase3",
      "phase4",
      "phase5",
      "blueprintChat",
      "refinementChat",
      "plannerChat",
      "inspectorChat",
    ] as const;
    for (const phase of phases) {
      const bucket = toolsForPhase(phase);
      bucket.length = 0;
    }
  });

  it("starts empty for every phase", () => {
    expect(toolsForPhase("phase1")).toEqual([]);
    expect(toolsForPhase("phase5")).toEqual([]);
    expect(toolsForPhase("refinementChat")).toEqual([]);
    expect(toolsForPhase("inspectorChat")).toEqual([]);
  });

  it("registers a tool for a single phase", () => {
    registerTool("phase2", mkTool("test-tool"));
    expect(toolsForPhase("phase2").map((t) => t.name)).toEqual(["test-tool"]);
    expect(toolsForPhase("phase1")).toEqual([]);
  });

  it("registers a tool for multiple phases at once", () => {
    registerTool(["phase1", "phase3"], mkTool("multi"));
    expect(toolsForPhase("phase1").map((t) => t.name)).toEqual(["multi"]);
    expect(toolsForPhase("phase3").map((t) => t.name)).toEqual(["multi"]);
    expect(toolsForPhase("phase2")).toEqual([]);
  });

  it("is idempotent on (phase, tool.name)", () => {
    const t = mkTool("dup");
    registerTool("phase4", t);
    registerTool("phase4", t);
    registerTool("phase4", mkTool("dup")); // same name, different instance
    expect(toolsForPhase("phase4")).toHaveLength(1);
  });

  it("preserves insertion order across multiple distinct tools", () => {
    registerTool("phase5", mkTool("a"));
    registerTool("phase5", mkTool("b"));
    registerTool("phase5", mkTool("c"));
    expect(toolsForPhase("phase5").map((t) => t.name)).toEqual(["a", "b", "c"]);
  });
});
