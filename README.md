# Orion: AI-Ops Orchestrator

Orion is a next-generation project management platform that leverages a multi-agent AI system to replace manual ticket grooming and planning. Unlike traditional tools, Orion doesn't just store tasks — it autonomously refines requirements, predicts edge cases, and optimizes team distribution based on real-time engineering constraints. It is built to be multi-tenant from the ground up, designed to serve thousands of concurrent teams while maintaining strict data isolation, predictable performance at scale, and a real-time collaborative experience.

---

## The Vision

Orion acts as an "Intelligent Jira." Instead of manually creating tickets, a user provides a high-level technical requirement. The system orchestrates specialized AI agents to decompose that requirement into a production-ready backlog, ensuring technical feasibility and realistic delivery dates.

### Why Orion is a Flagship Project

- **Senior-Level Logic**: Moves beyond simple CRUD into complex business logic, multi-tenant isolation, and AI orchestration.
- **Advanced State Management**: XState v5 manages non-linear, asynchronous AI workflows with explicit lifecycle states — no boolean flags.
- **Modern Data Layer**: GraphQL with cursor-based pagination, DataLoader query batching, and typed conflict result unions — designed for high-concurrency workloads without degradation.
- **Scalable Infrastructure**: Multi-tenant org isolation via Clerk Organizations, MongoDB compound indexes leading with `orgId`, architecture ready for horizontal scaling on AWS.
- **Collaborative UX**: Conflict detection shows users exactly what changed when two people edit simultaneously — not a silent overwrite, a field-level diff with Overwrite and Discard options.

---

## Architectural Foundations

### 1. Clean Architecture (Layered Design)

Strictly decoupled into three layers:

- **Domain Layer**: XState machines and TypeScript domain types. Zero React, zero framework, zero infrastructure imports.
- **Infrastructure Layer**: Adapters for GraphQL, MongoDB, DataLoaders, and AWS. All inbound/outbound payloads validated with Zod at the boundary.
- **Presentation Layer**: React components that reflect machine state and handle user events. Never coupled to low-level SDK details.

### 2. Multi-Tenant by Design (Clerk Organizations)

Every resource (Board, Column, Ticket, Version) is scoped to an `orgId` derived from the authenticated Clerk Organization session. Tenant isolation is enforced at the database query level — no query can physically return data outside the requesting org.

MongoDB compound indexes lead with `orgId` as the first key:
- `columns`: `{ orgId: 1, boardId: 1 }`
- `tickets`: `{ orgId: 1, boardId: 1, columnId: 1 }`

This is also the correct shard key strategy if the dataset ever warrants horizontal partitioning.

**Authentication approach**: Since the Next.js app and `/api/graphql` share the same origin, Clerk automatically includes the session cookie with every Apollo Client request. No manual `Authorization` headers are needed — `auth()` reads the cookie server-side in the Route Handler context. For cross-origin deployments (e.g. a separate mobile client), requests would pass the session token as a `Bearer` header using `getToken()` from `useAuth()`.

### 3. Event-Driven Orchestration

An XState machine acts as the single source of truth, coordinating when an agent starts, fails, or requires human intervention. Eliminates `isLoading`/`isError` boolean hell with explicit lifecycle states.

### 4. Collaborative Conflict Resolution

Tickets carry a `version` counter (optimistic concurrency). When two users edit the same ticket simultaneously:

1. Both clients read `version: 5`
2. User A saves first → version becomes `6`
3. User B saves → server finds `version: 5` no longer matches → returns `ConflictError`
4. `ConflictError` contains the full current document and `conflictedFields: ["description"]`
5. UI shows: *"Anna changed the description to: [new text]. Your change was not applied."* with Overwrite / Discard

Modelled as a typed GraphQL union `Ticket | ConflictError` — the client is forced to handle it explicitly.

### 5. Persistent Long-Running Sessions

AI tasks can take minutes. Orion synchronizes the frontend XState machine with a LangGraph backend, ensuring page refreshes never lose progress.

---

## Multi-Agent Workflow

- **The Analyst (Refinement Agent)**: Expands raw requirements — edge cases, technical caveats, context enrichment.
- **The Architect/PO (Planning Agent)**: Maps requirements to team structure (roles, velocity, sprint duration), generates typed ticket backlog with correct hierarchies (Epics / Stories / Tasks).
- **The Controller (Validation Agent)**: Audits the plan against delivery dates. If scope is unrealistic, triggers alerts and proposes a de-scoped alternative.

All AI proposals that materially affect scope, timeline, or risk require explicit human approval — modelled as `awaitingHumanApproval` states in the machine. No implicit auto-approval.

---

## The Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Auth & Orgs | Clerk Organizations |
| State | XState v5 |
| AI Backend | LangGraph |
| API | GraphQL (graphql-yoga) with DataLoader |
| Database | MongoDB Atlas (compound indexes, optimistic concurrency) |
| Infrastructure | AWS — ECS/Fargate or Lambda via OpenNext |
| Styling | TailwindCSS v4 |

---

## Engineering Standards

- **E2E Testing**: Playwright covering all critical branches — approve, reject, conflict, deadline risk.
- **Scalability Without Raw Power**: Correct indexing strategy, cursor-based pagination (not offset), DataLoader batching — not hardware.
- **Type Safety**: Strict TypeScript end-to-end. `any` is not allowed. Zod validates every external boundary.
- **Human-in-the-Loop**: No AI decision affecting scope or timeline is auto-approved. Every critical path has an explicit approval state.

---

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.local.example .env.local
# Fill in CLERK_* keys and MONGODB_URI

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.
GraphiQL playground available at [http://localhost:3000/api/graphql](http://localhost:3000/api/graphql) in development.
