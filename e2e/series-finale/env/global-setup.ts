// Playwright's globalSetup: runs once per invocation, after the webServer step
// has started (or reused) the server on E2E_PORT and before any spec -- so it
// covers `pnpm e2e:test`, `e2e:all` and a direct `pnpm exec playwright test`
// alike. It refuses when the cast's year is over, and when the server that
// answers is not the e2e one (reuseExistingServer would otherwise run every
// spec, registrations and mutations included, against it).
import { assertE2eServer } from "./server-guard";
import { assertSuiteInDate } from "./test-env";

export default function globalSetup(): void {
  assertSuiteInDate();
  assertE2eServer();
}
