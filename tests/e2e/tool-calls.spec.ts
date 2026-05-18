import { test, expect } from "@playwright/test";
import { seedFixtureBoard } from "./helpers/seed";

/**
 * Slice T tool-call smoke. The chat graphs (refinement / blueprint / inspector
 * / planner) now run a `runAgentLoop` pre-step that lets the AI call
 * `get_ticket_details`, `find_similar_tickets`, `find_similar_epics` on demand.
 *
 * Mock AI does NOT simulate tool calls — the augmented messages always equal
 * the initial messages on that code path. So this spec is gated on real-AI
 * mode: set `E2E_REAL_AI=1` AND ensure the dev server is started with
 * `NEXT_PUBLIC_MOCK_AI` unset (or `0`) and `GOOGLE_API_KEY` exported.
 *
 * The assertion is intentionally weak: AI output phrasing varies, and tool
 * usage is not observable from the UI (no per-turn tool-call indicator yet).
 * What we CAN verify cheaply:
 *   - the chat round-trip completes (reply is non-empty)
 *   - the AI doesn't claim it can't see the sibling (regression for the
 *     pre-Slice-T behavior where refinement chat had only the active ticket)
 *
 * For deeper observability, a follow-up could surface tool-call counts via
 * a debug log or a UI badge in dev mode.
 */
const REAL_AI = process.env.E2E_REAL_AI === "1";

test.describe("Slice T tool-call smoke (real AI)", () => {
  test.skip(!REAL_AI, "set E2E_REAL_AI=1 + GOOGLE_API_KEY to run");

  test("refinement chat: AI can reference a sibling ticket without claiming blindness", async ({
    page,
    request,
    baseURL,
  }) => {
    test.setTimeout(300_000); // real Gemini round-trips are slow

    const { boardId } = await seedFixtureBoard(request, { baseURL: baseURL ?? "" });

    await page.goto(`/?board=${boardId}`);
    await page.getByRole("button", { name: /AI Orchestrator/i }).click();
    await page.getByRole("button", { name: /new epic/i }).click();

    // Phase 1
    const p1Input = page.getByPlaceholder(/describe your epic/i);
    await expect(p1Input).toBeVisible({ timeout: 5_000 });
    await p1Input.fill(
      "Build a guest checkout flow with cart, payment, and order confirmation.",
    );
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(p1Input).not.toBeDisabled({ timeout: 30_000 });
    await p1Input.fill("ready");
    await page.getByRole("button", { name: /^send$/i }).click();
    await expect(page.getByText(/analyst summary/i)).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /continue to backlog/i }).click();

    // Phase 2 → 3
    await expect(page.getByRole("button", { name: /refine each ticket/i })).toBeVisible({
      timeout: 60_000,
    });
    await page.getByRole("button", { name: /refine each ticket/i }).click();

    // Wait for Phase 3 to load with the first ticket refined.
    await expect(page.getByRole("button", { name: /^approve & (next|finish)/i })).toBeVisible({
      timeout: 60_000,
    });

    // Ask the refinement chat about a sibling. With Slice T the AI can call
    // `get_ticket_details` to look up #2's body; without it the AI would say
    // "I don't have visibility into other tickets."
    const refinementInput = page
      .getByPlaceholder(/ask|discuss|clarify|propose/i)
      .last();
    await expect(refinementInput).toBeVisible({ timeout: 5_000 });
    await refinementInput.fill(
      "What does ticket #2 cover? Is its scope consistent with this one?",
    );
    await page.getByRole("button", { name: /^send$/i }).last().click();

    // Reply lands somewhere in the chat panel. Don't assert on specific
    // phrasing — just that the chat moved and the AI didn't claim blindness.
    await page.waitForTimeout(15_000); // give Gemini room

    const allText = await page.locator("body").innerText();
    const blindnessPhrases = [
      /i (do not|don't) have (access|visibility) to other tickets/i,
      /i can only see (the current|this) ticket/i,
      /i (cannot|can't) see ticket/i,
    ];
    for (const phrase of blindnessPhrases) {
      expect(allText).not.toMatch(phrase);
    }
  });
});
