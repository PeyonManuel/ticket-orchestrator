import { test as setup, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import path from "path";
import fs from "fs";

const AUTH_FILE = path.join(__dirname, ".auth/user.json");

const EMAIL = process.env.E2E_CLERK_USER_USERNAME;

/**
 * Signs into Clerk once via the Clerk API (no browser form — bypasses MFA / email-code flows).
 * Persists storageState to `.auth/user.json` for spec projects to reuse.
 *
 * Requires CLERK_SECRET_KEY + E2E_CLERK_USER_USERNAME in .env.local.
 * global.setup.ts runs clerkSetup() first to populate CLERK_TESTING_TOKEN.
 */
setup("authenticate", async ({ page }) => {
  setup.skip(
    !EMAIL,
    "E2E_CLERK_USER_USERNAME not set — skipping auth setup. See tests/e2e/README.md.",
  );

  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });

  await page.goto("/");
  await setupClerkTestingToken({ context: page.context() });
  await clerk.signIn({ page, emailAddress: EMAIL as string });

  // Wait for the board shell to confirm we're fully authenticated and hydrated.
  await expect(page.locator("body")).not.toContainText("Sign in", { timeout: 15_000 });

  await page.context().storageState({ path: AUTH_FILE });
});
