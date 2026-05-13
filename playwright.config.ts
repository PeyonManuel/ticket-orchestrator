import { defineConfig, devices } from "@playwright/test";
import path from "path";

/**
 * Playwright config for Orion E2E.
 *
 * Auth strategy: `tests/e2e/auth.setup.ts` runs once before the spec projects
 * and persists a signed-in storageState to `tests/e2e/.auth/user.json`. Spec
 * projects depend on the `setup` project and load that file via `use.storageState`.
 *
 * The setup project itself is skipped unless `E2E_CLERK_USER_USERNAME` and
 * `E2E_CLERK_USER_PASSWORD` are set — keeps `npm run e2e` from blowing up in
 * environments that haven't been wired up to a test Clerk instance yet.
 *
 * See `tests/e2e/README.md` for env setup.
 */

const PORT = Number(process.env.E2E_PORT ?? 3001);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
const AUTH_STATE_FILE = path.join(__dirname, "tests/e2e/.auth/user.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false, // single Mongo per test machine — keep specs serial.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_STATE_FILE,
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
