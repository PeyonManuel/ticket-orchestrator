import { test, expect } from "@playwright/test";
import { seedFixtureBoard } from "./helpers/seed";

/**
 * Phase 4 visualization spec. Covers the affordances added when Slice C's
 * capacity work landed and the per-discipline breakdown row was added later:
 *
 *  - CapacityPanel renders with per-role budget rows
 *  - Each SprintLane shows the per-discipline used/cap chip strip
 *  - When the mock backlog overflows (frequent with default seed + 1 upcoming
 *    sprint), the OverflowBanner + footer note render correctly
 *
 * Overflow occurrence is not guaranteed across runs — the assertions are
 * conditional on the banner appearing. Once the seed endpoint gains a
 * `forceOverflow` knob, the conditional can be tightened. (Tracked as a
 * Known Gap in tests/e2e/README.md.)
 */
test("phase 4: capacity panel + per-discipline chips render; overflow surfaces when triggered", async ({
  page,
  request,
  baseURL,
}) => {
  test.setTimeout(180_000);

  const { boardId } = await seedFixtureBoard(request, { baseURL: baseURL ?? "" });

  await page.goto(`/?board=${boardId}`);
  await expect(page.getByRole("button", { name: /AI Orchestrator/i })).toBeVisible({
    timeout: 10_000,
  });

  // ── Drive the happy path to Phase 4 ───────────────────────────────
  await page.getByRole("button", { name: /AI Orchestrator/i }).click();
  await page.getByRole("button", { name: /new epic/i }).click();

  const phase1Input = page.getByPlaceholder(/describe your epic/i);
  await expect(phase1Input).toBeVisible({ timeout: 5_000 });
  await phase1Input.fill(
    "Build a checkout flow for guest visitors with no account creation.",
  );
  await page.getByRole("button", { name: /^send$/i }).click();
  await expect(phase1Input).not.toBeDisabled({ timeout: 8_000 });
  await phase1Input.fill("ready");
  await page.getByRole("button", { name: /^send$/i }).click();

  await expect(page.getByText(/analyst summary/i)).toBeVisible({ timeout: 5_000 });
  await page.getByRole("button", { name: /continue to backlog/i }).click();

  await expect(page.getByRole("button", { name: /refine each ticket/i })).toBeVisible({
    timeout: 8_000,
  });
  await page.getByRole("button", { name: /refine each ticket/i }).click();

  for (let i = 0; i < 20; i++) {
    const approveBtn = page.getByRole("button", { name: /^approve & (next|finish)/i });
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      await page.waitForTimeout(300);
      continue;
    }
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

  // ── Phase 4 rendered ──────────────────────────────────────────────
  await expect(page.getByText(/sprint assignment plan/i)).toBeVisible({ timeout: 10_000 });

  // CapacityPanel header
  await expect(page.getByText(/capacity per sprint/i)).toBeVisible();

  // Per-discipline chips inside SprintLane — the role-label text appears
  // in CapacityPanel too, so we scope to the sprint lane region by anchoring
  // on the per-discipline usage row's "tabular-nums" SP fractions. At least
  // one role chip with a `used/cap` pattern must render somewhere in the
  // sprint lanes area.
  // Use a regex matching the SP fraction format "N/M" (1-3 digits each side).
  const disciplineUsageFractions = page.locator("text=/^\\d+\\/\\d+$/");
  await expect(disciplineUsageFractions.first()).toBeVisible({ timeout: 5_000 });
  expect(await disciplineUsageFractions.count()).toBeGreaterThan(0);

  // ── Overflow path (conditional) ───────────────────────────────────
  // The mock architect emits a ~8-ticket backlog; with 1 upcoming sprint and
  // typical seeded velocity, overflow is common but not guaranteed. Only
  // assert the banner structure when present.
  const overflowBanner = page.getByText(/sliding to later sprints/i);
  if (await overflowBanner.isVisible().catch(() => false)) {
    // Footer message acknowledges the overflow.
    await expect(
      page.getByText(/couldn't be scheduled — review before approving/i),
    ).toBeVisible();
  }

  // ── Approve & commit still works with overflow ────────────────────
  await page.getByRole("button", { name: /approve & commit/i }).click();
  await expect(page.getByText(/sprint assignment plan/i)).not.toBeVisible({
    timeout: 15_000,
  });
});
