import { test, expect } from "@playwright/test";
import { seedFixtureBoard } from "./helpers/seed";

/**
 * Critical AI happy path: a fresh Epic walks through Phases 1–4 and lands on
 * the board. Covers approve branches for every persona (analyst, architect,
 * controller, planner). Mock actors emit on a 600–1400ms timer so the test
 * runs in roughly 30–60s end-to-end.
 *
 * Per AGENTS.md §6: approve branches are mandatory for AI decision points.
 */
test("orchestrator: full happy path commits an Epic to the board", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(180_000); // generous — many AI mock delays

  // Seed a board with capacity history so Phase 4 has real velocity to plan against.
  const { boardName } = await seedFixtureBoard(request, { baseURL: baseURL ?? "" });

  await page.goto("/");

  // Pick the seeded board.
  await page.getByRole("button", { name: new RegExp(`${boardName}.*Seeded`, "i") }).click();

  // ── Open the orchestrator ─────────────────────────────────────────
  await page.getByRole("button", { name: /draft.*epic|orchestrator|ai/i }).first().click();
  await expect(page.getByText(/new epic|drafts/i).first()).toBeVisible();

  await page.getByRole("button", { name: /new epic/i }).click();

  // ── Phase 1: Brainstorming ────────────────────────────────────────
  const phase1Input = page.getByPlaceholder(/describe your epic/i);
  await phase1Input.fill(
    "Build a checkout flow that lets first-time visitors complete a purchase without creating an account.",
  );
  await page.getByRole("button", { name: /^send$/i }).click();

  // Wait for analyst's follow-up question, then signal readiness.
  await expect(page.getByText(/walk me through|out of scope/i).first()).toBeVisible({
    timeout: 5_000,
  });
  await phase1Input.fill("ready");
  await page.getByRole("button", { name: /^send$/i }).click();

  // Summary card appears once analyst returns a summary.
  await expect(page.getByText(/analyst summary/i)).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: /continue to backlog/i }).click();

  // ── Phase 2: Structuring ──────────────────────────────────────────
  // Architect generates backlog automatically on entry.
  await expect(page.getByText(/advance to refine|advance to refinement/i)).toBeVisible({
    timeout: 8_000,
  });
  await page.getByRole("button", { name: /advance to refine|advance to refinement/i }).click();

  // ── Phase 3: Refining ─────────────────────────────────────────────
  // Controller refines each ticket on entry; approve cycles through until done.
  // The number of tickets varies by analyst output, so loop with a safety cap.
  for (let i = 0; i < 20; i++) {
    const approveBtn = page.getByRole("button", { name: /^approve(?!.*commit)/i });
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      await page.waitForTimeout(200);
      continue;
    }
    // Once all tickets are approved, the "Advance to planning" CTA appears.
    if (await page.getByRole("button", { name: /advance to planning/i }).isVisible().catch(() => false)) {
      break;
    }
    await page.waitForTimeout(500);
  }

  await page.getByRole("button", { name: /advance to planning/i }).click();

  // ── Phase 4: Sprint planning ──────────────────────────────────────
  await expect(page.getByText(/sprint assignment plan/i)).toBeVisible({ timeout: 10_000 });

  // Approve & commit.
  await page.getByRole("button", { name: /approve.*commit/i }).click();

  // ── Verify Epic on board ──────────────────────────────────────────
  // Modal closes; the new Epic ticket should appear in the first column.
  await expect(page.getByText(/checkout|account|purchase/i).first()).toBeVisible({
    timeout: 15_000,
  });
});
