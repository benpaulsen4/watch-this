import { type Page, test } from "@playwright/test";

import type { OracleYear } from "../seed/oracle";
import { storageStatePath } from "../support/auth";
import { check, note } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { shot } from "../support/shots";
import {
  cardState,
  expectedCards,
  imagesLoaded,
  openStory,
  PREDICTED_CARDS,
  pressTo,
  reelLength,
  slug,
  storyCard,
  type StoryCardId,
} from "../support/story";

// The story's screenshot set (desktop, phone, small-phone; webkit-phone
// where WebKit runs): one full-page shot per card,
// story/<user>-<year>/<nn>-<heading-slug>, for a full year with a crew
// (ava 2025), a one-show year with no crew (bat 2025) and a films-only year
// (flo 2025, whose long username tests the summary card); and the thin
// story (tia 2025). A card with no h2 is named by its card id instead.
// Which cards appear is checked against the oracle, and every card's width
// against its column and the viewport.
// Read-only; saved storage state.

const FLO = "e2e_flo_watches_only_films_and_has_a_long_name";
const YEAR = "2025";

const STORIES: { user: string; slug: string }[] = [
  { user: "e2e_ava", slug: "ava" },
  { user: "e2e_bat", slug: "bat" },
  { user: FLO, slug: "flo" },
];

/**
 * APP FINDING F5, recorded as a named note: on the phones (DPR 2) the story
 * compare card's large "only <peer>" disc label loses the last glyph's right
 * edge -- "only e2e_bo" reads "e2e_bc" in the phone and small-phone shots of
 * ava's compare card; desktop (DPR 1) draws it whole. CompareSplit's large
 * label is `truncate` (overflow hidden) and its text is exactly as wide as
 * its box, so the ink of the final glyph is cut with no room for an
 * ellipsis. The verdict is by eye (the review zoomed into both shots); the
 * DOM widths are recorded beside it.
 */
async function noteCompareDiscLabel(page: Page, oracle: OracleYear, shotName: string): Promise<void> {
  const peer = Object.keys(oracle.compare)[0] ?? "";
  const project = test.info().project.name;
  const widths = await storyCard(page)
    .getByText(`only ${peer}`, { exact: true })
    .evaluate(
      (element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const round = (value: number) => Math.round(value * 100) / 100;
        return { textWidth: round(range.getBoundingClientRect().width), boxWidth: round(element.getBoundingClientRect().width) };
      },
      undefined,
      { timeout: 2_000 },
    )
    .catch(() => null);
  const clippedByEye = project === "phone" || project === "small-phone";
  note(
    "F5-compare-disc-label-clipped",
    `APP FINDING F5: the story compare card's 'only ${peer}' disc label is drawn whole. Screenshots: ` +
      "artifacts/screenshots/phone/story/ava-2025/13-a-shared-list-and-some-shared-taste.png, " +
      "artifacts/screenshots/small-phone/story/ava-2025/13-a-shared-list-and-some-shared-taste.png (clipped); " +
      "artifacts/screenshots/desktop/story/ava-2025/13-a-shared-list-and-some-shared-taste.png (whole)",
    `'only ${peer}' fully visible`,
    {
      screenshot: `artifacts/screenshots/${project}/${shotName}.png`,
      byEye: clippedByEye ? `final glyph cut: reads 'only ${peer.slice(0, -1)}c'` : "drawn whole",
      devicePixelRatio: await page.evaluate(() => window.devicePixelRatio),
      dom: widths,
    },
    !clippedByEye,
  );
}

// WebKit cannot launch on this host (Task 1: missing system libraries), so the
// webkit-phone project skips rather than failing at browser launch.
test.skip(({ browserName }) => browserName === "webkit", "WebKit does not launch on this host (Task 1); webkit-phone is best-effort");

for (const story of STORIES) {
  const name = `${story.slug}-${YEAR}`;

  test.describe(name, () => {
    test.use({ storageState: storageStatePath(story.user) });

    test(`story ${name}: one screenshot per card`, async ({ page }) => {
      const oracle = oracleYear(story.user, YEAR);
      const opened = await openStory(page, YEAR);
      check(`story-visual-${name}-rendered`, `${story.slug}'s ${YEAR} story renders its first card`, true, opened && (await storyCard(page).isVisible()));
      if (!opened) return;

      const total = await reelLength(page);
      const cards: (string | null)[] = [];
      for (let position = 1; position <= total; position += 1) {
        if (position > 1 && !(await pressTo(page, "ArrowRight", position, total))) {
          check(`story-visual-${name}-reached-${position}`, `ArrowRight moves the reel to card ${position} of ${total}`, true, false);
          break;
        }
        const state = await cardState(page);
        cards.push(state.id);
        await imagesLoaded(page);
        const nn = String(position).padStart(2, "0");

        // Layout: the card's content stays inside the reel's column, and
        // nothing pushes the page sideways (as 41-recap-visual measures).
        const layout = await page.evaluate(() => {
          const group = document.querySelector('[role="group"][aria-roledescription="card"]');
          return {
            viewportWidth: document.documentElement.clientWidth,
            pageWidth: document.documentElement.scrollWidth,
            cardWidth: group?.clientWidth ?? null,
            cardContentWidth: group?.scrollWidth ?? null,
          };
        });
        check(
          `story-visual-${name}-${nn}-fits-column`,
          `card ${position} (${state.id}): its content is no wider than the reel's column`,
          layout.cardWidth,
          layout.cardContentWidth,
        );
        check(
          `story-visual-${name}-${nn}-no-horizontal-scroll`,
          `card ${position} (${state.id}) is no wider than the viewport (no sideways scroll)`,
          layout.viewportWidth,
          layout.pageWidth,
        );

        const label = (state.heading && slug(state.heading)) || state.id || "card";
        const shotName = `story/${name}/${nn}-${label}`;
        await shot(page, shotName, { fullPage: true });

        if (story.slug === "ava" && state.id === "compare") await noteCompareDiscLabel(page, oracle, shotName);
      }

      check(
        `story-visual-${name}-cards`,
        `the cards ${story.slug}'s ${YEAR} story keeps are the ones the oracle predicts, in reel order (genres and rhythm not predicted)`,
        expectedCards(oracle),
        cards.filter((id): id is StoryCardId => PREDICTED_CARDS.includes(id as StoryCardId)),
      );
    });
  });
}

test.describe(`tia-${YEAR}`, () => {
  test.use({ storageState: storageStatePath("e2e_tia") });

  test(`story tia-${YEAR}: the thin-year card`, async ({ page }) => {
    const opened = await openStory(page, YEAR);
    const thin = page.getByRole("heading", { name: `Not much of a ${YEAR}` });
    check("story-visual-tia-thin", "tia's thin 2025 story is the thin-year card", true, opened && (await thin.isVisible()));
    check("story-visual-tia-no-reel", "the thin story has no reel (no progress bars)", 0, await page.getByRole("progressbar").count());
    await shot(page, `story/tia-${YEAR}/thin`, { fullPage: true });
  });
});
