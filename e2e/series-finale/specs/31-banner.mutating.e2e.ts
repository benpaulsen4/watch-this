import { type Page, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { psql } from "../support/db";
import { check } from "../support/evidence";
import { banner, BANNER_READY, becomesVisible, listResponse, openDashboard } from "../support/pages";
import { shot } from "../support/shots";

// The banner's "Not now" (desktop-mutating project only). It writes
// series_finale.dismissed_at, so it runs after every read-only project:
//   - ava: the banner goes at once, before the POST has answered (the route is
//     held for 1.5 s), stays gone on reload, and no older year steps in;
//   - bo: a failed POST brings the banner back with its error line. The POST
//     never reaches the app, so bo is left undismissed.

const AVA = "e2e_ava";
const BO = "e2e_bo";

const DISMISS_PATH = "/api/series-finale/2025/dismiss";
const DISMISS_ROUTE = `**${DISMISS_PATH}`;
const POST_DELAY_MS = 1_500;
const OPTIMISTIC_BUDGET_MS = 300;

test.describe.configure({ mode: "serial" });

/**
 * Opens the dashboard and records that the banner is there. Every step after
 * this acts on the banner, so a missing one ends the test -- after its check
 * has reached the evidence log.
 */
async function openDashboardWithBanner(page: Page, id: string, username: string): Promise<void> {
  await openDashboard(page);
  const shown = await becomesVisible(banner(page), 30_000);
  check(id, `${username}'s dashboard shows the banner before Not now`, true, shown);
  if (!shown) throw new Error(`${username}'s banner never appeared; nothing to dismiss`);
}

/** dismissed_at of `username`'s 2025 snapshot: null if undismissed, "missing" if there is no row. */
function dismissedAt(username: string): string | null {
  const raw = psql(
    `select coalesce(s.dismissed_at::text, 'null') from series_finale s join users u on u.id = s.user_id
     where u.username = :'u' and s.period_label = '2025';`,
    { u: username },
  );
  if (raw === "") return "missing";
  return raw === "null" ? null : raw;
}

test.describe("ava dismisses the banner", () => {
  test.use({ storageState: storageStatePath(AVA) });

  test("Not now hides the banner before the POST answers, and it stays gone", async ({ page }) => {
    await page.route(DISMISS_ROUTE, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, POST_DELAY_MS));
      await route.continue();
    });
    await openDashboardWithBanner(page, "dismiss-ava-banner-before", AVA);

    let postAnswered = false;
    const posted = page
      .waitForResponse((r) => new URL(r.url()).pathname === DISMISS_PATH && r.request().method() === "POST")
      .then((response) => {
        postAnswered = true;
        return response;
      });

    await banner(page).getByRole("button", { name: "Not now" }).click();
    const hiddenInTime = await banner(page)
      .waitFor({ state: "hidden", timeout: OPTIMISTIC_BUDGET_MS })
      .then(
        () => true,
        () => false,
      );
    const answeredWhenHidden = postAnswered;
    check(
      "dismiss-optimistic-hide",
      `the banner is hidden within ${OPTIMISTIC_BUDGET_MS} ms of clicking Not now`,
      true,
      hiddenInTime,
    );
    check(
      "dismiss-hidden-before-post",
      `the banner was gone before the (${POST_DELAY_MS} ms delayed) POST answered`,
      false,
      answeredWhenHidden,
    );

    const response = await posted;
    check("dismiss-post-status", "the dismiss POST answers 200", 200, response.status());
    await page.unroute(DISMISS_ROUTE);
    const avaDismissedAt = dismissedAt(AVA);
    check("dismiss-db-ava", "ava's 2025 snapshot has dismissed_at set", true, avaDismissedAt !== null && avaDismissedAt !== "missing");

    const listed = listResponse(page);
    await page.reload();
    await listed;
    await page.waitForLoadState("networkidle");
    check("dismiss-reload-gone", "after a reload the banner is still gone", 0, await page.getByText(BANNER_READY).count());
    check(
      "dismiss-no-older-year",
      "no banner for 2024 (or any older year) takes its place",
      0,
      await page.getByText(/Your \d{4} Series Finale is ready/).count(),
    );
    await shot(page, "dashboard/ava-after-dismiss");
  });
});

test.describe("bo's dismissal fails", () => {
  test.use({ storageState: storageStatePath(BO) });

  test("a failed POST brings the banner back with its error line", async ({ page }) => {
    await page.route(DISMISS_ROUTE, (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "e2e: forced failure" }) }),
    );
    try {
      await openDashboardWithBanner(page, "dismiss-failed-bo-banner-before", BO);
      await banner(page).getByRole("button", { name: "Not now" }).click();

      const error = banner(page).getByRole("alert");
      const errorShown = await becomesVisible(error);
      check("dismiss-failed-banner-back", "after a failed dismissal the banner is shown again", true, await banner(page).isVisible());
      check(
        "dismiss-failed-error-line",
        "the banner shows the plain error line",
        "Could not dismiss that. Try again.",
        errorShown ? (await error.textContent())?.trim() : null,
      );
      await shot(page, "dashboard/bo-dismiss-failed");
    } finally {
      await page.unroute(DISMISS_ROUTE);
    }
    check("dismiss-failed-db-bo", "bo's 2025 snapshot is left undismissed", null, dismissedAt(BO));
  });
});
