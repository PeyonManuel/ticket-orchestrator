# Focused Task Mode

You are starting a task on the Orion codebase. Follow this protocol exactly — do NOT read source files proactively.

## Step 1 — Understand what you already know

You have two always-loaded references:
- `AGENTS.md` — architecture rules, animation contract, engineering non-negotiables.
- `CODEBASE.md` — file map, key types, patterns, current feature state.

Read `CODEBASE.md` now if it is not already in context. It is your orientation; reading it costs ~3k tokens, reading the full codebase costs 80k+.

## Step 2 — Identify what you need

Based on the task, determine which of these you actually need:
1. **Domain types** — usually inferrable from `CODEBASE.md` types summary; read `src/domain/analyst/types.ts` only if a specific type is unclear.
2. **GraphQL schema/operations** — read `src/infrastructure/graphql/schema.ts` or `operations.ts` only for specific mutations/queries being touched.
3. **Repository functions** — read `src/infrastructure/persistence/repository.ts` only for the specific entity being changed.
4. **UI component internals** — ask the user to paste the relevant section rather than reading the whole file.
5. **Recent changes** — run `git diff --stat HEAD` first; only read full diffs for the 1–2 files most central to the task.

## Step 3 — Ask before reading

State in 3–5 bullet points exactly what specific information you need. Ask the user:
- "Can you paste the current [X] type / component?"
- "Is the existing [mutation/function] for [Y] already wired or do I need to add it?"
- Any architecture decision that would change the implementation plan.

**Do NOT ask more than 5 questions. Do NOT ask anything answerable from CODEBASE.md or AGENTS.md.**

## Step 4 — Propose before implementing

For any task touching more than one layer (Domain + Infra + Presentation), write a 5–10 line implementation plan and wait for user approval. For single-layer tasks, proceed directly.

## Guardrails
- Never read more than 4 source files before starting implementation.
- Never read a file "just to check" — state what you expect to find and ask for confirmation instead.
- If you discover mid-task that you need a file you haven't read, ask the user to paste the relevant section rather than reading the whole file.
- `git diff --stat HEAD` is free; `git diff HEAD -- <file>` costs tokens — only use it for files central to the task.
