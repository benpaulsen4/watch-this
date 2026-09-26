import { test } from "@playwright/test";

import type { OracleYear } from "../seed/oracle";
import { storageStatePath } from "../support/auth";
import { check } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { becomesVisible } from "../support/pages";
import { loadAllImages, openRecap, RECAP_SECTIONS, type RecapSection, recapSection, thinYearHeading } from "../support/recap";
import { shot, shotElement } from "../support/shots";

// The recap's screenshot set (desktop, phone; webkit-phone where WebKit
// runs): for each persona-year, the full page and one shot per section --
// recap/<user>-<year>/<section>. A section the page does not render gets no
// shot; which ones render is checked against what the oracle predicts. The
// personas cover a full year (ava 2025, bo 2025), a quieter one (ava 2024),
// thin years (ava 2023, flo 2024), a year with no solo ticks and one show
// (bat 2025) and a films-only year (flo 2025). Read-only; saved storage state.

const FLO = "e2e_flo_watches_only_films_and_has_a_long_name";

const RECAPS: { user: string; slug: string; year: string }[] = [
  { user: "e2e_ava", slug: "ava", year: "2025" },
  { user: "e2e_ava", slug: "ava", year: "2024" },
  { user: "e2e_ava", slug: "ava", year: "2023" },
  { user: "e2e_bo", slug: "bo", year: "2025" },
  { user: "e2e_bat", slug: "bat", year: "2025" },
  { user: FLO, slug: "flo", year: "2025" },
  { user: FLO, slug: "flo", year: "2024" },
];

/** The sections whose presence the oracle decides; genres and rhythm depend on data it does not compute. */
const PREDICTED: RecapSection[] = ["hero", "tiles", "months", "top-show", "niche", "big-day", "shame", "crew", "compare", "footer"];

/** Which predicted sections the recap renders for this oracle year (RecapClient's conditions). */
function expectedSections(oracle: OracleYear): Record<string, boolean> {
  const full = !oracle.thin;
  const shown: Record<RecapSection, boolean> = {
    hero: full,
    tiles: full,
    months: full,
    rhythm: false,
    "top-show": full && oracle.topShow !== null,
    niche: full && oracle.niche !== null,
    genres: false,
    "big-day": full && oracle.bigDay !== null,
    shame: full && (oracle.titlesDropped > 0 || oracle.stillPlanning.length > 0),
    crew: full && oracle.crew.length > 0,
    compare: full && Object.keys(oracle.compare).length > 0,
    // The thin card carries the footer too.
    footer: true,
  };
  return Object.fromEntries(PREDICTED.map((section) => [section, shown[section]]));
}

// WebKit cannot launch on this host (Task 1: missing system libraries), so the
// webkit-phone project skips rather than failing at browser launch.
test.skip(({ browserName }) => browserName === "webkit", "WebKit does not launch on this host (Task 1); webkit-phone is best-effort");

for (const { user, slug, year } of RECAPS) {
  const name = `${slug}-${year}`;

  test.describe(`${name}`, () => {
    test.use({ storageState: storageStatePath(user) });

    test(`recap ${name}: the full page and each section`, async ({ page }) => {
      const oracle = oracleYear(user, year);
      const rendered = await openRecap(page, year);
      check(`visual-${name}-rendered`, `${slug}'s ${year} recap renders (hero, or the thin card)`, true, rendered);
      if (rendered) await loadAllImages(page);
      await shot(page, `recap/${name}/full`, { fullPage: true });
      if (!rendered) return;

      // Layout: nothing may push the page sideways, and the header's title
      // must sit inside the header bar rather than spill out of it.
      const layout = await page.evaluate(() => {
        const header = document.querySelector("header")?.getBoundingClientRect();
        const title = document.querySelector("header h1")?.getBoundingClientRect();
        return {
          viewportWidth: document.documentElement.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          titleInsideHeader: !!header && !!title && title.top >= header.top && title.bottom <= header.bottom,
        };
      });
      check(
        `visual-${name}-no-horizontal-scroll`,
        `${slug}'s ${year} recap is no wider than the viewport (no sideways scroll)`,
        layout.viewportWidth,
        layout.pageWidth,
      );
      check(`visual-${name}-header-title-fits`, "the header's 'Series Finale <year>' title fits inside the header bar", true, layout.titleInsideHeader);

      const shown: Record<string, boolean> = {};
      for (const section of RECAP_SECTIONS) {
        const locator = recapSection(page, section);
        shown[section] = await locator.isVisible();
        if (shown[section]) await shotElement(locator, `recap/${name}/${section}`);
      }
      check(
        `visual-${name}-sections`,
        `the sections ${slug}'s ${year} recap renders are the ones the oracle predicts`,
        expectedSections(oracle),
        Object.fromEntries(PREDICTED.map((section) => [section, shown[section]])),
      );

      const thinCard = thinYearHeading(page, year);
      check(`visual-${name}-thin`, `${slug}'s ${year} shows the thin-year card exactly when the oracle says thin`, oracle.thin, await thinCard.isVisible());
      if (oracle.thin && (await thinCard.isVisible())) {
        // The card is the heading's parent: ThinYearCard is a Card around its <h2>.
        await shotElement(thinCard.locator("xpath=.."), `recap/${name}/thin-card`);
      }

      if (slug === "bat") {
        // bat's year has no episode ticked alone: the biggest day says so
        // instead of drawing its clock, and the type panel drops its
        // after-21:00 share (lateShare is null).
        check(
          `visual-${name}-clock-disclosure`,
          "bat's biggest day discloses why there is no timeline instead of drawing one",
          true,
          await becomesVisible(recapSection(page, "big-day").getByText(/ticked one at a time.*(nothing|too few) to put on a clock/), 1_000),
        );
        check(
          `visual-${name}-no-late-share`,
          "bat's type panel states no after-21:00 share",
          0,
          await recapSection(page, "rhythm").getByText(/after 21:00/).count(),
        );
      }
    });
  });
}
