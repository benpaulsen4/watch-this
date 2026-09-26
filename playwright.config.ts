import { defineConfig, devices } from "@playwright/test";

import { buildE2eEnv, E2E_BASE_URL, E2E_PORT } from "./e2e/series-finale/env/test-env";

// Mutating specs (dismiss, opt-out, rename, account switch) change shared
// state, so they run last, in their own project, after every read-only
// project has finished. Numbered 80-99, or named `*.mutating.e2e.ts`.
const MUTATING_SPEC_PATTERN = /(8\d|9\d)-.*\.e2e\.ts$|.*\.mutating\.e2e\.ts$/;

export default defineConfig({
  testDir: "./e2e/series-finale/specs",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "./e2e/series-finale/artifacts/test-output",
  reporter: [
    ["list"],
    ["json", { outputFile: "e2e/series-finale/artifacts/results.json" }],
    ["html", { outputFolder: "e2e/series-finale/artifacts/playwright-report", open: "never" }],
  ],
  use: {
    baseURL: E2E_BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    timezoneId: "Australia/Brisbane",
    locale: "en-AU",
    colorScheme: "dark",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testIgnore: MUTATING_SPEC_PATTERN,
    },
    {
      name: "phone",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
      testIgnore: MUTATING_SPEC_PATTERN,
    },
    {
      name: "small-phone",
      use: { ...devices["Pixel 5"], viewport: { width: 360, height: 640 }, deviceScaleFactor: 2 },
      testMatch: /story.*\.e2e\.ts$/,
      testIgnore: MUTATING_SPEC_PATTERN,
    },
    {
      name: "webkit-phone",
      use: { ...devices["iPhone 13"], viewport: { width: 390, height: 844 } },
      testMatch: /(recap|story)-visual\.e2e\.ts$/,
      testIgnore: MUTATING_SPEC_PATTERN,
    },
    {
      name: "desktop-mutating",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      testMatch: MUTATING_SPEC_PATTERN,
      // webkit-phone is best-effort (E2): this host is missing the system
      // libraries WebKit needs (browserType.launch fails outright), so it
      // cannot gate the mutating project. Re-add it once WebKit runs here.
      dependencies: ["desktop", "phone", "small-phone"],
    },
  ],
  webServer: {
    command: `npx next start -p ${E2E_PORT}`,
    url: `${E2E_BASE_URL}/auth`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: buildE2eEnv() as Record<string, string>,
  },
});
