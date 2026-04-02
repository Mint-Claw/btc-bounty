import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  timeout: 30_000,

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3457",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command: "PORT=3457 node .next/standalone/server.js",
    url: "http://localhost:3457",
    reuseExistingServer: true,
    timeout: 30_000,
    env: {
      ENCRYPTION_SECRET: "btcbounty-dev-2026",
      BTCBOUNTY_DATA_DIR: "./data",
    },
  },
});
