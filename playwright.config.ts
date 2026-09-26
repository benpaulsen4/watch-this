import { defineConfig, devices } from "@playwright/test";

import { E2E_BASE_URL } from "./e2e/series-finale/env/test-env";

// Mutating specs (dismiss, opt-out, rename, account switch) change shared
// state, so they run last, in their own project, after every read-only
// project has finished. Numbered 80-99, or named `*.mutating.e2e.ts`.
const MUTATING_SPEC_PATTERN = /(8\d|9\d)-.*\.e2e\.ts$|.*\.mutating\.e2e\.ts$/;

// `run.ts test` runs Playwright twice -- the read-only projects, then
// desktop-mutating -- and names each invocation here, so each keeps its own
// JSON results, HTML report and test output (results-readonly.json,
// playwright-report-readonly/, test-output-readonly/, and the same for
// "mutating"). A direct `npx playwright test` has no name and writes
// results.json, playwright-report/ and test-output/.
const REPORT_RUN = process.env.E2E_REPORT_RUN;
const REPORT_SUFFIX = REPORT_RUN && /^[a-z-]+$/.test(REPORT_RUN) ? `-${REPORT_RUN}` : "";

export default defineConfig({
  testDir: "./e2e/series-finale/specs",
  testMatch: /.*\.e2e\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: `./e2e/series-finale/artifacts/test-output${REPORT_SUFFIX}`,
  reporter: [
    ["list"],
    ["json", { outputFile: `e2e/series-finale/artifacts/results${REPORT_SUFFIX}.json` }],
    ["html", { outputFolder: `e2e/series-finale/artifacts/playwright-report${REPORT_SUFFIX}`, open: "never" }],
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
      // No `dependencies` (E8): Playwright skips a project whose dependency
      // failed, so an app finding in a read-only project would silently stop
      // every mutating spec. Ordering is run.ts's job instead: `e2e:test` and
      // `e2e:all` run the read-only projects to completion first, then this
      // project on its own, whatever the first run's result.
    },
  ],
  // No `env` here, and no buildE2eEnv() at config load: Playwright's reporters
  // serialise the config, and a webServer env once wrote the real TMDB key
  // into artifacts/results.json (E7). run.ts builds the env for the server
  // itself, and `npm run e2e:test` scans artifacts/ for secrets afterwards.
  webServer: {
    command: "npx tsx e2e/series-finale/env/run.ts start",
    url: `${E2E_BASE_URL}/auth`,
    reuseExistingServer: true,
    timeout: 120_000,
    // run.ts start runs next in its own process group (so it can be stopped
    // for certain), which Playwright's default SIGKILL of the command's group
    // would not reach. A SIGTERM lets run.ts stop it -- SIGTERM, then SIGKILL
    // after 10 s -- before this timeout.
    gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
  },
});
