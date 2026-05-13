import { test as setup, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

const USERNAME = process.env.E2E_CLERK_USER_USERNAME;
const PASSWORD = process.env.E2E_CLERK_USER_PASSWORD;

/**
 * Signs into Clerk once and persists storageState for spec projects to reuse.
 *
 * Gated on `E2E_CLERK_USER_USERNAME` + `E2E_CLERK_USER_PASSWORD` — without them,
 * the setup project is skipped and all spec tests are skipped downstream (the
 * storageState file won't exist, so chromium fails fast on setup dependency).
 *
 * For first-time wiring, create a test user inside a Clerk development instance
 * tied to a test organisation, populate the env vars, and run `npm run e2e`
 * once locally to seed the auth file.
 */
setup("authenticate", async ({ page }) => {
  setup.skip(
    !USERNAME || !PASSWORD,
    "E2E_CLERK_USER_USERNAME / E2E_CLERK_USER_PASSWORD not set — skipping auth setup. See tests/e2e/README.md.",
  );

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto("/login");

  // Clerk's hosted sign-in form. Selectors target Clerk's default field names —
  // if you've heavily themed the form, adjust accordingly.
  await page.getByLabel(/email|username/i).fill(USERNAME as string);
  await page.getByRole("button", { name: /continue|next/i }).click();
  await page.getByLabel(/password/i).fill(PASSWORD as string);
  await page.getByRole("button", { name: /continue|sign in/i }).click();

  // After sign-in, Clerk redirects to / (root). Wait for the orchestrator's
  // BoardApp shell to be visible before persisting state.
  await page.waitForURL(/\/(?:\?.*)?$/);
  await expect(page.getByRole("button", { name: /board|sidebar/i }).first()).toBeVisible({
    timeout: 15_000,
  });

  await page.context().storageState({ path: AUTH_FILE });
});
