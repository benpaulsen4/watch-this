import { expect, type Page, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { check } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { shot } from "../support/shots";

// Who gets a Series Finale, and what everyone else sees instead: a user with
// no completed year, a year that is not over, a malformed period, a thin year,
// and no session at all. Read-only (desktop + phone). Every signed-in check
// uses the persona's saved storage state and opens the page under test
// directly -- signing in through the UI would land on /dashboard, whose banner
// asks the list route to generate every missing year.

const AVA = "e2e_ava";
const NEO = "e2e_neo";
const TIA = "e2e_tia";

const NO_FINALE_YET = "No Series Finale yet. One is put together for each calendar year once it has finished.";
const TRY_AGAIN = "Try again in a moment";

/** Resolves once the page's own GET /api/series-finale has answered. */
function listResponse(page: Page) {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/series-finale" && response.request().method() === "GET",
  );
}

/** The recap's or the story's not-available notice, once it has rendered. */
async function expectUnavailable(page: Page, period: string): Promise<void> {
  await expect(page.getByRole("heading", { name: `No Series Finale for ${period}` })).toBeVisible();
}

test.describe("a user with no completed year (neo)", () => {
  test.use({ storageState: storageStatePath(NEO) });

  test("the profile's data tab says there is no Series Finale yet", async ({ page }) => {
    await page.goto("/profile#data");
    const empty = page.getByText(NO_FINALE_YET);
    await expect(empty).toBeVisible();
    check("gating-neo-profile-empty", "neo's profile data tab shows the no-Series-Finale-yet line", true, await empty.isVisible());
    await shot(page, "profile/neo-empty", { fullPage: true });
  });

  test("the dashboard has no banner", async ({ page }) => {
    const listed = listResponse(page);
    await page.goto("/dashboard");
    const list = await listed;
    const body = (await list.json()) as { periods: unknown[] };
    check("gating-neo-list-empty", "neo's list route returns no periods", 0, body.periods.length);
    await page.waitForLoadState("networkidle");
    check(
      "gating-neo-no-banner",
      "neo's dashboard shows no Series Finale banner",
      0,
      await page.getByText(/Series Finale is ready/).count(),
    );
  });

  test("/series-finale/2025 shows the unavailable state, not a retry", async ({ page }) => {
    await page.goto("/series-finale/2025");
    await expectUnavailable(page, "2025");
    check(
      "gating-neo-2025-unavailable",
      "neo's 2025 recap shows the unavailable notice",
      true,
      await page.getByRole("heading", { name: "No Series Finale for 2025" }).isVisible(),
    );
    check(
      "gating-neo-2025-no-retry",
      "neo's 2025 recap does not offer 'try again'",
      0,
      await page.getByText(TRY_AGAIN).count(),
    );
    await shot(page, "recap/neo-2025-unavailable", { fullPage: true });
  });
});

test.describe("a year that is not over, a malformed period, a thin year (ava)", () => {
  test.use({ storageState: storageStatePath(AVA) });

  test("/series-finale/2026 is unavailable: the year is not over", async ({ page }) => {
    await page.goto("/series-finale/2026");
    await expectUnavailable(page, "2026");
    check(
      "gating-ava-2026-unavailable",
      "ava's 2026 recap (year in progress) shows the unavailable notice",
      true,
      await page.getByRole("heading", { name: "No Series Finale for 2026" }).isVisible(),
    );
    check("gating-ava-2026-no-retry", "ava's 2026 recap does not offer 'try again'", 0, await page.getByText(TRY_AGAIN).count());
  });

  test("/series-finale/abc is the app's 404 page", async ({ page }) => {
    const response = await page.goto("/series-finale/abc");
    const notFound = page.getByText("This page could not be found.");
    await expect(notFound).toBeVisible();
    check("gating-malformed-status", "/series-finale/abc answers 404", 404, response?.status());
    check("gating-malformed-404-page", "/series-finale/abc renders the 404 page", true, await notFound.isVisible());
    check(
      "gating-malformed-not-unavailable",
      "/series-finale/abc is not the recap's unavailable or retry notice",
      0,
      (await page.getByText(/No Series Finale for/).count()) + (await page.getByText(TRY_AGAIN).count()),
    );
    await shot(page, "recap/malformed-404");
  });

  test("the story for ava's thin 2023 is the thin-year card", async ({ page }) => {
    const oracle = oracleYear(AVA, "2023");
    await page.goto("/series-finale/2023/story");
    const heading = page.getByRole("heading", { name: "Not much of a 2023" });
    await expect(heading).toBeVisible();
    check("gating-ava-2023-oracle-thin", "the oracle has ava's 2023 as available and thin", { available: true, thin: true }, {
      available: oracle.available,
      thin: oracle.thin,
    });
    check("gating-ava-2023-story-thin", "ava's 2023 story shows the thin-year card", true, await heading.isVisible());
    check(
      "gating-ava-2023-story-counts",
      "the thin card states ava's 2023 episodes and titles per the oracle",
      true,
      await page
        .getByText(`${count(oracle.episodes, "episode")} and ${count(oracle.titlesCompleted, "title")} is not enough`)
        .isVisible(),
    );
    check(
      "gating-ava-2023-story-no-reel",
      "the thin story has no card reel (no progress bars)",
      0,
      await page.getByRole("progressbar").count(),
    );
  });
});

test.describe("a thin completed year (tia)", () => {
  test.use({ storageState: storageStatePath(TIA) });

  test("the 2025 recap is the thin-year card, with no Share or Play as story", async ({ page }) => {
    const oracle = oracleYear(TIA, "2025");
    await page.goto("/series-finale/2025");
    const heading = page.getByRole("heading", { name: "Not much of a 2025" });
    await expect(heading).toBeVisible();
    check("gating-tia-2025-oracle-thin", "the oracle has tia's 2025 as available and thin", { available: true, thin: true }, {
      available: oracle.available,
      thin: oracle.thin,
    });
    check("gating-tia-2025-recap-thin", "tia's 2025 recap shows the thin-year card", true, await heading.isVisible());
    check(
      "gating-tia-2025-recap-counts",
      "the thin card states tia's 2025 episodes and titles per the oracle",
      true,
      await page
        .getByText(`${count(oracle.episodes, "episode")} and ${count(oracle.titlesCompleted, "title")} is not enough`)
        .isVisible(),
    );
    check("gating-tia-2025-no-share", "tia's thin recap has no Share button", 0, await page.getByRole("button", { name: "Share" }).count());
    check(
      "gating-tia-2025-no-story-link",
      "tia's thin recap has no 'Play as story' link",
      0,
      await page.getByRole("link", { name: "Play as story" }).count(),
    );
    await shot(page, "recap/tia-2025-thin", { fullPage: true });
  });

  test("the 2025 story is the thin-year card", async ({ page }) => {
    await page.goto("/series-finale/2025/story");
    const heading = page.getByRole("heading", { name: "Not much of a 2025" });
    await expect(heading).toBeVisible();
    check("gating-tia-2025-story-thin", "tia's 2025 story shows the thin-year card", true, await heading.isVisible());
    check("gating-tia-2025-story-no-reel", "the thin story has no card reel (no progress bars)", 0, await page.getByRole("progressbar").count());
    await shot(page, "story/tia-2025-thin");
  });
});

test.describe("signed out", () => {
  test("/series-finale/2025 redirects to /auth", async ({ page }) => {
    await page.goto("/series-finale/2025");
    await page.waitForURL("**/auth**");
    const url = new URL(page.url());
    check(
      "gating-signed-out-redirect",
      "a signed-out visit to /series-finale/2025 lands on /auth, asked to come back",
      { pathname: "/auth", redirect: "/series-finale/2025" },
      { pathname: url.pathname, redirect: url.searchParams.get("redirect") },
    );
  });
});

/** The app's pluralise(): "1 episode", "6 episodes" (en-GB grouping). */
function count(value: number, noun: string): string {
  return `${value.toLocaleString("en-GB")} ${value === 1 ? noun : `${noun}s`}`;
}
