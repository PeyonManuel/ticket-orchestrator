/**
 * Mock implementations of the three orchestrator agents.
 *
 * Same function signatures as the future LangGraph adapters — when the
 * Python backend lands, only the bodies of these three functions change.
 *
 * Behavior:
 *  - 600–1400ms simulated latency so loading states render.
 *  - Light templating against user input so the demo feels responsive.
 *  - Brainstorm summary lands when the user has sent ≥ 2 messages OR types
 *    a "ready" cue ("structure", "ready", "continue", "let's go").
 *
 * Architecture overview: docs/orchestrator/architecture.md
 */

import type {
  AnalystTurnInput,
  AnalystTurnOutput,
  ArchitectInput,
  ArchitectOutput,
  BacklogProposal,
  BlueprintChatInput,
  BlueprintChatOutput,
  BrainstormSummary,
  ControllerInput,
  ControllerOutput,
  PlannerChatInput,
  PlannerChatOutput,
  PlannerInput,
  PlannerOutput,
  ProposalLabel,
  ProposalStoryPoints,
  RefinementChatInput,
  RefinementChatOutput,
  TicketProposal,
} from "@/domain/orchestrator/types";
import { defaultCapacityFor } from "@/domain/orchestrator/policies/capacityPolicy";
import { produceSprintPlan } from "@/domain/orchestrator/policies/slicingPolicy";

const MIN_LATENCY_MS = 600;
const MAX_LATENCY_MS = 1400;

const READY_CUES = [
  "structure",
  "ready",
  "continue",
  "let's go",
  "lets go",
  "go ahead",
];

function delay(): Promise<void> {
  const ms =
    MIN_LATENCY_MS +
    Math.floor(Math.random() * (MAX_LATENCY_MS - MIN_LATENCY_MS));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function uid(prefix: string): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    "randomUUID" in globalThis.crypto
  ) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function userTurnCount(transcript: AnalystTurnInput["transcript"]): number {
  return transcript.filter((t) => t.role === "user").length;
}

function userSaidReady(message: string): boolean {
  const lower = message.toLowerCase();
  return READY_CUES.some((cue) => lower.includes(cue));
}

function extractKeywords(text: string): string[] {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "with",
    "without",
    "to",
    "of",
    "for",
    "on",
    "in",
    "at",
    "is",
    "are",
    "be",
    "been",
    "being",
    "this",
    "that",
    "these",
    "those",
    "i",
    "we",
    "you",
    "they",
    "it",
    "from",
    "as",
    "by",
    "into",
    "my",
    "our",
    "need",
    "needs",
    "want",
    "wants",
    "should",
    "would",
    "could",
    "can",
    "will",
    "let",
    "lets",
    "just",
    "also",
    "really",
    "make",
    "build",
    "create",
    "add",
    "feature",
    "story",
    "epic",
    "app",
    "application",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .slice(0, 8);
}

// ─── Analyst ────────────────────────────────────────────────────────

export async function runAnalystTurn(
  input: AnalystTurnInput,
): Promise<AnalystTurnOutput> {
  await delay();

  const userTurns = userTurnCount(input.transcript) + 1; // +1 for the just-sent message
  const ready = userSaidReady(input.userMessage) || userTurns >= 3;

  if (!ready) {
    // Dialogue ramps from "tell me more" → "what's out of scope" by turn count.
    const replies = [
      `Got it. Could you walk me through who the primary user is and what they're trying to accomplish? Even a one-liner helps me set the right ambition for this Epic.`,
      `Helpful — I want to make sure we don't over-build. What's explicitly out of scope for the first version? And is there a hard deadline I should plan around?`,
    ];
    const reply = replies[Math.min(userTurns - 1, replies.length - 1)];
    return { reply, summary: null };
  }

  // Build a summary from what the user has said so far.
  const allUserText = [
    ...input.transcript.filter((t) => t.role === "user").map((t) => t.text),
    input.userMessage,
  ].join(" ");

  const keywords = extractKeywords(allUserText);
  const headline = keywords.length
    ? `An Epic to deliver ${keywords.slice(0, 3).join(", ")} for the team.`
    : `An Epic capturing the requirements you outlined.`;

  const summary: BrainstormSummary = {
    summary: `${headline} The goal is to ship a focused first version that proves the core flow end-to-end without over-engineering. We'll defer integrations and admin tooling until after a working slice exists.`,
    goals: [
      "Deliver the primary user-facing flow end-to-end",
      "Establish data contracts and persistence so future iterations don't churn",
      "Ship behind a feature flag with telemetry to validate adoption",
    ],
    outOfScope: [
      "Mobile-specific UX — desktop only for v1",
      "Admin / back-office tooling",
      "Bulk import or migration tools",
    ],
  };

  return {
    reply: `Great — I think I have enough to draft a structure. I've summarized the goals and what we're explicitly leaving out. When you're ready, hit "Continue to backlog" and the Architect will propose the ticket breakdown.`,
    summary,
  };
}

// ─── Architect ──────────────────────────────────────────────────────

const TICKET_TEMPLATES: Array<{
  hierarchyType: "story" | "task";
  title: (kw: string) => string;
  oneLiner: (kw: string) => string;
  label: ProposalLabel;
}> = [
  {
    hierarchyType: "story",
    title: (kw) => `Define data model for ${kw || "the feature"}`,
    oneLiner: () => "Set up the core schema and validation layer.",
    label: "backend",
  },
  {
    hierarchyType: "task",
    title: () => "Add API endpoints for create / list / update",
    oneLiner: () => "Wire GraphQL schema, resolvers, and Zod validation.",
    label: "api",
  },
  {
    hierarchyType: "story",
    title: (kw) => `Build primary UI for ${kw || "the user flow"}`,
    oneLiner: () => "List + detail + create form with optimistic updates.",
    label: "frontend",
  },
  {
    hierarchyType: "task",
    title: () => "Add empty / loading / error states",
    oneLiner: () =>
      "Cover the three boundary states explicitly, no spinners over content.",
    label: "ux",
  },
  {
    hierarchyType: "task",
    title: () => "Persist user preferences across sessions",
    oneLiner: () => "Store the relevant client-side state per user.",
    label: "frontend",
  },
  {
    hierarchyType: "story",
    title: () => "Add observability and structured logs",
    oneLiner: () => "Log key transitions with correlation IDs for debugging.",
    label: "observability",
  },
  {
    hierarchyType: "task",
    title: () => "Write E2E tests for the happy path and a failure path",
    oneLiner: () => "Playwright coverage required by the engineering contract.",
    label: "qa",
  },
  {
    hierarchyType: "task",
    title: () => "Wire feature flag + rollout plan",
    oneLiner: () => "Default off; enable for the org running the pilot.",
    label: "infra",
  },
];

export async function runArchitectBacklog(
  input: ArchitectInput,
): Promise<ArchitectOutput> {
  await delay();

  const keywords = extractKeywords(
    [input.summary.summary, ...input.summary.goals].join(" "),
  );
  const primaryKeyword = keywords[0] ?? "the feature";

  const tickets: TicketProposal[] = TICKET_TEMPLATES.map((tpl) => ({
    id: uid("prop"),
    hierarchyType: tpl.hierarchyType,
    title: tpl.title(primaryKeyword),
    oneLiner: tpl.oneLiner(primaryKeyword),
    description: "",
    label: tpl.label,
    acceptanceCriteria: [],
    storyPoints: null,
    risks: [],
    refined: false,
    transcript: [],
  }));

  const epicTitle = primaryKeyword
    ? `Epic — ${primaryKeyword[0].toUpperCase()}${primaryKeyword.slice(1)}`
    : "Untitled Epic";

  const backlog: BacklogProposal = {
    epicTitle,
    epicDescription: input.summary.summary,
    tickets,
  };

  return backlog;
}

// ─── Controller ─────────────────────────────────────────────────────

const STORY_POINTS_BY_LABEL: Record<ProposalLabel, ProposalStoryPoints> = {
  frontend: 3,
  backend: 5,
  api: 3,
  qa: 2,
  ux: 2,
  ai: 8,
  infra: 3,
  devops: 3,
  security: 5,
  observability: 2,
};

const RISK_TEMPLATES: Record<ProposalLabel, string[]> = {
  frontend: [
    "Render performance regressions in the topbar/board if context split is bypassed.",
  ],
  backend: [
    "Schema migration on a hot collection — coordinate with multi-tenant deploys.",
  ],
  api: [
    "GraphQL schema breaking change — needs operations.ts + Apollo cache update.",
  ],
  qa: [
    "E2E flake from XState async transitions if loading states aren't waited on.",
  ],
  ux: [
    "Interaction-triggered animation must stay under 300ms per Animation Contract.",
  ],
  ai: ["Prompt drift; needs evals before LangGraph wiring lands."],
  infra: [
    "Feature flag default must be OFF in production; verify rollout plan.",
  ],
  devops: ["Pipeline change on the main branch could block other merges."],
  security: [
    "Auth/permission boundary — review with the security guild before merge.",
  ],
  observability: [
    "Log volume — sample at the right rate to avoid noisy alerts.",
  ],
};

export async function runControllerRefinement(
  input: ControllerInput,
): Promise<ControllerOutput> {
  await delay();

  const { ticket } = input;
  const points: ProposalStoryPoints =
    ticket.storyPoints ?? STORY_POINTS_BY_LABEL[ticket.label] ?? 3;

  const description =
    ticket.description ||
    `${ticket.oneLiner || ticket.title}\n\nThis ticket is part of the "${input.backlog.epicTitle}" Epic. Implement against the contract defined in ${ticket.label === "frontend" ? "the presentation layer" : ticket.label === "backend" ? "the persistence + repository layer" : "the relevant module"}, keeping the engineering rules (typed, multi-tenant scoped, no booleans for lifecycle state) in mind.`;

  const acceptanceCriteria = ticket.acceptanceCriteria.length
    ? ticket.acceptanceCriteria
    : [
        `Given the user is in the relevant flow, when they complete the action, then the change is persisted and visible across reloads.`,
        `The implementation must not introduce any \`any\` casts or boolean lifecycle flags.`,
        `Loading and error states render explicitly without spinners over content.`,
      ];

  const risks = ticket.risks.length
    ? ticket.risks
    : (RISK_TEMPLATES[ticket.label] ?? [
        "No major risks identified at this stage.",
      ]);

  return {
    description,
    acceptanceCriteria,
    storyPoints: points,
    risks,
  };
}

// ─── Blueprint Chat (Phase 2) ────────────────────────────────────────

export async function runBlueprintChat(
  input: BlueprintChatInput,
): Promise<BlueprintChatOutput> {
  await delay();

  const lower = input.userMessage.toLowerCase();
  const isChanging = ["add", "remove", "split", "change", "modify", "delete", "replace", "update"].some(
    (w) => lower.includes(w),
  );
  const isQuestion = lower.includes("?") || ["what", "why", "how", "when", "should", "can", "would"].some(
    (w) => lower.startsWith(w),
  );
  const ticketCount = input.currentBacklog.tickets.length;

  if (isQuestion) {
    return {
      reply: `Good question. The current structure of ${ticketCount} tickets prioritises the critical path — data model and API contracts before UI. If you have different sequencing priorities, you can reorder tickets directly in the list, or tell me what outcome you're trying to optimise for and I can suggest a restructure.`,
    };
  }

  if (isChanging) {
    return {
      reply: `Understood. You can edit any ticket directly in the list on the left — title, label, and order are all inline. If you'd like me to propose a structural change (split a story, merge two tasks, add a missing concern), describe it and I'll outline the approach.`,
    };
  }

  return {
    reply: `The backlog looks well-structured for a first increment. If anything feels over-scoped for v1, flag it and we can carve out a thinner slice before moving to Deep Dive.`,
  };
}

// ─── Sprint Planner ──────────────────────────────────────────────────

/**
 * Mock sprint planner — delegates to the pure `produceSprintPlan` policy so the
 * mock and the future real backend share the same algorithm. Capacities flow in
 * via `input.capacities` (computed from real velocity history by the presentation
 * layer or, server-side, by `capacityProvider`). Falls back to per-member
 * cold-start defaults only when the caller omits capacities entirely.
 */
export async function runSprintPlanner(
  input: PlannerInput,
): Promise<PlannerOutput> {
  await delay();

  const { backlog, sprints, members, capacities } = input;

  const resolvedCapacities =
    capacities.length > 0
      ? capacities
      : members.map((m) =>
          defaultCapacityFor({
            memberId: m.userId,
            fullName: m.fullName,
            role: m.role,
          }),
        );

  const { plan } = produceSprintPlan({
    backlog,
    sprints,
    capacities: resolvedCapacities,
  });
  return plan;
}

export async function runPlannerChat(
  input: PlannerChatInput,
): Promise<PlannerChatOutput> {
  await delay();

  const { userMessage, currentPlan, backlog, members } = input;
  const lower = userMessage.toLowerCase();

  if (lower.includes("move") || lower.includes("assign") || lower.includes("reassign")) {
    return {
      reply:
        "I've noted your adjustment. To apply ticket reassignments, you can edit the assignments directly in the plan view. I can help explain trade-offs or suggest alternatives if you describe the constraint.",
      updatedPlan: null,
    };
  }

  if (lower.includes("capacity") || lower.includes("overloaded") || lower.includes("too many")) {
    const overloaded = input.sprints.filter(
      (s) =>
        currentPlan.assignments
          .filter((a) => a.sprintId === s.id)
          .reduce((sum, a) => {
            const t = backlog.tickets.find((tk) => tk.id === a.ticketId);
            return sum + (t?.storyPoints ?? 3);
          }, 0) > s.capacityPoints,
    );
    if (overloaded.length > 0) {
      return {
        reply: `Sprint(s) ${overloaded.map((s) => s.name).join(", ")} are over capacity. I'd recommend moving lower-priority tickets to later sprints or reducing scope. Would you like me to rebalance automatically?`,
        updatedPlan: null,
      };
    }
    return {
      reply:
        "All sprints are within their story-point capacity based on the current allocation. Each team member's workload looks balanced by role.",
      updatedPlan: null,
    };
  }

  if (lower.includes("unassigned") || lower.includes("no assignee")) {
    const unassigned = currentPlan.assignments.filter((a) => !a.assigneeUserId);
    return {
      reply:
        unassigned.length > 0
          ? `${unassigned.length} ticket(s) are unassigned because no team member with the matching role was available. You can manually assign them or add team members with the appropriate roles.`
          : "All tickets have been assigned to a team member.",
      updatedPlan: null,
    };
  }

  const memberNames = members.map((m) => m.fullName).join(", ");
  return {
    reply: `The current plan distributes ${backlog.tickets.length} tickets across ${input.sprints.length} sprint(s) with team members: ${memberNames || "none assigned"}. ${currentPlan.reasoning} Let me know if you'd like to adjust priorities, redistribute work, or change sprint assignments.`,
    updatedPlan: null,
  };
}

// ─── Refinement Chat (Phase 3) ───────────────────────────────────────

export async function runRefinementChat(
  input: RefinementChatInput,
): Promise<RefinementChatOutput> {
  await delay();

  const lower = input.userMessage.toLowerCase();
  const { ticket } = input;

  const wantsPoints = lower.includes("point") || lower.includes("estimate") || lower.includes("complex") || lower.includes("effort");
  const wantsAc = lower.includes("acceptance") || lower.includes("criteria") || lower.includes("criterion") || lower.includes(" ac ");
  const wantsRisk = lower.includes("risk") || lower.includes("concern") || lower.includes("danger");
  const wantsDesc = lower.includes("description") || lower.includes("scope") || lower.includes("what does");

  if (wantsPoints) {
    const suggested = Math.min((ticket.storyPoints ?? 3) + 2, 13);
    return {
      reply: `The Controller estimated ${ticket.storyPoints ?? "null"} points for "${ticket.title}" based on the ${ticket.label} label. If the integration complexity or unknowns make it feel larger, ${suggested} would be defensible — edit the field directly and I'll incorporate it in the summary.`,
    };
  }

  if (wantsAc) {
    return {
      reply: `Good acceptance criteria for "${ticket.title}" should cover: the happy-path end-to-end, at least one explicit failure/error state, and a guard against the most likely edge case (e.g. empty list, concurrent update, auth boundary). Paste your specific requirement and I can help phrase it as a testable Given/When/Then.`,
    };
  }

  if (wantsRisk) {
    const risks = ticket.risks.length
      ? ticket.risks.join("; ")
      : "none flagged yet";
    return {
      reply: `Current risks for this ticket: ${risks}. If you see additional concerns — especially around integrations, data migration, or multi-tenant edge cases — add them to the risks list and the Controller will factor them into the final plan.`,
    };
  }

  if (wantsDesc) {
    return {
      reply: `"${ticket.title}" covers: ${ticket.oneLiner || ticket.description.slice(0, 120) || "see the description above"}. If the scope feels ambiguous, adding a tight one-liner often clarifies the boundary and prevents over-building.`,
    };
  }

  return {
    reply: `"${ticket.title}" looks well-scoped to me. If there's a specific trade-off you're wrestling with — implementation approach, testing strategy, or dependency on another ticket — I'm happy to dig in.`,
  };
}
