import { test, expect } from "@playwright/test";

/**
 * Phase 5 Inspector — chat + memory persistence over a committed Epic.
 *
 * Prerequisite: at least one committed Epic exists on the active board.
 * `orchestrator-commit.spec.ts` produces one as a side effect; running both
 * specs in sequence gives this one a fixture to work against. If running
 * standalone, seed a committed Epic first (TODO: dedicated seed helper).
 */
test.describe("Phase 5 Inspector", () => {
  test("opens a committed Epic and shows the chat shell", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: "AI Orchestrator" }).click();

    // Committed Epics section appears below in-progress drafts.
    await expect(page.getByText(/committed epics/i)).toBeVisible({ timeout: 10_000 });
    // Wait for cache-and-network refetch to settle before clicking.
    await page.waitForLoadState("networkidle");

    // Click the first committed-Epic card.
    await page.locator('[data-testid="committed-epic-card"]').first().click();

    // Inspector landing: drift card + chat input visible.
    await expect(page.getByText(/plan vs\. live/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/ask about this epic/i)).toBeVisible();
  });

  test("chat message persists across reload", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "AI Orchestrator" }).click();
    await expect(page.getByText(/committed epics/i)).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle");

    await page.locator('[data-testid="committed-epic-card"]').first().click();

    const input = page.getByPlaceholder(/ask about this epic/i);
    await expect(input).toBeVisible({ timeout: 10_000 });

    const probe = `e2e-probe-${Date.now()}`;
    await input.fill(`Remember this: ${probe}`);
    await page.getByRole("button", { name: /^send$/i }).click();

    // Inspector reply lands; user turn is visible in transcript.
    await expect(page.getByText(probe)).toBeVisible({ timeout: 8_000 });

    // Close the inspector before reloading so ?modal=orchestrator is removed from the URL.
    await page.keyboard.press("Escape");
    await expect(page.getByText(/plan vs\. live/i)).not.toBeVisible({ timeout: 5_000 });

    // Reload — InspectorTranscript should be hydrated from the server.
    await page.reload();
    await page.getByRole("button", { name: "AI Orchestrator" }).click();
    await expect(page.getByText(/committed epics/i)).toBeVisible({ timeout: 10_000 });
    await page.waitForLoadState("networkidle");
    await page.locator('[data-testid="committed-epic-card"]').first().click();

    await expect(page.getByText(probe)).toBeVisible({ timeout: 10_000 });
  });
});
