import { type Page } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { psql } from "../support/db";
import { check } from "../support/evidence";
import { banner, BANNER_READY, becomesVisible, listResponse, openDashboard } from "../support/pages";
import { openRecap } from "../support/recap";
import { shot } from "../support/shots";
import { goToCard, openStory } from "../support/story";
import { test } from "../support/test";

// Putting the banner away (desktop-mutating project only). It writes
// series_finale.dismissed_at and story_completed_at, so it runs after every
// read-only project:
//   - ava: "Not now" hides the banner at once, before the POST has answered
//     (the route is held for 1.5 s), it stays gone on reload, and no older
//     year steps in;
//   - bo: a failed POST brings the banner back with its error line. The POST
//     never reaches the app, so bo is left undismissed;
//   - ava: opening the recap keeps the banner; reaching the recap's foot puts
//     it away (dismissed_at, as Not now);
//   - ava: reaching the story's summary card puts it away (story_completed_at).
//
// The seeder marks ava's and bo's 2025 stories gone through, which is already
// "seen" -- so each test first puts its banner back (`putBannerBack`) and the
// last restores the seeded completions.

const AVA = "e2e_ava";
const BO = "e2e_bo";

const DISMISS_PATH = "/api/series-finale/2025/dismiss";
const DISMISS_ROUTE = `**${DISMISS_PATH}`;
const COMPLETE_PATH = "/api/series-finale/2025/story-complete";
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
  check(id, `${username}'s dashboard shows the banner beforehand`, true, shown);
  if (!shown) throw new Error(`${username}'s banner never appeared; nothing to put away`);
}

/** `username`'s 2025 row: its two "seen" columns, or null if there is no row. */
function seen(username: string): { dismissed: boolean; storyCompleted: boolean } | null {
  const raw = psql(
    `select (s.dismissed_at is not null)::text || ',' || (s.story_completed_at is not null)::text
     from series_finale s join users u on u.id = s.user_id
     where u.username = :'u' and s.period_label = '2025';`,
    { u: username },
  );
  if (raw === "") return null;
  const [dismissed, storyCompleted] = raw.split(",");
  return { dismissed: dismissed === "true", storyCompleted: storyCompleted === "true" };
}

/** Clears both "seen" columns of `username`'s 2025 row, so the banner shows again. */
function putBannerBack(username: string): void {
  psql(
    `update series_finale s set dismissed_at = null, story_completed_at = null
     from users u where u.id = s.user_id and u.username = :'u' and s.period_label = '2025';`,
    { u: username },
  );
}

/** Records every POST to `path` the page makes from now on. */
function recordPosts(page: Page, path: string): string[] {
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === path) posts.push(path);
  });
  return posts;
}

async function dashboardBannerCount(page: Page): Promise<number> {
  const listed = listResponse(page);
  await page.goto("/dashboard");
  await listed;
  await page.waitForLoadState("networkidle");
  return page.getByText(BANNER_READY).count();
}

test.describe("ava dismisses the banner", () => {
  test.use({ storageState: storageStatePath(AVA) });

  test("Not now hides the banner before the POST answers, and it stays gone", async ({ page }) => {
    putBannerBack(AVA);
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
    check("dismiss-db-ava", "ava's 2025 snapshot has dismissed_at set", true, seen(AVA)?.dismissed ?? null);

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
    putBannerBack(BO);
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
    check("dismiss-failed-db-bo", "bo's 2025 snapshot is left undismissed", false, seen(BO)?.dismissed ?? null);
  });
});

test.describe("seeing the year puts the banner away (ava)", () => {
  test.use({ storageState: storageStatePath(AVA) });

  test.afterAll(() => {
    // Back to the seeded state: both stories gone through, as the later
    // mutating specs and a re-read of the evidence expect.
    psql(
      `update series_finale s set story_completed_at = coalesce(s.story_completed_at, now())
       from users u where u.id = s.user_id and u.username in (:'a', :'b') and s.period_label = '2025';`,
      { a: AVA, b: BO },
    );
  });

  test("opening the recap keeps the banner; reaching its foot puts it away", async ({ page }) => {
    putBannerBack(AVA);
    await openDashboardWithBanner(page, "banner-recap-foot-before", AVA);
    const posts = recordPosts(page, DISMISS_PATH);

    // Opened, read from the top, left: a misclick keeps its banner.
    const opened = await openRecap(page, "2025");
    check("banner-recap-foot-recap-opened", "the banner's year opens as the recap on desktop", true, opened);
    await page.waitForTimeout(1_500);
    check(
      "banner-recap-foot-not-on-open",
      "opening the recap without reaching its foot posts no dismissal and leaves the banner up",
      { posts: 0, row: { dismissed: false, storyCompleted: false }, banner: 1 },
      { posts: posts.length, row: seen(AVA), banner: await dashboardBannerCount(page) },
    );

    // Read to the end.
    await openRecap(page, "2025");
    const answered = page
      .waitForResponse((r) => new URL(r.url()).pathname === DISMISS_PATH && r.request().method() === "POST", { timeout: 10_000 })
      .catch(() => null);
    await page.locator("main footer").last().scrollIntoViewIfNeeded();
    const response = await answered;
    check("banner-recap-foot-posted", "reaching the recap's foot posts one dismissal, answered 200", { posts: 1, status: 200 }, {
      posts: posts.length,
      status: response?.status() ?? null,
    });

    // Back up and down again: still just the one.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("main footer").last().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1_000);
    check("banner-recap-foot-once", "reaching the foot again in the same visit posts nothing more", 1, posts.length);
    check(
      "banner-recap-foot-db",
      "ava's 2025 row is dismissed (as Not now would), the story untouched",
      { dismissed: true, storyCompleted: false },
      seen(AVA),
    );
    check("banner-recap-foot-gone", "back on the dashboard the banner is gone", 0, await dashboardBannerCount(page));
    await shot(page, "dashboard/ava-after-recap-foot");
  });

  test("reaching the story's summary card puts it away", async ({ page }) => {
    putBannerBack(AVA);
    await openDashboardWithBanner(page, "banner-story-end-before", AVA);

    const opened = await openStory(page, "2025");
    check("banner-story-end-story-opened", "ava's 2025 story opens", true, opened);
    const completed = page
      .waitForResponse((r) => new URL(r.url()).pathname === COMPLETE_PATH && r.request().method() === "POST", { timeout: 10_000 })
      .catch(() => null);
    const reached = await goToCard(page, "summary");
    check("banner-story-end-summary-reached", "ArrowRight reaches the summary card", true, reached);
    const response = await completed;
    check("banner-story-end-posted", "the summary card posts the story's completion, answered 200", 200, response?.status() ?? null);
    check(
      "banner-story-end-db",
      "ava's 2025 row has its story gone through and is not dismissed: the story alone puts the banner away",
      { dismissed: false, storyCompleted: true },
      seen(AVA),
    );
    check("banner-story-end-gone", "back on the dashboard the banner is gone", 0, await dashboardBannerCount(page));
    await shot(page, "dashboard/ava-after-story");
  });
});
