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
  const { boardId } = await seedFixtureBoard(request, { baseURL: baseURL ?? "" });

  // Navigate directly to the seeded board (avoids sidebar search + regex escaping issues).
  await page.goto(`/?board=${boardId}`);
  await expect(page.getByRole("button", { name: /AI Orchestrator/i })).toBeVisible({
    timeout: 10_000,
  });

  // ── Open the orchestrator ─────────────────────────────────────────
  await page.getByRole("button", { name: /AI Orchestrator/i }).click();
  await expect(page.getByText(/new epic|drafts/i).first()).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: /new epic/i }).click();

  // ── Phase 1: Brainstorming ────────────────────────────────────────
  const phase1Input = page.getByPlaceholder(/describe your epic/i);
  await expect(phase1Input).toBeVisible({ timeout: 5_000 });
  await phase1Input.fill(
    "Build a checkout flow that lets first-time visitors complete a purchase without creating an account.",
  );
  await page.getByRole("button", { name: /^send$/i }).click();

  // Wait for analyst's follow-up response (any analyst reply indicates readiness).
  await expect(phase1Input).not.toBeDisabled({ timeout: 8_000 });

  await phase1Input.fill("ready");
  await page.getByRole("button", { name: /^send$/i }).click();

  // Summary card appears once analyst returns a brainstorm summary.
  await expect(page.getByText(/analyst summary/i)).toBeVisible({ timeout: 5_000 });

  await page.getByRole("button", { name: /continue to backlog/i }).click();

  // ── Phase 2: Structuring ──────────────────────────────────────────
  // Architect generates the backlog automatically on entry.
  await expect(page.getByRole("button", { name: /refine each ticket/i })).toBeVisible({
    timeout: 8_000,
  });
  await page.getByRole("button", { name: /refine each ticket/i }).click();

  // ── Phase 3: Refining ─────────────────────────────────────────────
  // Controller refines each ticket on entry; click Approve to cycle through all.
  for (let i = 0; i < 20; i++) {
    const approveBtn = page.getByRole("button", { name: /^approve & (next|finish)/i });
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      await page.waitForTimeout(300);
      continue;
    }
    // Once all tickets are done, the "Plan Sprints" CTA appears.
    if (
      await page
        .getByRole("button", { name: /plan sprints/i })
        .isVisible()
        .catch(() => false)
    ) {
      break;
    }
    await page.waitForTimeout(600);
  }

  await page.getByRole("button", { name: /plan sprints/i }).click();

  // ── Phase 4: Sprint planning ──────────────────────────────────────
  await expect(page.getByText(/sprint assignment plan/i)).toBeVisible({ timeout: 10_000 });

  // Approve & commit.
  await page.getByRole("button", { name: /approve & commit/i }).click();

  // ── Verify Epic committed ────────────────────────────────────────
  // Orchestrator modal closes when the server commit succeeds.
  await expect(page.getByText(/sprint assignment plan/i)).not.toBeVisible({ timeout: 15_000 });
  // Board is back and the "AI Orchestrator" button is accessible again.
  await expect(page.getByRole("button", { name: /AI Orchestrator/i })).toBeVisible({
    timeout: 5_000,
  });
});
