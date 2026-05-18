import { test, expect } from "@playwright/test";
import { seedFixtureBoard } from "./helpers/seed";

/**
 * Slice Q / R AI-mutation surfaces.
 *
 * What this file covers TODAY (mock AI):
 *  - The Execute / Confirm mode toggle in Phase 2 chat is interactive and
 *    visually reflects the active mode.
 *  - The toggle persists across chat turns within the same phase.
 *
 * What it does NOT cover (skipped — mock AI doesn't emit `mutations[]`):
 *  - End-to-end validation splice (AI's reply gets the "— Correction:" tail
 *    when a mutation is rejected by `validateBlueprintMutations` /
 *    `validateRefinementMutations`).
 *  - Confirm-mode pending-mutations preview banner + Accept / Reject flow.
 *  - The 2-second indigo pulse on AI-touched ticket rows.
 *
 * To unskip the deep flow, either (a) enhance `mockAi.runBlueprintChat` /
 * `runRefinementChat` to emit deterministic mutations on keyword triggers, or
 * (b) gate the test on a `E2E_REAL_AI=1` env var and let Gemini drive it.
 */
test("phase 2: Execute / Confirm mode toggle is interactive and persistent", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const { boardId } = await seedFixtureBoard(request, { baseURL: baseURL ?? "" });

  await page.goto(`/?board=${boardId}`);
  await page.getByRole("button", { name: /AI Orchestrator/i }).click();
  await page.getByRole("button", { name: /new epic/i }).click();

  // ── Drive Phase 1 → 2 ─────────────────────────────────────────────
  const phase1Input = page.getByPlaceholder(/describe your epic/i);
  await expect(phase1Input).toBeVisible({ timeout: 5_000 });
  await phase1Input.fill("Add a notifications inbox so users see in-app activity.");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(phase1Input).not.toBeDisabled({ timeout: 8_000 });
  await phase1Input.fill("ready");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText(/analyst summary/i)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /continue to backlog/i }).click();

  // Phase 2 ready (Architect emits a backlog on entry).
  await expect(page.getByRole("button", { name: /refine each ticket/i })).toBeVisible({
    timeout: 8_000,
  });

  // ── Mode toggle ────────────────────────────────────────────────────
  const executeBtn = page.getByRole("button", { name: /^execute$/i });
  const confirmBtn = page.getByRole("button", { name: /^confirm$/i });

  await expect(executeBtn).toBeVisible();
  await expect(confirmBtn).toBeVisible();

  // Default state is "execute" — assert the active style class is applied
  // (the active button gets `bg-indigo-500` text-white per the toggle JSX).
  await expect(executeBtn).toHaveClass(/bg-indigo-500/);
  await expect(confirmBtn).not.toHaveClass(/bg-indigo-500/);

  // Switch to Confirm.
  await confirmBtn.click();
  await expect(confirmBtn).toHaveClass(/bg-indigo-500/);
  await expect(executeBtn).not.toHaveClass(/bg-indigo-500/);

  // Send a chat message — toggle must stay in Confirm afterwards.
  const phase2Input = page
    .getByPlaceholder(/ask|tell.*architect|propose|describe/i)
    .first();
  if (await phase2Input.isVisible().catch(() => false)) {
    await phase2Input.fill("just checking the toggle state");
    await page.getByRole("button", { name: /^send$/i }).first().click();
    // Wait for the chat to settle (mock AI delay is 600-1400ms).
    await page.waitForTimeout(2_000);
    await expect(confirmBtn).toHaveClass(/bg-indigo-500/);
  }

  // Switch back to Execute.
  await executeBtn.click();
  await expect(executeBtn).toHaveClass(/bg-indigo-500/);
});

/**
 * Validation splice + Confirm-mode flow.
 *
 * Currently fixme: mock AI returns `{ reply }` only — no `mutations[]` —
 * so `validateBlueprintMutations` is never invoked and the Confirm-mode
 * preview never renders. Enable when mock AI gains a mutation channel
 * (search for "TICKET_TEMPLATES" in mockAi.ts), or wire `E2E_REAL_AI=1`.
 */
test.fixme(
  "phase 2: AI mutation in Confirm mode shows pending preview, Accept applies it",
  async () => {
    // Pseudocode for when this becomes runnable:
    //   1. Drive to Phase 2 (as above)
    //   2. Switch to Confirm
    //   3. Send "rename ticket 1 to 'Customer onboarding flow'"
    //   4. Wait for AI reply
    //   5. Assert pending banner: "Proposed changes (1)"
    //   6. Click "Accept"
    //   7. Assert ticket #1 title updates AND 2s indigo pulse classname appears
  },
);

/**
 * Validation splice: when the AI proposes a mutation that fails server-side
 * validation, the chat graph splices a "— Correction:" tail into the reply.
 * Same gating as above — needs mock or real AI to emit a mutation referencing
 * a non-existent ticketId.
 */
test.fixme(
  "phase 2: rejected mutation produces in-reply correction note",
  async () => {
    // Pseudocode:
    //   1. Drive to Phase 2
    //   2. Send a message that prompts AI to emit a bogus mutation (e.g.
    //      "rename ticket #99 to 'X'" when only 8 tickets exist)
    //   3. Assert the AI's reply contains "— Correction:" and a phrase
    //      matching /not applied|rejected|does not exist/i
  },
);
