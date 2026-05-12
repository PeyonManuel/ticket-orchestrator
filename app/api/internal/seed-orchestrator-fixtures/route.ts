/**
 * Dev fixtures endpoint — seeds an org with historical orchestrator data so the
 * Phase 4 planner has realistic per-member velocity to compute against.
 *
 * What it creates:
 *   - A board named "{boardName} (Seeded)" (default: "Orion Demo (Seeded)")
 *   - Standard columns including a `Done` column flagged `isDone: true`
 *   - Functional roles set on the org's Clerk members, cycled through the
 *     {developer×N, ux, tester, po} pattern so every discipline is represented
 *   - 6 completed 2-week sprints over the past ~12 weeks, each with 5–8 tickets
 *     in the Done column, distributed across members by their discipline
 *   - 1 active 2-week sprint (current window)
 *   - 1 upcoming `planning` sprint (next 2 weeks)
 *
 * Auth: shared secret in the `X-Seed-Secret` header. Set `SEED_SECRET` in env.
 *
 * Idempotent: if a board with the seeded suffix already exists for this org,
 * the route returns 200 and reports the existing board's id without re-seeding.
 *
 * Trigger: manual `curl -X POST` from a dev machine.
 */
import { NextResponse, type NextRequest } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import {
  createBoard,
  createColumn,
  createSprint,
  createTicket,
  getBoards,
  setMemberRole,
  updateSprint,
} from "@/infrastructure/persistence/repository";
import { logger } from "@/infrastructure/observability/logger";
import type { OrgMemberRole } from "@/domain/analyst";
import { DEFAULT_COLUMN_DEFINITIONS } from "@/domain/analyst/types";

const SEED_SUFFIX = " (Seeded)";
const DEFAULT_BOARD_NAME = "Orion Demo";
const SPRINT_LENGTH_DAYS = 14;
const COMPLETED_SPRINT_COUNT = 6;
const TICKETS_PER_COMPLETED_SPRINT_MIN = 5;
const TICKETS_PER_COMPLETED_SPRINT_MAX = 8;
const STORY_POINT_OPTIONS = [1, 2, 3, 5] as const;
type SeedStoryPoints = (typeof STORY_POINT_OPTIONS)[number];

/** Cycled across Clerk members so every discipline is represented. */
const ROLE_CYCLE: OrgMemberRole[] = [
  "developer",
  "developer",
  "developer",
  "ux",
  "tester",
  "po",
];

const TITLE_TEMPLATES: Array<{ role: OrgMemberRole; titles: string[] }> = [
  {
    role: "developer",
    titles: [
      "Wire Apollo cache for ticket reordering",
      "Add Mongo index on (orgId, ticketNumber)",
      "Patch GraphQL schema with versioned UpdateTicketInput",
      "Refactor BoardContext into data/actions split",
      "Server-side pagination for tickets query",
      "Introduce DataLoader for comment fetches",
      "Migrate column drag-and-drop to dnd-kit",
      "Add resolver auth guard around mutations",
    ],
  },
  {
    role: "ux",
    titles: [
      "Audit Phase 2 backlog UI for keyboard nav",
      "Spec the empty-state for the orchestrator picker",
      "Design Phase 4 capacity panel mock",
      "Refresh ticket modal information architecture",
      "Iterate on overflow-callout visual treatment",
    ],
  },
  {
    role: "tester",
    titles: [
      "Playwright spec for sprint commit happy path",
      "Add E2E coverage for conflict resolution UI",
      "Smoke test for orchestrator phase transitions",
      "Regression suite for backlog-view drag/drop",
      "Test seed: verify capacityProvider velocity math",
    ],
  },
  {
    role: "po",
    titles: [
      "Spike: enumerate Phase 5 inspector chat use cases",
      "Define commit-freeze policy for release weeks",
      "Stakeholder review of orchestrator roadmap",
      "Draft go-to-market for orchestrator beta",
    ],
  },
];

function pickStoryPoints(): SeedStoryPoints {
  return STORY_POINT_OPTIONS[Math.floor(Math.random() * STORY_POINT_OPTIONS.length)];
}

function pickTitle(role: OrgMemberRole, indexHint: number): string {
  const bucket = TITLE_TEMPLATES.find((t) => t.role === role);
  if (!bucket || bucket.titles.length === 0) return "Untitled work";
  return bucket.titles[indexHint % bucket.titles.length];
}

function isoDate(d: Date): string {
  return d.toISOString();
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export async function POST(req: NextRequest) {
  const expected = process.env.SEED_SECRET;
  if (!expected) {
    logger.error("seed", "SEED_SECRET not configured — refusing to run");
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  const provided = req.headers.get("x-seed-secret");
  if (provided !== expected) {
    logger.warn("seed", "rejected request with bad/missing secret");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  type Body = { orgId?: string; boardName?: string };
  const body = (await req.json().catch(() => ({}))) as Body;
  const orgId = body.orgId?.trim();
  if (!orgId) {
    return NextResponse.json({ error: "orgId_required" }, { status: 400 });
  }
  const baseName = body.boardName?.trim() || DEFAULT_BOARD_NAME;
  const seededBoardName = `${baseName}${SEED_SUFFIX}`;

  // ── Idempotency check ───────────────────────────────────────────────
  const existing = await getBoards(orgId);
  const alreadySeeded = existing.find((b) => b.name === seededBoardName);
  if (alreadySeeded) {
    logger.info("seed", "already seeded — skipping", { orgId, boardId: alreadySeeded.id });
    return NextResponse.json({
      status: "already_seeded",
      orgId,
      boardId: alreadySeeded.id,
      boardName: alreadySeeded.name,
    });
  }

  // ── Pull Clerk members for the org ──────────────────────────────────
  const client = await clerkClient();
  const { data: memberships } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    limit: 100,
  });
  const members = memberships
    .map((m) => m.publicUserData)
    .filter((u): u is NonNullable<typeof u> => u !== null && u !== undefined)
    .map((u) => ({
      userId: u.userId,
      fullName: [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.identifier || u.userId,
    }));

  if (members.length === 0) {
    return NextResponse.json(
      { error: "no_org_members", message: "Add members to the Clerk org first." },
      { status: 400 },
    );
  }

  // Assign disciplines cyclically. Persist via setMemberRole.
  const assignedMembers = members.map((m, i) => ({
    ...m,
    role: ROLE_CYCLE[i % ROLE_CYCLE.length],
  }));
  await Promise.all(
    assignedMembers.map((m) => setMemberRole(orgId, m.userId, m.role)),
  );

  // ── Board + columns ─────────────────────────────────────────────────
  const board = await createBoard(orgId, { name: seededBoardName, type: "scrum" });
  const columns = await Promise.all(
    DEFAULT_COLUMN_DEFINITIONS.map((c, i) =>
      createColumn(orgId, {
        boardId: board.id,
        name: c.name,
        states: c.states,
        color: i === 0 ? "#9ca3af" : i === DEFAULT_COLUMN_DEFINITIONS.length - 1 ? "#10b981" : "#3b82f6",
        order: i,
        isDone: c.isDone,
        protected: c.name === "Backlog" || c.name === "Ready",
      }),
    ),
  );
  const doneColumn = columns.find((c) => c.isDone);
  const backlogColumn = columns[0];
  if (!doneColumn) {
    return NextResponse.json({ error: "missing_done_column" }, { status: 500 });
  }

  // ── Sprints ─────────────────────────────────────────────────────────
  // Window: COMPLETED_SPRINT_COUNT completed sprints behind us, 1 active spanning
  // today, 1 upcoming planning sprint. All 2-week cadence.
  const completedSprints: Array<{ id: string; index: number }> = [];
  for (let i = COMPLETED_SPRINT_COUNT; i >= 1; i--) {
    const start = daysAgo(SPRINT_LENGTH_DAYS * (i + 1));
    const end = daysAgo(SPRINT_LENGTH_DAYS * i + 1);
    const sprint = await createSprint(orgId, {
      boardId: board.id,
      name: `${baseName} ${COMPLETED_SPRINT_COUNT - i + 1}`,
      goal: `Past sprint ${COMPLETED_SPRINT_COUNT - i + 1} — completed work seeded for velocity history`,
      startDate: isoDate(start),
      endDate: isoDate(end),
      capacityPoints: 0,
    });
    await updateSprint(orgId, sprint.id, { status: "completed" });
    completedSprints.push({ id: sprint.id, index: COMPLETED_SPRINT_COUNT - i + 1 });
  }

  const activeStart = daysAgo(SPRINT_LENGTH_DAYS - 3);
  const activeEnd = daysAgo(-3); // 3 days from today
  const activeSprint = await createSprint(orgId, {
    boardId: board.id,
    name: `${baseName} ${COMPLETED_SPRINT_COUNT + 1}`,
    goal: "Current in-flight sprint",
    startDate: isoDate(activeStart),
    endDate: isoDate(activeEnd),
    capacityPoints: 0,
  });
  await updateSprint(orgId, activeSprint.id, { status: "active" });

  const upcomingStart = daysAgo(-4);
  const upcomingEnd = daysAgo(-4 - SPRINT_LENGTH_DAYS);
  // daysAgo(-X) returns X days in the future; ensure end > start
  const upcomingSprint = await createSprint(orgId, {
    boardId: board.id,
    name: `${baseName} ${COMPLETED_SPRINT_COUNT + 2}`,
    goal: "Upcoming planning sprint",
    startDate: isoDate(upcomingStart),
    endDate: isoDate(daysAgo(-(4 + SPRINT_LENGTH_DAYS))),
    capacityPoints: 0,
  });
  void upcomingEnd; // computed above directly; kept for readability

  // ── Tickets in completed sprints (Done column) ──────────────────────
  const createdTicketIds: string[] = [];
  for (const sprint of completedSprints) {
    const ticketCount =
      TICKETS_PER_COMPLETED_SPRINT_MIN +
      Math.floor(
        Math.random() *
          (TICKETS_PER_COMPLETED_SPRINT_MAX - TICKETS_PER_COMPLETED_SPRINT_MIN + 1),
      );
    for (let i = 0; i < ticketCount; i++) {
      // Pick discipline distribution: 60% dev, 20% ux, 15% tester, 5% po
      const r = Math.random();
      const discipline: OrgMemberRole =
        r < 0.6 ? "developer" : r < 0.8 ? "ux" : r < 0.95 ? "tester" : "po";
      const candidates = assignedMembers.filter((m) => m.role === discipline);
      if (candidates.length === 0) continue;
      const assignee = candidates[(sprint.index + i) % candidates.length];
      const sp = pickStoryPoints();
      const title = pickTitle(discipline, sprint.index * 7 + i);

      const ticket = await createTicket(orgId, assignee.userId, {
        boardId: board.id,
        columnId: doneColumn.id,
        hierarchyType: i === 0 ? "story" : "task",
        parentTicketId: null,
        title,
        description: `Seeded ${discipline} ticket from past sprint ${sprint.index}.`,
        label: discipline === "developer" ? "backend" : discipline === "ux" ? "ux" : discipline === "tester" ? "qa" : "planning",
        fixVersion: "",
        workflowState: doneColumn.states[0] ?? "ready",
        priority: "medium",
        storyPoints: sp,
        assigneeIds: [assignee.userId],
        sprintIds: [sprint.id],
      });
      createdTicketIds.push(ticket.id);
    }
  }

  // A couple of in-flight tickets on the active sprint (in Backlog column) so
  // capacityProvider sees the active sprint contains real ticket work too.
  for (let i = 0; i < 3; i++) {
    const discipline: OrgMemberRole = i === 0 ? "developer" : i === 1 ? "ux" : "tester";
    const candidates = assignedMembers.filter((m) => m.role === discipline);
    if (candidates.length === 0) continue;
    const assignee = candidates[0];
    const ticket = await createTicket(orgId, assignee.userId, {
      boardId: board.id,
      columnId: backlogColumn.id,
      hierarchyType: "task",
      parentTicketId: null,
      title: `Active-sprint ${discipline} work item ${i + 1}`,
      description: `Seeded in-flight ticket on the active sprint.`,
      label: discipline === "developer" ? "frontend" : discipline === "ux" ? "ux" : "qa",
      fixVersion: "",
      workflowState: backlogColumn.states[0] ?? "backlog",
      priority: "medium",
      storyPoints: 3,
      assigneeIds: [assignee.userId],
      sprintIds: [activeSprint.id],
    });
    createdTicketIds.push(ticket.id);
  }

  logger.info("seed", "fixtures created", {
    orgId,
    boardId: board.id,
    members: assignedMembers.length,
    completedSprints: completedSprints.length,
    tickets: createdTicketIds.length,
  });

  return NextResponse.json({
    status: "seeded",
    orgId,
    boardId: board.id,
    boardName: board.name,
    members: assignedMembers.map((m) => ({ userId: m.userId, fullName: m.fullName, role: m.role })),
    sprints: {
      completed: completedSprints.length,
      active: 1,
      upcoming: 1,
      activeSprintId: activeSprint.id,
      upcomingSprintId: upcomingSprint.id,
    },
    ticketsCreated: createdTicketIds.length,
  });
}

// Block accidental browser hits.
export async function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
