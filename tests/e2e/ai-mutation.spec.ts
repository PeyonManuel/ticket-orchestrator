import { test, expect } from "@playwright/test";
import { seedFixtureBoard } from "./helpers/seed";

/**
 * Slice Q / R AI-mutation surfaces.
 *
 * Mock AI now emits deterministic mutations on these keyword triggers
 * (see `mockAi.parseBlueprintTrigger` / `parseRefinementTrigger`):
 *   - "rename ticket N to X" → renameTicket
 *   - "remove ticket N"      → removeTicket
 *   - "change label of ticket N to <label>" → changeLabel
 *   - "make it N points"     → setStoryPoints (Fibonacci snap)
 *   - "change label to <l>"  → setLabel + setDiscipline pair
 *
 * Out-of-range positions (e.g. "rename ticket 99 to ...") emit a bogus
 * `prop-bogus*` id so the server-side validation-splice path runs end-to-end.
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

test("phase 2: AI mutation in Confirm mode shows pending preview, Accept applies it", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const { boardId } = await seedFixtureBoard(request, { baseURL: baseURL ?? "" });

  await page.goto(`/?board=${boardId}`);
  await page.getByRole("button", { name: /AI Orchestrator/i }).click();
  await page.getByRole("button", { name: /new epic/i }).click();

  // Drive Phase 1 → 2
  const phase1Input = page.getByPlaceholder(/describe your epic/i);
  await expect(phase1Input).toBeVisible({ timeout: 5_000 });
  await phase1Input.fill("Build a referral program with reward tracking.");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(phase1Input).not.toBeDisabled({ timeout: 8_000 });
  await phase1Input.fill("ready");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText(/analyst summary/i)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /continue to backlog/i }).click();
  await expect(page.getByRole("button", { name: /refine each ticket/i })).toBeVisible({
    timeout: 8_000,
  });

  // Switch to Confirm mode so mutations stage instead of applying.
  await page.getByRole("button", { name: /^confirm$/i }).click();

  // Trigger a deterministic mock mutation.
  const phase2Input = page
    .getByPlaceholder(/ask|tell.*architect|propose|describe/i)
    .first();
  await phase2Input.fill("rename ticket 1 to Customer onboarding API");
  await page.getByRole("button", { name: /^send$/i }).first().click();

  // Mock AI delay is 600-1400ms; the pending preview banner appears once the
  // reply lands.
  await expect(page.getByText(/proposed changes \(\d+\)/i)).toBeVisible({
    timeout: 8_000,
  });

  // Accept the proposed mutation.
  await page.getByRole("button", { name: /^accept$/i }).click();

  // The pending banner clears, and the ticket title now reflects the rename.
  await expect(page.getByText(/proposed changes \(\d+\)/i)).not.toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByText(/customer onboarding api/i).first()).toBeVisible({
    timeout: 5_000,
  });
});

test("phase 2: rejected mutation produces in-reply correction note", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);

  const { boardId } = await seedFixtureBoard(request, { baseURL: baseURL ?? "" });

  await page.goto(`/?board=${boardId}`);
  await page.getByRole("button", { name: /AI Orchestrator/i }).click();
  await page.getByRole("button", { name: /new epic/i }).click();

  const phase1Input = page.getByPlaceholder(/describe your epic/i);
  await expect(phase1Input).toBeVisible({ timeout: 5_000 });
  await phase1Input.fill("Build a referral program with reward tracking.");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(phase1Input).not.toBeDisabled({ timeout: 8_000 });
  await phase1Input.fill("ready");
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(page.getByText(/analyst summary/i)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /continue to backlog/i }).click();
  await expect(page.getByRole("button", { name: /refine each ticket/i })).toBeVisible({
    timeout: 8_000,
  });

  // Stay in Execute mode (default) — the splice runs on the apply path.
  // Send an out-of-range rename to trigger validation failure.
  const phase2Input = page
    .getByPlaceholder(/ask|tell.*architect|propose|describe/i)
    .first();
  await phase2Input.fill("rename ticket 99 to Ghost ticket");
  await page.getByRole("button", { name: /^send$/i }).first().click();

  // The AI's reply now carries the splice ("— Correction: ... NOT applied").
  await expect(page.getByText(/—\s*correction/i)).toBeVisible({ timeout: 8_000 });
  await expect(page.getByText(/not applied/i).first()).toBeVisible();
});
