<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Orion Architecture Contract

Orion is an AI-Ops orchestration platform ("Intelligent Jira") based on three collaborating agents:

- Analyst (Refinement): expands requirements, edge cases, technical caveats.
- Architect/PO (Planning): maps refined requirements to velocity, roles, tickets, and epics.
- Controller (Validation): audits realism against deadline/scope and emits risk or de-scope recommendations.

All feature work must prioritize senior-level quality, clean layering, and runtime performance.

## Non-Negotiable Engineering Rules

### 1) Architecture First: Domain State Machine Before UI

Every new module starts in the Domain layer by defining:

- XState machine states.
- Events and transitions.
- Context schema and invariants.
- Guards/actions/services contracts (as typed interfaces).

Do not start with React components or API wiring. Avoid status booleans such as `isLoading`, `isError`, and `isSuccess` when explicit machine states are required.

### 2) Clean Architecture Boundaries

- Domain layer: pure TypeScript domain model (machines, types, policies, invariants). No React, framework, transport, or SDK imports.
- Infrastructure layer: adapters for GraphQL, Vercel AI SDK, LangGraph runtime integration, AWS, and persistence. Depends on domain contracts, never the inverse.
- Presentation layer: Next.js App Router components, hooks, and UI composition. Consumes domain machine APIs and infrastructure adapters via interfaces.

Never couple presentation code directly to low-level SDK details when an adapter boundary is expected.

### 3) Human-in-the-Loop Is Mandatory

AI proposals that materially affect scope, timeline, risk, or ticket structure must pass through explicit approval states. A machine must represent:

- Awaiting approval.
- Approved path.
- Rejected/revise path.

No implicit auto-approval for critical planning decisions.

### 4) Type Safety and Validation

- Use strict TypeScript types end-to-end.
- `any` is not allowed in application code.
- Use Zod for runtime validation at boundaries (GraphQL responses, AI payloads, external events).
- Keep GraphQL operations and domain contracts strongly typed.

### 5) Performance and UX Quality

- Optimize for Core Web Vitals from day one.
- Use App Router streaming and Suspense where data latency exists.
- Keep server/client boundaries intentional; avoid unnecessary client hydration.
- Prefer incremental rendering for long-running agent operations.

### 6) Testing Requirements

- Playwright E2E is mandatory for mission-critical user journeys.
- Controller alert and de-scope flows require E2E coverage.
- Feature completion is blocked if approval and rejection branches are not tested for critical AI decisions.

## Standard Feature Implementation Workflow

Apply this sequence in order:

1. Machine Definition (Domain): states, events, transitions, context, invariants.
2. Domain Contracts: typed guards/actions/services interfaces and policies.
3. Infrastructure Adapters: GraphQL/LangGraph/AI/AWS integration behind interfaces.
4. Presentation Composition: React components/hooks driven by machine state, not ad-hoc booleans.
5. E2E Scenarios: happy path, rejection/revision path, deadline/scope risk path (when applicable).

## Definition of Done (Per Feature Module)

- XState machine exists in Domain layer with explicit lifecycle states.
- Human-approval transitions are modeled where AI decisions require user confirmation.
- Domain contains no React/framework/infrastructure dependencies.
- Infrastructure adapters validate inbound/outbound payloads with Zod at boundaries.
- Presentation uses machine state as single source of truth.
- Playwright specs cover critical branches (at minimum: approve + reject/revise for AI-driven decision points).
- No type escapes (`any`, unsafe casts without justification).

## Target Module Blueprint

Use this structure for new feature slices:

- `src/domain/<feature>/machine/*`
- `src/domain/<feature>/types/*`
- `src/domain/<feature>/policies/*`
- `src/infrastructure/<feature>/*`
- `src/presentation/<feature>/*`
- `tests/e2e/<feature>/*.spec.ts`

Naming conventions:

- States: explicit lifecycle names (e.g., `researching`, `refining`, `awaitingHumanApproval`, `approved`, `rejected`, `failed`).
- Events: imperative domain events (e.g., `RESEARCH_COMPLETED`, `REFINEMENT_COMPLETED`, `HUMAN_APPROVED`, `HUMAN_REJECTED`, `RETRY`).
- Avoid boolean status flags for lifecycle representation.

## First Slice Kickoff Spec (Analyst Flow)

First implementation target is the Analyst refinement cycle with explicit human approval.

Recommended state progression:

`idle -> researching -> refining -> awaitingHumanApproval -> approved | rejected`

Suggested minimum events:

- `START_RESEARCH`
- `RESEARCH_COMPLETED`
- `RESEARCH_FAILED`
- `REFINEMENT_COMPLETED`
- `REFINEMENT_FAILED`
- `HUMAN_APPROVED`
- `HUMAN_REJECTED`
- `REVISION_REQUESTED`
- `RETRY`

Core invariants:

- Transition to `approved` is only possible from `awaitingHumanApproval`.
- `HUMAN_REJECTED` must keep an auditable rejection reason in machine context.
- `RETRY` can only be triggered from failure or rejected/revision states.
- Any externally sourced refinement payload must pass Zod validation before entering domain context.
