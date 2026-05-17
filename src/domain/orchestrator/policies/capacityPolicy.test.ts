import { describe, it, expect } from "vitest";
import {
  DEFAULT_BUFFER_PERCENT,
  DEFAULT_VELOCITY_BY_ROLE,
  VELOCITY_WINDOW_SPRINTS,
  applyBuffer,
  computeCapacities,
  defaultCapacityFor,
  disciplineCapacity,
  membersByDiscipline,
  type TeamMemberCapacity,
} from "./capacityPolicy";
import type { OrgMemberRole } from "../../analyst/types";

function mkCapacity(
  role: OrgMemberRole,
  pointsPerSprint: number,
  overrides: Partial<TeamMemberCapacity> = {},
): TeamMemberCapacity {
  return {
    memberId: `m-${role}-${pointsPerSprint}`,
    fullName: `${role} member`,
    role,
    pointsPerSprint,
    isDefaultVelocity: false,
    ...overrides,
  };
}

describe("applyBuffer", () => {
  it("multiplies by percent / 100 and floors", () => {
    expect(applyBuffer(10, 80)).toBe(8);
    expect(applyBuffer(7, 80)).toBe(5); // 5.6 floors to 5, NEVER rounds up over budget
    expect(applyBuffer(100, 50)).toBe(50);
  });

  it("uses DEFAULT_BUFFER_PERCENT (80) when percent omitted", () => {
    expect(applyBuffer(10)).toBe(8);
    expect(DEFAULT_BUFFER_PERCENT).toBe(80);
  });

  it("returns 0 for non-positive input — no negative capacity", () => {
    expect(applyBuffer(0)).toBe(0);
    expect(applyBuffer(-5)).toBe(0);
  });
});

describe("disciplineCapacity", () => {
  it("sums pointsPerSprint across members of the same role + applies buffer", () => {
    const caps = [
      mkCapacity("developer", 10),
      mkCapacity("developer", 8),
      mkCapacity("ux", 5),
    ];
    // dev total raw = 18, 18 * 0.8 = 14.4, floor → 14
    expect(disciplineCapacity(caps, "developer")).toBe(14);
    // ux total raw = 5, 5 * 0.8 = 4
    expect(disciplineCapacity(caps, "ux")).toBe(4);
  });

  it("returns 0 when no members match the role", () => {
    expect(disciplineCapacity([mkCapacity("developer", 10)], "ux")).toBe(0);
  });

  it("respects a custom buffer percent", () => {
    const caps = [mkCapacity("developer", 10)];
    expect(disciplineCapacity(caps, "developer", 50)).toBe(5);
  });
});

describe("membersByDiscipline", () => {
  it("filters by role and preserves order", () => {
    const a = mkCapacity("developer", 10);
    const b = mkCapacity("ux", 5);
    const c = mkCapacity("developer", 8);
    expect(membersByDiscipline([a, b, c], "developer")).toEqual([a, c]);
  });

  it("returns an empty array when the discipline has no members", () => {
    expect(membersByDiscipline([mkCapacity("ux", 5)], "po")).toEqual([]);
  });
});

describe("defaultCapacityFor", () => {
  it("returns the role's default velocity and marks isDefaultVelocity", () => {
    const result = defaultCapacityFor({
      memberId: "m1",
      fullName: "Alice",
      role: "developer",
    });
    expect(result.pointsPerSprint).toBe(DEFAULT_VELOCITY_BY_ROLE.developer);
    expect(result.isDefaultVelocity).toBe(true);
    expect(result.role).toBe("developer");
  });

  it("returns different defaults per role", () => {
    expect(defaultCapacityFor({ memberId: "1", fullName: "x", role: "developer" }).pointsPerSprint).toBe(8);
    expect(defaultCapacityFor({ memberId: "2", fullName: "x", role: "ux" }).pointsPerSprint).toBe(5);
    expect(defaultCapacityFor({ memberId: "3", fullName: "x", role: "tester" }).pointsPerSprint).toBe(5);
    expect(defaultCapacityFor({ memberId: "4", fullName: "x", role: "po" }).pointsPerSprint).toBe(3);
  });
});

describe("computeCapacities", () => {
  const member = (userId: string, role: OrgMemberRole) => ({
    userId,
    fullName: `${userId} name`,
    role,
  });
  const sprint = (id: string, status: string, endDate: string) => ({
    id,
    status,
    endDate,
  });
  const doneColumn = { id: "col-done", isDone: true };
  const todoColumn = { id: "col-todo", isDone: false };

  it("returns [] for empty members list", () => {
    expect(
      computeCapacities({
        members: [],
        sprints: [],
        tickets: [],
        columns: [],
      }),
    ).toEqual([]);
  });

  it("returns defaults for everyone when no completed sprints exist", () => {
    const result = computeCapacities({
      members: [member("u1", "developer"), member("u2", "ux")],
      sprints: [sprint("s1", "active", "2026-01-01")],
      tickets: [],
      columns: [doneColumn],
    });
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.isDefaultVelocity)).toBe(true);
    expect(result[0].pointsPerSprint).toBe(DEFAULT_VELOCITY_BY_ROLE.developer);
    expect(result[1].pointsPerSprint).toBe(DEFAULT_VELOCITY_BY_ROLE.ux);
  });

  it("averages story points across the windowed completed sprints", () => {
    const result = computeCapacities({
      members: [member("u1", "developer")],
      sprints: [
        sprint("s1", "completed", "2026-01-15"),
        sprint("s2", "completed", "2026-02-15"),
      ],
      tickets: [
        {
          assigneeIds: ["u1"],
          columnId: doneColumn.id,
          sprintIds: ["s1"],
          storyPoints: 10,
        },
        {
          assigneeIds: ["u1"],
          columnId: doneColumn.id,
          sprintIds: ["s2"],
          storyPoints: 6,
        },
      ],
      columns: [doneColumn],
    });
    // 16 points over 2 sprints = 8/sprint
    expect(result[0].pointsPerSprint).toBe(8);
    expect(result[0].isDefaultVelocity).toBe(false);
  });

  it("ignores tickets in non-done columns (they didn't actually ship)", () => {
    const result = computeCapacities({
      members: [member("u1", "developer")],
      sprints: [sprint("s1", "completed", "2026-01-15")],
      tickets: [
        {
          assigneeIds: ["u1"],
          columnId: todoColumn.id, // not done
          sprintIds: ["s1"],
          storyPoints: 10,
        },
      ],
      columns: [doneColumn, todoColumn],
    });
    // No counted tickets → falls back to default.
    expect(result[0].isDefaultVelocity).toBe(true);
  });

  it("ignores tickets from sprints outside the velocity window", () => {
    // Window = 2, only the two most-recent completed sprints count.
    const result = computeCapacities({
      members: [member("u1", "developer")],
      sprints: [
        sprint("old", "completed", "2025-01-01"),
        sprint("s1", "completed", "2026-01-15"),
        sprint("s2", "completed", "2026-02-15"),
      ],
      tickets: [
        {
          assigneeIds: ["u1"],
          columnId: doneColumn.id,
          sprintIds: ["old"],
          storyPoints: 99, // huge but ancient
        },
      ],
      columns: [doneColumn],
      windowSize: 2,
    });
    // No counted tickets in window → default.
    expect(result[0].isDefaultVelocity).toBe(true);
  });

  it("falls back to default when computed velocity is zero", () => {
    const result = computeCapacities({
      members: [member("u1", "developer")],
      sprints: [sprint("s1", "completed", "2026-01-15")],
      tickets: [], // no tickets at all
      columns: [doneColumn],
    });
    expect(result[0].isDefaultVelocity).toBe(true);
    expect(result[0].pointsPerSprint).toBe(DEFAULT_VELOCITY_BY_ROLE.developer);
  });

  it("excludes tickets where the assignee isn't currently the member", () => {
    const result = computeCapacities({
      members: [member("u1", "developer")],
      sprints: [sprint("s1", "completed", "2026-01-15")],
      tickets: [
        {
          assigneeIds: ["u2"], // someone else
          columnId: doneColumn.id,
          sprintIds: ["s1"],
          storyPoints: 8,
        },
      ],
      columns: [doneColumn],
    });
    expect(result[0].isDefaultVelocity).toBe(true);
  });

  it("rounds the per-sprint average to an integer", () => {
    const result = computeCapacities({
      members: [member("u1", "developer")],
      sprints: [
        sprint("s1", "completed", "2026-01-15"),
        sprint("s2", "completed", "2026-02-15"),
        sprint("s3", "completed", "2026-03-15"),
      ],
      tickets: [
        {
          assigneeIds: ["u1"],
          columnId: doneColumn.id,
          sprintIds: ["s1"],
          storyPoints: 5,
        },
      ],
      columns: [doneColumn],
    });
    // 5 / 3 = 1.667 → rounds to 2
    expect(result[0].pointsPerSprint).toBe(2);
  });

  it("uses the configurable windowSize (default VELOCITY_WINDOW_SPRINTS)", () => {
    expect(VELOCITY_WINDOW_SPRINTS).toBeGreaterThan(0);
  });
});
