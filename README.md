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

The board view uses **Apollo Client's normalized cache as the source of truth** for tickets, columns, boards, and versions — refetching, optimistic updates, and cache eviction are handled natively. **XState v5 is reserved for the AI agent flow** (Analyst → Architect → Controller), where multi-step lifecycles with human-in-the-loop approvals genuinely require explicit states (`researching`, `awaitingHumanApproval`, `rejected`, …) — eliminating `isLoading`/`isError` boolean hell exactly where it matters.

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
| State | Apollo Client (board data) + XState v5 (AI flow) |
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

---

## 💡 Future Demo Idea: Local AI Dev Swarm

> **Remind me to set this up before any final portfolio presentation.**

The idea: run a local swarm of AI agents that simulate a real dev team actively using Orion in real time — so any visitor watching the live app sees the board moving, tickets updating, comments appearing, conflicts resolving, and the Orchestrator firing recommendations, all autonomously and continuously.

### What it would look like

- 3–5 local LLM agents (e.g. Ollama with `llama3`, `mistral`, or `qwen2.5-coder`) each playing a different persona: "Backend Dev", "PM", "Designer", "QA", "Tech Lead"
- Each agent runs in a loop: reads the current board state via the GraphQL API → decides what to do (move a ticket, add a comment, change a workflow state, create a new ticket, edit a description) → fires the mutation → waits a randomised delay → repeats
- Agents occasionally edit the same ticket simultaneously to trigger the optimistic concurrency conflict path and show the ConflictError UI resolving live
- A lightweight dashboard overlay shows per-agent activity stats: mutations/min, conflicts triggered, tickets closed — essentially a live traffic monitor
- The Orion AI Orchestrator agent runs in parallel, consuming the same event stream and emitting scope/risk recommendations to the board

### Hardware feasibility

Your rig (i5-12th gen + RX 9070 XT 16 GB VRAM) is more than sufficient:

| Model | VRAM needed | Speed on 9070 XT |
|---|---|---|
| `llama3.2:3b` | ~2 GB | ~80–120 tok/s |
| `qwen2.5-coder:7b` | ~5 GB | ~40–60 tok/s |
| `mistral:7b` | ~5 GB | ~40–60 tok/s |
| `llama3.1:8b` | ~6 GB | ~35–55 tok/s |

You can run 3–4 of the smaller models simultaneously (each in its own Ollama instance or via the same server with model switching), well within 16 GB VRAM. ROCm support for the 9070 XT is available via Ollama's AMD backend.

### Rough implementation plan

1. `scripts/agent-swarm/` — TypeScript scripts, one per persona, each hitting `/api/graphql` with real mutations
2. Each script uses `ollama.js` or direct REST to generate realistic-sounding ticket titles, comments, and descriptions
3. A `swarm.ts` orchestrator spawns them with `worker_threads` or just separate `node` processes
4. Optional: a `/demo-stats` route (or a floating HUD component) that shows live agent activity via a WebSocket or polling query
5. Seed the board with a realistic project (e.g. a fake SaaS product backlog) before starting the swarm

### Why this works as a portfolio piece

It demonstrates Orion's entire value proposition under real (synthetic) load:
- Multi-tenant isolation works under concurrent writes
- Optimistic concurrency conflict resolution triggers and resolves visibly
- XState machine handles async AI events without broken state
- The app stays responsive under dozens of mutations/minute
- Visitors can jump in, create their own org, and interact alongside the bots

### Bot architecture (no LLMs needed)

Bots are pure TypeScript async loops — no AI, no GPU, no cost. Each bot:
1. Signs in headlessly via Clerk Backend API (`createSignInToken` with `CLERK_SECRET_KEY`) — no browser needed
2. Exchanges the token for a session JWT via Clerk's frontend API
3. Runs a weighted random action loop against `/api/graphql`:
   - 40% move ticket to another column
   - 30% add a comment (from a bank of ~100 pre-written realistic comments)
   - 15% edit a ticket description
   - 10% create a new ticket
   - 5% change workflow state
4. Waits 2–8s (randomised), then repeats
5. Refreshes JWT silently before expiry

A single Node.js process handles 80–100 concurrent bots via the async event loop — no threads needed.

**Sweet spot for a live portfolio demo:** 10–15 bots per org, 3–4 demo orgs. Fast enough to look alive, slow enough that a visitor can actually read what's happening.

### Proving scale cheaply — the $2 Atlas M10 trick

MongoDB Atlas is billed **hourly**. You can upgrade, run your stress test, screenshot the stats, then downgrade — all in one sitting.

| Tier | $/hour | Cost for a full demo day |
|---|---|---|
| M0 | Free | Free tier — good for development |
| M10 | ~$0.08/hr | **~$1.92 for 24h** |
| M20 | ~$0.20/hr | ~$4.80 for 24h |

**M10 is all you need.** Steps:
1. Upgrade M0 → M10 in Atlas UI (takes ~5 min to provision, no data loss, same connection string)
2. Start the bot swarm (`node scripts/agent-swarm/index.ts`)
3. Let it run for a few hours — board fills with activity, conflicts fire, history accumulates
4. Open Atlas Charts or Grafana and screenshot: mutations/sec, conflict rate, p99 latency, tenant isolation proof
5. Downgrade back to M0

Total cost: **under $2**. The screenshots live in the repo/portfolio forever.

### What the stats dashboard should show

For maximum impact, build a protected `/admin` page (or use Atlas Charts) showing:

- Total orgs / active bots running
- Mutations per minute (last 15 min rolling)
- Conflict resolution rate (conflicts / total updates)
- Top 5 most active tickets
- History entries per org (proves tenant isolation — each org's data is fully separated)
- p50 / p99 response time from the GraphQL layer

This is all derivable from the `ticketHistory`, `comments`, and `tickets` collections you already have.

---

> **REMINDER: before any final portfolio presentation, do the following in order:**
> 1. Build `scripts/agent-swarm/` — bot personas, weighted action loop, Clerk headless auth
> 2. Build `/admin` stats page (or set up Atlas Charts dashboard)
> 3. Upgrade to Atlas M10 for one day
> 4. Run the swarm for 2–4 hours, screenshot everything
> 5. Downgrade back to M0
> 6. Add the screenshots to the repo's `/docs` or the README

