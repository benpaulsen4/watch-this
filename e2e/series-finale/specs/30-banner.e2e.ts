import { expect, type Page, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { check } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { shot, shotElement } from "../support/shots";

// The dashboard banner, read-only (desktop + phone): who sees it, what it
// says, where it leads. "Not now" mutates the snapshot row, so it lives in
// 31-banner.mutating.e2e.ts, which only the final desktop-mutating project
// runs. Each persona uses its saved storage state; nothing signs in via the UI.

const AVA = "e2e_ava";
const TIA = "e2e_tia";
const NEO = "e2e_neo";
const FLO = "e2e_flo_watches_only_films_and_has_a_long_name";

const READY = /Series Finale is ready/;

/** The dashboard's GET /api/series-finale, which feeds the banner. */
function listResponse(page: Page) {
  return page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/series-finale" && response.request().method() === "GET",
  );
}

/** The banner card: the element in <main> holding the "is ready" line. */
function banner(page: Page) {
  return page.locator("main > *").filter({ hasText: READY });
}

/** Opens the dashboard and waits until the list the banner reads has answered and settled. */
async function openDashboard(page: Page): Promise<void> {
  const listed = listResponse(page);
  await page.goto("/dashboard");
  await listed;
  await page.waitForLoadState("networkidle");
}

/** The app's pluralise(): "1 episode", "230 episodes" (en-GB grouping). */
function count(value: number, noun: string): string {
  return `${value.toLocaleString("en-GB")} ${value === 1 ? noun : `${noun}s`}`;
}

test.describe("ava: a completed 2025 with plenty in it", () => {
  test.use({ storageState: storageStatePath(AVA) });

  test("the banner leads the dashboard with 2025's headline", async ({ page }) => {
    const oracle = oracleYear(AVA, "2025");
    await openDashboard(page);
    // A first visit's list call can be generating ava's years; allow for it.
    await expect(banner(page)).toBeVisible({ timeout: 30_000 });

    const firstInMain = page.locator("main > *").first();
    check(
      "banner-ava-first-in-main",
      "the banner is the first element in <main>",
      true,
      await firstInMain.getByText("Your 2025 Series Finale is ready").isVisible(),
    );
    check(
      "banner-ava-title",
      "the banner says 'Your 2025 Series Finale is ready'",
      1,
      await banner(page).getByText("Your 2025 Series Finale is ready", { exact: true }).count(),
    );
    const headline = `${count(oracle.episodes, "episode")}. ${count(oracle.titlesCompleted, "title")}.`;
    check(
      "banner-ava-headline",
      `the banner's headline reads "${headline}" (oracle)`,
      headline,
      (await banner(page).locator("p").nth(0).textContent())?.replace(/\s+/g, " ").trim(),
    );

    await shot(page, "dashboard/ava-banner");
    await shotElement(banner(page), "dashboard/ava-banner-card");
  });

  test("See your Series Finale opens the 2025 story", async ({ page }) => {
    await openDashboard(page);
    const link = banner(page).getByRole("link", { name: "See your Series Finale" });
    await expect(link).toBeVisible({ timeout: 30_000 });
    check("banner-ava-link-href", "the banner's link points at the 2025 story", "/series-finale/2025/story", await link.getAttribute("href"));

    await link.click();
    await page.waitForURL("**/series-finale/2025/story");
    check("banner-ava-link-lands", "following it lands on /series-finale/2025/story", "/series-finale/2025/story", new URL(page.url()).pathname);
  });
});

test.describe("no banner: a thin newest year (tia)", () => {
  test.use({ storageState: storageStatePath(TIA) });

  test("tia's dashboard has no banner", async ({ page }) => {
    check("banner-tia-oracle-thin", "the oracle has tia's 2025 as thin", true, oracleYear(TIA, "2025").thin);
    await openDashboard(page);
    check("banner-tia-none", "tia's dashboard shows no Series Finale banner", 0, await page.getByText(READY).count());
  });
});

test.describe("no banner: no completed year (neo)", () => {
  test.use({ storageState: storageStatePath(NEO) });

  test("neo's dashboard has no banner", async ({ page }) => {
    await openDashboard(page);
    check("banner-neo-none", "neo's dashboard shows no Series Finale banner", 0, await page.getByText(READY).count());
  });
});

test.describe("flo: films only, a non-thin 2025", () => {
  test.use({ storageState: storageStatePath(FLO) });

  // flo's 2025 is not thin (28 films), so the banner applies to her -- with
  // "0 episodes", since she watches no shows.
  test("flo's dashboard banner matches her oracle", async ({ page }) => {
    const oracle = oracleYear(FLO, "2025");
    await openDashboard(page);
    const expectBanner = oracle.available && !oracle.thin;
    if (expectBanner) await expect(banner(page)).toBeVisible();
    check("banner-flo-shown", "flo sees a banner exactly when her 2025 is available and not thin", expectBanner, await banner(page).isVisible());
    if (expectBanner) {
      const headline = `${count(oracle.episodes, "episode")}. ${count(oracle.titlesCompleted, "title")}.`;
      check(
        "banner-flo-headline",
        `flo's banner headline reads "${headline}" (oracle)`,
        headline,
        (await banner(page).locator("p").nth(0).textContent())?.replace(/\s+/g, " ").trim(),
      );
      await shot(page, "dashboard/flo-banner");
    }
  });
});
