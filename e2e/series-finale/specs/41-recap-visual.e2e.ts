import { test } from "@playwright/test";

import type { OracleYear } from "../seed/oracle";
import { expectedArchetypeLabel, readArchetypeVisual, SEEDED_ARCHETYPES } from "../support/archetype";
import { storageStatePath } from "../support/auth";
import { check } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { becomesVisible, percent, weekdayName } from "../support/pages";
import { loadAllImages, openRecap, RECAP_SECTIONS, recapPanel, type RecapSection, recapSection, textOf, thinYearHeading } from "../support/recap";
import { shot, shotElement } from "../support/shots";

// The recap's screenshot set (desktop, phone; webkit-phone where WebKit
// runs): for each persona-year, the full page and one shot per section --
// recap/<user>-<year>/<section>. A section the page does not render gets no
// shot; which ones render is checked against what the oracle predicts. The
// personas cover a full year (ava 2025, bo 2025), a quieter one (ava 2024),
// thin years (ava 2023, flo 2024), a year with no solo ticks and one show
// (bat 2025) and a films-only year (flo 2025). Read-only; saved storage state.
// On the phone every non-thin one of these opens as a recap because the
// seeder marked its story gone through (seed.ts STORY_COMPLETED); thin years
// are never handed on to the story.

/** The top-titles row's height gap the poster change (plan 6 Task 4) must keep within, at 1440 px. */
const POSTER_ROW_GAP_PX = 40;

/**
 * How far apart the content of "Watched by month" and "Your type" may end, at
 * 1440 px (plan 6 final review I1): the grid stretches both cards to the
 * taller, so a larger gap is an empty block under the shorter one's content.
 */
const TOP_BAND_GAP_PX = 60;

/** The recaps whose top band is checked: every seeded type, and ava's 2024. */
const TOP_BAND = new Set(["ava-2025", "ava-2024", "bo-2025", "bat-2025", "flo-2025"]);

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
      // must sit inside the header bar rather than spill out of it -- whole,
      // not cut to an ellipsis (PageHeader truncates a title that cannot fit).
      const layout = await page.evaluate(() => {
        const header = document.querySelector("header")?.getBoundingClientRect();
        const h1 = document.querySelector("header h1");
        const title = h1?.getBoundingClientRect();
        return {
          viewportWidth: document.documentElement.clientWidth,
          pageWidth: document.documentElement.scrollWidth,
          titleInsideHeader: !!header && !!title && title.top >= header.top && title.bottom <= header.bottom,
          titleWhole: !!h1 && h1.scrollWidth <= h1.clientWidth,
        };
      });
      check(
        `visual-${name}-no-horizontal-scroll`,
        `${slug}'s ${year} recap is no wider than the viewport (no sideways scroll)`,
        layout.viewportWidth,
        layout.pageWidth,
      );
      check(
        `visual-${name}-header-title-fits`,
        "the header's 'Series Finale <year>' title fits inside the header bar, whole (not truncated)",
        { insideHeader: true, whole: true },
        { insideHeader: layout.titleInsideHeader, whole: layout.titleWhole },
      );

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

      // The type's picture, for the personas whose 2025 archetype the cast is
      // known to produce, labelled with the oracle's numbers; and the weekday
      // strip under the months for every type but the marathoner (whose
      // picture it is), when there is a weekday to draw.
      const archetype = year === "2025" ? SEEDED_ARCHETYPES[user] : undefined;

      // The type panel's after-21:00 share only ever belongs to the nightly
      // ritualist (G8: every other archetype's description quotes its own
      // statistic, never this one). None of the seeded 2025 archetypes is a
      // nightly ritualist, so the sentence must be absent for all of them,
      // whatever the oracle's own late-tick share happens to be.
      if (shown.rhythm && archetype) {
        const late = await textOf(recapSection(page, "rhythm").getByText(/after 21:00/));
        check(
          `visual-${name}-late-share`,
          `${slug}'s ${year} type panel (a ${archetype}) gives the after-21:00 share only if it were the nightly ritualist (oracle late share: ${oracle.lateShare === null ? "none" : `${oracle.lateSoloTicks} of ${oracle.soloTicks}`})`,
          archetype === "nightly-ritualist" && oracle.lateShare !== null
            ? `${percent(oracle.lateShare, 1)}% of the episodes you ticked one at a time came after 21:00.`
            : null,
          /\d+% of the episodes you ticked one at a time came after 21:00\./.exec(late ?? "")?.[0] ?? late,
        );
      }

      if (archetype && !oracle.thin) {
        check(
          `visual-${name}-archetype`,
          `${slug}'s ${year} type panel draws the ${archetype}'s picture, labelled with the oracle's numbers`,
          { archetype, label: expectedArchetypeLabel(archetype, oracle) },
          await readArchetypeVisual(recapSection(page, "rhythm")),
        );
        const weekdayRow = archetype !== "weekday-marathoner" && oracle.weekdayCounts.some((count) => count > 0);
        check(
          `visual-${name}-weekday-row`,
          `${slug}'s months panel ${weekdayRow ? "has" : "has no"} a 'By day of the week' strip (${archetype}; ${oracle.episodes} episodes)`,
          weekdayRow ? { row: 1, label: oracle.topWeekday === null ? "Episodes by weekday." : `Episodes by weekday. Peak ${weekdayName(oracle.topWeekday)}.` } : { row: 0, label: null },
          {
            row: await recapSection(page, "months").getByRole("heading", { name: "By day of the week" }).count(),
            label: await recapSection(page, "months")
              .getByRole("img", { name: /^Episodes by weekday\./ })
              .getAttribute("aria-label", { timeout: 1_000 })
              .catch(() => null),
          },
        );
      }

      // The posters in "Most watched, and least known" were shrunk so that
      // row closes up with the Genres card beside it at desktop widths: their
      // natural heights (the bottom of the last child plus the padding, as
      // the grid stretches both to the taller) may differ by 40 px at most.
      if (test.info().project.name === "desktop" && (shown["top-show"] || shown.niche) && shown.genres) {
        const natural = (locator: ReturnType<typeof recapPanel>) =>
          locator.first().evaluate((card) => {
            const top = card.getBoundingClientRect().top;
            const bottom = Math.max(...Array.from(card.children).map((child) => child.getBoundingClientRect().bottom));
            return Math.round(bottom + Number.parseFloat(getComputedStyle(card).paddingBottom) - top);
          }, undefined, { timeout: 2_000 }).catch(() => null);
        const heights = {
          topTitles: await natural(recapPanel(page, /^(Most watched|Least known)/)),
          genres: await natural(recapPanel(page, "Genres")),
        };
        const gap = heights.topTitles === null || heights.genres === null ? null : Math.abs(heights.topTitles - heights.genres);
        check(
          `visual-${name}-poster-row-gap`,
          `at 1440 px the top-titles card and the Genres card beside it differ in natural height by at most ${POSTER_ROW_GAP_PX} px (${JSON.stringify(heights)})`,
          true,
          gap !== null && gap <= POSTER_ROW_GAP_PX,
        );
      }

      // The top band: the months chart fills its card beside a taller type
      // card, and a type's picture is centred in a taller months card's
      // spare height, so neither card's content stops far short of the other.
      // Content bottom: the lowest of the card's children (a centred
      // picture's margins are outside its box).
      if (test.info().project.name === "desktop" && TOP_BAND.has(name)) {
        const contentBottom = (locator: ReturnType<typeof recapPanel>) =>
          locator.first().evaluate((card) => {
            const box = card.getBoundingClientRect();
            const bottom = Math.max(...Array.from(card.children).map((child) => child.getBoundingClientRect().bottom));
            return {
              cardBottom: Math.round(box.bottom - Number.parseFloat(getComputedStyle(card).paddingBottom)),
              contentBottom: Math.round(bottom),
            };
          }, undefined, { timeout: 2_000 }).catch(() => null);
        const band = {
          months: await contentBottom(recapPanel(page, "Watched by month")),
          type: await contentBottom(recapPanel(page, "Your type")),
        };
        const gap = band.months === null || band.type === null ? null : Math.abs(band.months.contentBottom - band.type.contentBottom);
        check(
          `visual-${name}-top-band-gap`,
          `at 1440 px the content of 'Watched by month' and 'Your type' ends within ${TOP_BAND_GAP_PX} px of each other, leaving no empty block under either (${JSON.stringify({ ...band, gap })})`,
          true,
          gap !== null && gap <= TOP_BAND_GAP_PX,
        );
      }

      if (slug === "bat") {
        // bat's year has no episode ticked alone: the biggest day says so
        // instead of drawing its clock.
        check(
          `visual-${name}-clock-disclosure`,
          "bat's biggest day discloses why there is no timeline instead of drawing one",
          true,
          await becomesVisible(recapSection(page, "big-day").getByText(/ticked one at a time.*(nothing|too few) to put on a clock/), 1_000),
        );
      }
    });
  });
}
