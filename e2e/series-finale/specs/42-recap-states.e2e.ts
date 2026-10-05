import { type Page, type Route } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { check } from "../support/evidence";
import { becomesVisible } from "../support/pages";
import { recapHeroRange } from "../support/recap";
import { shot } from "../support/shots";
import { test } from "../support/test";

// The recap's states other than a loaded year (desktop + phone; read-only):
// loading, a failed load and its retry, and an unavailable period. Each is
// forced by intercepting ava's GET /api/series-finale/2025 with page.route,
// so nothing reaches the database but the real payload on retry.

const AVA = "e2e_ava";
const YEAR = "2025";
const HOLD_MS = 3_000;

/** Matches the period's GET only -- not /card, /story or /dismiss under it. */
function isPeriodGet(url: URL): boolean {
  return url.pathname === `/api/series-finale/${YEAR}`;
}

function retryButton(page: Page) {
  return page.getByRole("button", { name: "Retry" });
}

const LOAD_FAILED = "That recap could not be loaded. Try again in a moment.";

test.use({ storageState: storageStatePath(AVA) });

test("loading: the spinner shows while the payload is on its way", async ({ page }) => {
  let released!: () => void;
  const answered = new Promise<void>((resolve) => (released = resolve));
  await page.route(isPeriodGet, async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, HOLD_MS));
    await route.continue();
    released();
  });

  await page.goto(`/series-finale/${YEAR}`);
  const spinner = page.getByRole("status", { name: "Putting your year together" });
  check("recap-state-loading-spinner", "while the payload is held, the recap shows 'Putting your year together'", true, await becomesVisible(spinner, HOLD_MS));
  await shot(page, "recap/state-loading");

  await answered;
  check("recap-state-loading-then-renders", "once the payload arrives, the recap renders", true, await becomesVisible(recapHeroRange(page, YEAR)));
  check("recap-state-loading-spinner-gone", "and the spinner is gone", 0, await spinner.count());
  await page.unroute(isPeriodGet);
});

test("load failure: a notice with Retry, and Retry loads the recap", async ({ page }) => {
  await page.route(isPeriodGet, (route: Route) => route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' }));

  await page.goto(`/series-finale/${YEAR}`);
  check("recap-state-error-notice", "a 500 shows the could-not-be-loaded notice", true, await becomesVisible(page.getByText(LOAD_FAILED)));
  check("recap-state-error-retry", "the notice offers a Retry button", true, await becomesVisible(retryButton(page), 1_000));
  check(
    "recap-state-error-not-unavailable",
    "a 500 is not the unavailable notice",
    0,
    await page.getByRole("heading", { name: `No Series Finale for ${YEAR}` }).count(),
  );
  await shot(page, "recap/state-error");

  await page.unroute(isPeriodGet);
  if (await retryButton(page).isVisible()) await retryButton(page).click();
  check("recap-state-retried-renders", "after the route is lifted, Retry loads the recap", true, await becomesVisible(recapHeroRange(page, YEAR)));
  check("recap-state-retried-notice-gone", "and the failure notice is gone", 0, await page.getByText(LOAD_FAILED).count());
  await shot(page, "recap/state-retried");
});

test("unavailable: a 404 is the no-Series-Finale notice, with no retry", async ({ page }) => {
  await page.route(isPeriodGet, (route: Route) => route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"not available"}' }));

  await page.goto(`/series-finale/${YEAR}`);
  check(
    "recap-state-unavailable-notice",
    "a 404 shows 'No Series Finale for 2025'",
    true,
    await becomesVisible(page.getByRole("heading", { name: `No Series Finale for ${YEAR}` })),
  );
  check("recap-state-unavailable-no-retry", "the unavailable notice has no Retry button", 0, await retryButton(page).count());
  check("recap-state-unavailable-no-try-again", "nor any 'try again' copy", 0, await page.getByText(/Try again/i).count());
  await shot(page, "recap/state-unavailable");
  await page.unroute(isPeriodGet);
});
