import { describe, it, expect } from "vitest";
import { produceSprintPlan } from "./slicingPolicy";
import type { TeamMemberCapacity } from "./capacityPolicy";
import type {
  BacklogProposal,
  ProposalDependency,
  ProposalLabel,
  ProposalStoryPoints,
  SprintSnapshot,
  TicketProposal,
} from "../types";
import type { OrgMemberRole } from "../../analyst/types";

function mkTicket(
  id: string,
  opts: {
    points?: ProposalStoryPoints | null;
    label?: ProposalLabel;
    discipline?: OrgMemberRole;
    deps?: ProposalDependency[];
  } = {},
): TicketProposal {
  return {
    id,
    hierarchyType: "task",
    title: id,
    oneLiner: "",
    description: "",
    label: opts.label ?? "developer",
    storyPoints: opts.points ?? 3,
    risks: [],
    refined: true,
    transcript: [],
    discipline: opts.discipline,
    dependencies: opts.deps,
  };
}

function mkSprint(id: string, capacityPoints = 30): SprintSnapshot {
  return {
    id,
    name: id,
    startDate: `2026-01-${id.padStart(2, "0")}`,
    endDate: `2026-01-${(parseInt(id) + 13).toString().padStart(2, "0")}`,
    capacityPoints,
    status: "planning",
  };
}

function mkCapacity(role: OrgMemberRole, points: number, suffix = ""): TeamMemberCapacity {
  return {
    memberId: `m-${role}${suffix}`,
    fullName: `${role}${suffix} name`,
    role,
    pointsPerSprint: points,
    isDefaultVelocity: false,
  };
}

function mkBacklog(tickets: TicketProposal[]): BacklogProposal {
  return {
    epicTitle: "Test Epic",
    epicDescription: "Test description",
    tickets,
  };
}

describe("produceSprintPlan — placement", () => {
  it("places tickets into the first sprint that has discipline capacity", () => {
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([mkTicket("t1", { points: 3 })]),
      sprints: [mkSprint("01"), mkSprint("02")],
      capacities: [mkCapacity("developer", 10)],
    });
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments[0].sprintId).toBe("01");
    expect(plan.assignments[0].sprintId).not.toBeNull();
  });

  it("assigns to the developer member (least-loaded)", () => {
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([mkTicket("t1", { points: 3 })]),
      sprints: [mkSprint("01")],
      capacities: [
        mkCapacity("developer", 10, "-a"),
        mkCapacity("developer", 10, "-b"),
      ],
    });
    expect(plan.assignments[0].assigneeUserId).toBeTypeOf("string");
  });

  it("spills into the next sprint when the first hits its discipline buffer", () => {
    // dev cap raw = 10, * 0.8 = 8. Two 5-point tickets = 10 raw → second spills.
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([
        mkTicket("t1", { points: 5 }),
        mkTicket("t2", { points: 5 }),
      ]),
      sprints: [mkSprint("01"), mkSprint("02")],
      capacities: [mkCapacity("developer", 10)],
    });
    expect(plan.assignments[0].sprintId).toBe("01");
    expect(plan.assignments[1].sprintId).toBe("02");
  });

  it("respects per-discipline budget (UX tickets don't consume dev budget)", () => {
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([
        mkTicket("dev", { points: 8, discipline: "developer" }),
        mkTicket("ux", { points: 5, discipline: "ux" }),
      ]),
      sprints: [mkSprint("01")],
      capacities: [
        mkCapacity("developer", 10),
        mkCapacity("ux", 8),
      ],
    });
    // dev cap = 8, ux cap = 6 (8 * 0.8). Both fit in sprint 01.
    expect(plan.assignments[0].sprintId).toBe("01");
    expect(plan.assignments[1].sprintId).toBe("01");
  });
});

describe("produceSprintPlan — overflow & proposed sprints", () => {
  it("proposes a new sprint when an existing one can't fit the ticket", () => {
    // Fill sprint 01 to its dev buffer, then add another ticket.
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([
        mkTicket("filler", { points: 8 }), // hits cap 8
        mkTicket("extra", { points: 3 }), // forces a new sprint
      ]),
      sprints: [mkSprint("01")],
      capacities: [mkCapacity("developer", 10)],
    });
    expect(plan.proposedSprints).toBeDefined();
    expect(plan.proposedSprints?.length ?? 0).toBeGreaterThanOrEqual(1);
    expect(plan.assignments[1].sprintId).not.toBe("01");
  });

  it("schedules tickets whose discipline has no team members by using default velocity", () => {
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([mkTicket("t1", { discipline: "tester" })]),
      sprints: [mkSprint("01")],
      capacities: [mkCapacity("developer", 10)], // no tester
    });
    // Should still be scheduled (into sprint 01 or a proposed sprint) not left null
    expect(plan.assignments[0].sprintId).not.toBeNull();
  });

  it("defaults to 3 story points when null/undefined", () => {
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([mkTicket("t1", { points: null })]),
      sprints: [mkSprint("01")],
      capacities: [mkCapacity("developer", 5)],
    });
    // Default 3 fits in 5*0.8 = 4
    expect(plan.assignments[0].sprintId).toBe("01");
  });

  it("respects a custom bufferPercent", () => {
    // dev cap raw 10, with 50% buffer = 5. A 6-point ticket doesn't fit.
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([mkTicket("t1", { points: 8 })]),
      sprints: [mkSprint("01")],
      capacities: [mkCapacity("developer", 10)],
      bufferPercent: 50,
    });
    // Doesn't fit existing → proposes a new sprint.
    expect(plan.bufferRule?.percent).toBe(50);
  });
});

describe("produceSprintPlan — dependencies", () => {
  it("places blockers before blocked tickets", () => {
    const blocker = mkTicket("blocker", { points: 3 });
    const blocked = mkTicket("blocked", {
      points: 3,
      deps: [{ kind: "blockedBy", targetProposalId: "blocker" }],
    });
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([blocked, blocker]), // intentionally reversed
      sprints: [mkSprint("01"), mkSprint("02")],
      capacities: [mkCapacity("developer", 10)],
    });
    const blockerIdx = plan.assignments.findIndex((a) => a.ticketId === "blocker");
    const blockedIdx = plan.assignments.findIndex((a) => a.ticketId === "blocked");
    // Topological sort puts blocker first; both may land in same sprint.
    expect(blockerIdx).toBeLessThan(blockedIdx);
  });

  it("does not place a blocked ticket before its blocker's sprint", () => {
    // Big blocker forces it to sprint 02; blocked must land in 02 or later.
    const blocker = mkTicket("blocker", { points: 8 }); // fills sp 01 (cap=8)
    const blocked = mkTicket("blocked", {
      points: 3,
      deps: [{ kind: "blockedBy", targetProposalId: "blocker" }],
    });
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([blocker, blocked]),
      sprints: [mkSprint("01"), mkSprint("02")],
      capacities: [mkCapacity("developer", 10)],
    });
    const blockerSprint = plan.assignments.find((a) => a.ticketId === "blocker")?.sprintId;
    const blockedSprint = plan.assignments.find((a) => a.ticketId === "blocked")?.sprintId;
    // Blocker fits sp 01 (8 = exact cap), blocked goes to 02.
    expect(blockerSprint).toBe("01");
    expect(blockedSprint).toBe("02");
  });

  it("falls back to insertion order + records the cycle when blockedBy is cyclic", () => {
    const a = mkTicket("a", { deps: [{ kind: "blockedBy", targetProposalId: "b" }] });
    const b = mkTicket("b", { deps: [{ kind: "blockedBy", targetProposalId: "a" }] });
    const result = produceSprintPlan({
      backlog: mkBacklog([a, b]),
      sprints: [mkSprint("01")],
      capacities: [mkCapacity("developer", 10)],
    });
    expect(result.cycles).toHaveLength(1);
  });
});

describe("produceSprintPlan — discipline fallback", () => {
  it("uses ticket.discipline when set", () => {
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([
        mkTicket("t1", { label: "developer", discipline: "ux" }),
      ]),
      sprints: [mkSprint("01")],
      capacities: [mkCapacity("ux", 10)],
    });
    expect(plan.assignments[0].sprintId).toBe("01");
  });

  it("falls back to label mapping when discipline absent (qa label → tester)", () => {
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([mkTicket("t1", { label: "qa" })]),
      sprints: [mkSprint("01")],
      capacities: [mkCapacity("tester", 10)],
    });
    expect(plan.assignments[0].sprintId).toBe("01");
  });

  it("ignores completed sprints (only schedules into planning/active)", () => {
    const { plan } = produceSprintPlan({
      backlog: mkBacklog([mkTicket("t1")]),
      sprints: [
        { ...mkSprint("01"), status: "completed" },
        mkSprint("02"),
      ],
      capacities: [mkCapacity("developer", 10)],
    });
    expect(plan.assignments[0].sprintId).toBe("02");
  });
});

