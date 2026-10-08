
import { expectedArchetypeLabel, readArchetypeVisual, SEEDED_ARCHETYPES } from "../support/archetype";
import { storageStatePath } from "../support/auth";
import { check } from "../support/evidence";
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
import { test } from "../support/test";

// The story's screenshot set (desktop, phone, small-phone; webkit-phone
// where WebKit runs): one full-page shot per card,
// story/<user>-<year>/<nn>-<heading-slug>, for a full year with a crew
// (ava 2025), a one-show year with no crew (bat 2025) and a films-only year
// (flo 2025, whose long username tests the summary card); and the thin
// story (tia 2025). A card with no h2 is named by its card id instead.
// Which cards appear is checked against the oracle, and every card's width
// against its column and the viewport. The rhythm card's archetype picture
// and the months card's weekday strip are checked against the oracle, and on
// the small phone every card's last line must be reachable by scrolling.
// Read-only; saved storage state. ava, bat and flo have their story marked
// gone through by the seeder (seed.ts STORY_COMPLETED), so reaching the
// summary card posts nothing.

const FLO = "e2e_flo_watches_only_films_and_has_a_long_name";
const YEAR = "2025";

const STORIES: { user: string; slug: string }[] = [
  { user: "e2e_ava", slug: "ava" },
  { user: "e2e_bat", slug: "bat" },
  { user: FLO, slug: "flo" },
];

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

        const archetype = SEEDED_ARCHETYPES[story.user];
        if (state.id === "rhythm" && archetype) {
          check(
            `story-visual-${name}-${nn}-archetype`,
            `the rhythm card draws the ${archetype}'s picture, labelled with the oracle's numbers`,
            { archetype, label: expectedArchetypeLabel(archetype, oracle) },
            await readArchetypeVisual(storyCard(page)),
          );
        }
        if (state.id === "months" && archetype) {
          const weekdayRow = archetype !== "weekday-marathoner" && oracle.weekdayCounts.some((count) => count > 0);
          check(
            `story-visual-${name}-${nn}-weekday-row`,
            `the months card ${weekdayRow ? "has" : "has no"} a 'By day of the week' strip (${archetype})`,
            weekdayRow ? 1 : 0,
            await storyCard(page).getByRole("heading", { name: "By day of the week" }).count(),
          );
        }

        if (test.info().project.name === "small-phone") {
          // A card taller than the 640 px screen scrolls; its last line must
          // be reachable (the Shell grows with its content).
          await page.waitForTimeout(1_200); // the latest Enter (fades in at 1000 ms) has landed
          const bottom = await storyCard(page).evaluate((group) => {
            const root = document.scrollingElement ?? document.documentElement;
            root.scrollTop = root.scrollHeight;
            // Content only: the Shell's aria-hidden wash fills the card
            // (inset-0) and ends a sub-pixel below the screen.
            const leaves = Array.from(group.querySelectorAll("[data-card] *")).filter(
              (node) => node.children.length === 0 && node.getBoundingClientRect().height > 0 && !node.closest('[aria-hidden="true"]'),
            );
            const lowest = Math.max(...leaves.map((node) => node.getBoundingClientRect().bottom));
            const result = { scrolled: root.scrollTop, lowestOnScreen: lowest <= window.innerHeight + 0.5 };
            root.scrollTop = 0;
            return result;
          });
          check(
            `story-visual-${name}-${nn}-bottom-reachable`,
            `card ${position} (${state.id}): scrolled to the bottom (${bottom.scrolled} px), its last line is on screen`,
            true,
            bottom.lowestOnScreen,
          );
        }

        const label = (state.heading && slug(state.heading)) || state.id || "card";
        await shot(page, `story/${name}/${nn}-${label}`, { fullPage: true });
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
