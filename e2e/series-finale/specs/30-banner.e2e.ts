import { type Page, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { check } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { banner, BANNER_READY, becomesVisible, openDashboard, pluralise } from "../support/pages";
import { recapHeroRange } from "../support/recap";
import { shot, shotElement } from "../support/shots";

// The dashboard banner, read-only (desktop + phone): who sees it, what it
// says, where it leads. "Not now" mutates the snapshot row, so it lives in
// 31-banner.mutating.e2e.ts, which only the final desktop-mutating project
// runs. Each persona uses its saved storage state; nothing signs in via the UI.
// Waits are soft (becomesVisible) so every checked fact reaches the evidence log.

const AVA = "e2e_ava";
const TIA = "e2e_tia";
const NEO = "e2e_neo";
const FLO = "e2e_flo_watches_only_films_and_has_a_long_name";

// A first visit's list call can be generating the persona's years.
const FIRST_GENERATION_MS = 30_000;

/** The banner's headline, as the app words it: "230 episodes. 26 titles." */
function expectedHeadline(episodes: number, titles: number): string {
  return `${pluralise(episodes, "episode")}. ${pluralise(titles, "title")}.`;
}

/** The banner's headline line as rendered, whitespace collapsed; null when there is no banner. */
async function bannerHeadline(page: Page): Promise<string | null> {
  const text = await banner(page).locator("p").first().textContent({ timeout: 1_000 }).catch(() => null);
  return text === null ? null : text.replace(/\s+/g, " ").trim();
}

test.describe("ava: a completed 2025 with plenty in it", () => {
  test.use({ storageState: storageStatePath(AVA) });

  test("the banner leads the dashboard with 2025's headline", async ({ page }) => {
    const oracle = oracleYear(AVA, "2025");
    await openDashboard(page);
    check("banner-ava-shown", "ava's dashboard shows the banner", true, await becomesVisible(banner(page), FIRST_GENERATION_MS));

    check(
      "banner-ava-first-in-main",
      "the banner is the first element in <main>",
      true,
      await page.locator("main > *").first().getByText("Your 2025 Series Finale is ready").isVisible(),
    );
    check(
      "banner-ava-title",
      "the banner says 'Your 2025 Series Finale is ready'",
      1,
      await banner(page).getByText("Your 2025 Series Finale is ready", { exact: true }).count(),
    );
    const headline = expectedHeadline(oracle.episodes, oracle.titlesCompleted);
    check(
      "banner-ava-headline",
      `the banner's headline reads "${headline}" (oracle)`,
      headline,
      await bannerHeadline(page),
    );

    check(
      "banner-ava-no-card-at-a-time",
      "the banner no longer says 'A card at a time on your year.'",
      0,
      await banner(page).getByText(/A card at a time/).count(),
    );

    // The CTA and "Not now" are one group: side by side from md, right of
    // the headline and centred on each other; stacked full width on a phone.
    const layout = await banner(page)
      .first()
      .evaluate((card) => {
        const cta = Array.from(card.querySelectorAll("a")).find((a) => a.textContent?.trim() === "See your Series Finale");
        const notNow = Array.from(card.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Not now");
        const headline = card.querySelector("p");
        if (!cta || !notNow || !headline) return null;
        const [c, n, h, k] = [cta, notNow, headline, card].map((node) => node.getBoundingClientRect());
        return {
          sameCentre: Math.abs(c!.top + c!.height / 2 - (n!.top + n!.height / 2)) <= 1,
          ctaFirst: c!.left < n!.left || c!.top < n!.top,
          rightOfHeadline: c!.left >= h!.right,
          fullWidth: Math.abs(c!.width - n!.width) <= 1 && c!.width >= k!.width * 0.8,
        };
      }, undefined, { timeout: 2_000 })
      .catch(() => null);
    const desktop = test.info().project.name === "desktop";
    check(
      "banner-ava-actions-layout",
      desktop
        ? "on desktop the CTA and 'Not now' sit side by side, vertically centred on each other, right of the headline"
        : "on a phone the CTA and 'Not now' are stacked, each the full width of the card's content",
      desktop ? { sameCentre: true, ctaFirst: true, rightOfHeadline: true } : { ctaFirst: true, fullWidth: true },
      layout && (desktop ? { sameCentre: layout.sameCentre, ctaFirst: layout.ctaFirst, rightOfHeadline: layout.rightOfHeadline } : { ctaFirst: layout.ctaFirst, fullWidth: layout.fullWidth }),
    );

    await shot(page, "dashboard/ava-banner");
    if (await banner(page).isVisible()) await shotElement(banner(page), "dashboard/ava-banner-card");
  });

  // The CTA opens the recap route everywhere. On a phone the recap hands a
  // story not yet gone through on to the story (52-story-gate checks that
  // with cy); ava's is gone through (seed.ts STORY_COMPLETED), so she lands
  // on her recap on either device.
  test("See your Series Finale opens the 2025 recap", async ({ page }) => {
    await openDashboard(page);
    const link = banner(page).getByRole("link", { name: "See your Series Finale" });
    const shown = await becomesVisible(link, FIRST_GENERATION_MS);
    check("banner-ava-link-shown", "the banner offers 'See your Series Finale'", true, shown);
    check(
      "banner-ava-link-href",
      "the banner's link points at the 2025 recap",
      "/series-finale/2025",
      shown ? await link.getAttribute("href") : null,
    );

    if (shown) {
      await link.click();
      await page.waitForURL((url) => url.pathname === "/series-finale/2025").catch(() => undefined);
    }
    check(
      "banner-ava-link-lands",
      "following it lands on /series-finale/2025 and shows the recap",
      { path: "/series-finale/2025", recap: true },
      { path: new URL(page.url()).pathname, recap: await becomesVisible(recapHeroRange(page, "2025"), FIRST_GENERATION_MS) },
    );
  });
});

test.describe("no banner: a thin newest year (tia)", () => {
  test.use({ storageState: storageStatePath(TIA) });

  test("tia's dashboard has no banner", async ({ page }) => {
    check("banner-tia-oracle-thin", "the oracle has tia's 2025 as thin", true, oracleYear(TIA, "2025").thin);
    await openDashboard(page);
    check("banner-tia-none", "tia's dashboard shows no Series Finale banner", 0, await page.getByText(BANNER_READY).count());
  });
});

test.describe("no banner: no completed year (neo)", () => {
  test.use({ storageState: storageStatePath(NEO) });

  test("neo's dashboard has no banner", async ({ page }) => {
    await openDashboard(page);
    check("banner-neo-none", "neo's dashboard shows no Series Finale banner", 0, await page.getByText(BANNER_READY).count());
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
    const shown = expectBanner ? await becomesVisible(banner(page)) : await banner(page).isVisible();
    check("banner-flo-shown", "flo sees a banner exactly when her 2025 is available and not thin", expectBanner, shown);
    if (expectBanner) {
      const headline = expectedHeadline(oracle.episodes, oracle.titlesCompleted);
      check(
        "banner-flo-headline",
        `flo's banner headline reads "${headline}" (oracle)`,
        headline,
        await bannerHeadline(page),
      );
      await shot(page, "dashboard/flo-banner");
    }
  });
});
