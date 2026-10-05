import { type Locator, type Page } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { expectedBigDay, readBigDay } from "../support/big-day";
import { check, note } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { becomesVisible, dayMonth, pluralise, words, wordValue } from "../support/pages";
import { crewRows, openRecap, readCompare, recapSection, textOf, tileValue } from "../support/recap";
import { shotElement } from "../support/shots";
import {
  type CardState,
  cardState,
  expectedCards,
  expectedProgress,
  goToCard,
  onScreenAndReachable,
  openStory,
  pageScroll,
  PREDICTED_CARDS,
  pressTo,
  progressState,
  reelLength,
  storyCard,
  storyCardAt,
  type StoryCardId,
  tapCentre,
} from "../support/story";
import { test } from "../support/test";

// ava's 2025 story (desktop, phone, small-phone; read-only): walking the
// reel by key and by tap, its progress bars and headings, closing it, the
// crew card's cap, the summary card's Share, the small phone's tall cards,
// and wording that must read as the recap does. On the phones ava's recap is
// open to her (the seeder marked her story gone through, seed.ts
// STORY_COMPLETED), so Close goes to it as on desktop, and reaching the
// summary card posts no completion: this spec stays read-only. The gate
// itself, for a story not yet gone through, is 52-story-gate's; marking it
// is 85-story-completion's. Every fact goes through
// check() -- soft -- so it reaches the evidence log whether it holds or not;
// a test stops early only when the reel never rendered, after logging that.

const AVA = "e2e_ava";
const YEAR = "2025";
const RECAP_PATH = `/series-finale/${YEAR}`;

/** The story's crew card lists this many rows plus the viewer's (StoryCard.tsx CREW_SHOWN). */
const CREW_SHOWN = 5;

const two = (position: number) => String(position).padStart(2, "0");

/** Opens ava's 2025 story; logs whether it rendered, and stops the test if it did not. Returns the reel's length. */
async function openAvaStory(page: Page): Promise<number> {
  const opened = await openStory(page, YEAR);
  check("story-ava-rendered", "ava's 2025 story renders its first card", true, opened && (await storyCard(page).isVisible()));
  if (!opened) throw new Error("ava's 2025 story did not render; nothing else can be checked");
  return reelLength(page);
}

/** Moves to card `id`; logs whether it got there, and stops the test if it did not. */
async function reachCard(page: Page, id: StoryCardId): Promise<void> {
  const reached = await goToCard(page, id);
  check(`story-reach-${id}`, `ArrowRight reaches the ${id} card`, true, reached);
  if (!reached) throw new Error(`the ${id} card was never reached`);
}

test.use({ storageState: storageStatePath(AVA) });

test("walking the reel with ArrowRight: one h1, progress bars and a heading per card", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  const total = await openAvaStory(page);

  check(
    "story-one-h1",
    "the reel has one h1, 'Series Finale 2025' (each card's headline is an h2 beneath it)",
    [`Series Finale ${YEAR}`],
    (await page.getByRole("heading", { level: 1 }).allTextContents()).map((text) => text.trim()),
  );

  const seen: CardState[] = [];
  for (let position = 1; position <= total; position += 1) {
    const nn = two(position);
    if (position > 1) {
      const moved = await pressTo(page, "ArrowRight", position, total);
      check(`story-walk-${nn}-reached`, `ArrowRight moves the reel to card ${position} of ${total}`, true, moved);
      if (!moved) break;
    }
    const state = await cardState(page);
    seen.push(state);
    check(
      `story-walk-${nn}-progress`,
      `on card ${position} of ${total} (${state.id}) the first ${position} progress bars are done (aria-valuenow 1 of aria-valuemax 1), the rest not`,
      { label: `Card ${position} of ${total}`, ...expectedProgress(position, total) },
      { label: state.label, ...(await progressState(page)) },
    );
    const scroll = await pageScroll(page);
    check(
      `story-walk-${nn}-no-horizontal-scroll`,
      `card ${position} (${state.id}) is no wider than the viewport (no sideways scroll)`,
      scroll.viewportWidth,
      scroll.pageWidth,
    );
  }

  check(
    "story-walk-cards",
    "the cards the oracle predicts appear in reel order (genres and rhythm, which the oracle does not compute, are left out of the comparison)",
    expectedCards(oracle),
    seen.map((state) => state.id).filter((id): id is StoryCardId => PREDICTED_CARDS.includes(id as StoryCardId)),
  );
  note(
    "story-walk-headings",
    "each card's h2 in reel order (null where the card has none)",
    "recorded",
    seen.map((state, index) => ({ nn: two(index + 1), card: state.id, heading: state.heading })),
    true,
  );
  const withoutHeading = seen.filter((state) => state.heading === null).map((state) => state.id);
  note(
    "story-cards-without-h2",
    "cards with no h2 (StoryShell gives a Headline only where the mock has one), so heading navigation skips them -- an a11y observation, not a failure",
    [],
    withoutHeading,
    withoutHeading.length === 0,
  );
  check(
    "story-one-h1-at-end",
    "still one h1 on the last card",
    1,
    await page.getByRole("heading", { level: 1 }).count(),
  );
});

test("ArrowLeft goes back, and the reel stops at either end", async ({ page }) => {
  const total = await openAvaStory(page);

  await page.keyboard.press("ArrowLeft");
  check("story-left-at-start", "ArrowLeft on the first card stays on it", "Card 1 of " + total, (await cardState(page)).label);

  check("story-right-to-2", "ArrowRight moves to card 2", true, await pressTo(page, "ArrowRight", 2, total));
  check("story-right-to-3", "ArrowRight moves to card 3", true, await pressTo(page, "ArrowRight", 3, total));
  check("story-left-to-2", "ArrowLeft goes back to card 2", true, await pressTo(page, "ArrowLeft", 2, total));

  const reachedSummary = await goToCard(page, "summary");
  check("story-reach-summary", "ArrowRight reaches the last card, the summary", true, reachedSummary);
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(300);
  const last = await cardState(page);
  check(
    "story-right-at-end",
    "ArrowRight on the last card stays on it (the reel stops, it does not wrap)",
    { label: `Card ${total} of ${total}`, id: "summary" },
    { label: last.label, id: last.id },
  );
});

test("taps: the right two-thirds advance, the left third goes back", async ({ page, hasTouch }) => {
  const total = await openAvaStory(page);
  const previous = await page.getByRole("button", { name: "Previous card" }).boundingBox();
  const next = await page.getByRole("button", { name: "Next card" }).boundingBox();
  const viewport = page.viewportSize();
  check("story-tap-zones", "the reel has its 'Previous card' and 'Next card' tap zones", true, !!previous && !!next && !!viewport);
  if (!previous || !next || !viewport) throw new Error("no tap zones to tap");

  // The reel's column runs from the left zone's left edge to the right zone's
  // right edge (centred, at most 448 px wide on a wide screen). Tap halfway
  // down the visible screen, below the fixed progress-and-close header.
  const left = previous.x;
  const width = next.x + next.width - left;
  const y = Math.round((80 + viewport.height) / 2);
  const rightThird = Math.round(left + (width * 5) / 6);
  const leftThird = Math.round(left + width / 6);

  const zoneAt = (x: number) =>
    page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest("button")?.getAttribute("aria-label") ?? null, [x, y] as const);
  check(
    "story-tap-zone-layout",
    "the right third is the 'Next card' zone and the left third the 'Previous card' zone",
    { rightThird: "Next card", leftThird: "Previous card" },
    { rightThird: await zoneAt(rightThird), leftThird: await zoneAt(leftThird) },
  );

  const tap = (x: number) => (hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  const how = hasTouch ? "a touch tap" : "a click";

  await tap(rightThird);
  check("story-tap-right-to-2", `${how} on the right third moves to card 2`, true, await becomesVisible(storyCardAt(page, 2, total), 5_000));
  await tap(rightThird);
  check("story-tap-right-to-3", `${how} on the right third moves to card 3`, true, await becomesVisible(storyCardAt(page, 3, total), 5_000));
  await tap(leftThird);
  check("story-tap-left-to-2", `${how} on the left third goes back to card 2`, true, await becomesVisible(storyCardAt(page, 2, total), 5_000));
  check("story-tap-url-unchanged", "tapping through the reel stays on the story page", `${RECAP_PATH}/story`, new URL(page.url()).pathname);
});

test("closing: the 'Close story' button, and Escape, return to the recap (on a phone too: ava's story is gone through)", async ({ page, hasTouch }) => {
  const total = await openAvaStory(page);
  await pressTo(page, "ArrowRight", 2, total);

  const close = page.getByRole("button", { name: "Close story" });
  check("story-close-shown", "the reel has a 'Close story' button", true, await becomesVisible(close, 5_000));
  await (hasTouch ? close.tap() : close.click());
  await page.waitForURL((url) => url.pathname === RECAP_PATH, { timeout: 10_000 }).catch(() => undefined);
  check("story-close-to-recap", "'Close story' goes to /series-finale/2025", RECAP_PATH, new URL(page.url()).pathname);

  await openAvaStory(page);
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => url.pathname === RECAP_PATH, { timeout: 10_000 }).catch(() => undefined);
  check("story-escape-to-recap", "Escape goes to /series-finale/2025", RECAP_PATH, new URL(page.url()).pathname);
});

test("the crew card: the top five with rank numbers, ava at her rank, and the rest counted", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaStory(page);
  await reachCard(page, "crew");
  const card = storyCard(page);

  // oracle.crew is everyone ranked, ava included, as CrewRanking orders them.
  const top = oracle.crew.slice(0, CREW_SHOWN);
  const avaRow = oracle.crew.find((member) => member.username === AVA);
  const expectedRows = avaRow && !top.includes(avaRow) ? [...top, avaRow] : top;
  const shownAs = (username: string) => (username === AVA ? "you" : username);

  const rows = await crewRows(card);
  check(
    "story-crew-rows",
    `the crew card shows the oracle's top ${CREW_SHOWN} with their rank numbers, plus ava at her real rank if below them`,
    expectedRows.map((member) => ({ rank: String(member.rank), name: shownAs(member.username), episodes: pluralise(member.episodes, "episode") })),
    rows,
  );
  check(
    "story-crew-ava-rank",
    "ava's row ('you') carries her competition rank from the oracle (tied 2nd with dee)",
    avaRow ? String(avaRow.rank) : null,
    rows.find((row) => row.name === "you")?.rank ?? null,
  );

  const unshown = oracle.crew.length - expectedRows.length;
  check(
    "story-crew-and-more",
    `the rest of the crew is counted: 'And N more.', N = ${oracle.crew.length} ranked - ${expectedRows.length} shown`,
    unshown > 0 ? `And ${words(unshown)} more.` : null,
    await textOf(card.getByText(/^And [\w-]+ more\.$/)),
  );

  const others = oracle.crew.filter((member) => member.username !== AVA);
  const beaten = others.filter((member) => member.episodes < (avaRow?.episodes ?? 0)).length;
  const headline =
    beaten === 0
      ? "You out-watched nobody. It is not a race."
      : beaten === others.length
        ? `You out-watched ${beaten === 1 ? "one person" : `${words(beaten)} people`} who ${beaten === 1 ? "was" : "were"} also trying`
        : `You out-watched ${words(beaten)} of the ${words(others.length)} people who were also trying`;
  check("story-crew-headline", "the crew card's headline counts those ava out-watched (a tie is not out-watching)", headline, (await cardState(page)).heading);
});

test("the compare card: every peer's split and named facts, the closest first, then each swapped in", async ({ page, hasTouch }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaStory(page);
  await reachCard(page, "compare");
  const card = storyCard(page);
  const peers = Object.keys(oracle.compare);

  // "Swap in" lists every peer, the one shown pressed (ComparePeerPicker).
  const chips = card.getByText("Swap in", { exact: true }).locator("xpath=..").getByRole("button");
  const pressedChips = () =>
    chips.evaluateAll((buttons) => buttons.filter((button) => button.getAttribute("aria-pressed") === "true").map((button) => button.textContent?.trim() ?? ""));
  for (const [index, peer] of peers.entries()) {
    const expected = oracle.compare[peer]!;
    if (index > 0) {
      const swap = card.getByText("Swap in", { exact: true }).locator("xpath=..").getByRole("button", { name: peer, exact: true });
      const tapped = await tapCentre(page, swap, hasTouch);
      check(`story-compare-${peer}-swapped`, `tapping '${peer}' in the swap row shows 'You & ${peer}', still on the compare card, with only its chip pressed`, { tapped: true, eyebrow: true, card: "compare", pressed: [peer] }, {
        tapped,
        eyebrow: await becomesVisible(card.getByText(`You & ${peer}`, { exact: true }), 5_000),
        card: (await cardState(page)).id,
        pressed: await pressedChips(),
      });
    } else {
      check(
        "story-compare-first-peer",
        "the card opens on the oracle's closest peer, whose chip is the pressed one",
        { eyebrow: true, pressed: [peer] },
        { eyebrow: await becomesVisible(card.getByText(`You & ${peer}`, { exact: true }), 5_000), pressed: await pressedChips() },
      );
    }
    const shown = await readCompare(card, peer);
    check(
      `story-compare-${peer}-split`,
      `the large discs show only you / both / only ${peer} as the oracle`,
      { onlyYou: expected.onlyYou, both: expected.both, onlyThem: expected.onlyThem },
      { onlyYou: shown.onlyYou, both: shown.both, onlyThem: shown.onlyThem },
    );
    check(
      `story-compare-${peer}-facts`,
      `'${peer} finished, you dropped' and 'On both lists, neither started' name the oracle's titles (or are absent)`,
      { theyFinishedYouDropped: expected.theyFinishedYouDropped, bothPlanning: expected.bothPlanning },
      { theyFinishedYouDropped: shown.theyFinishedYouDropped, bothPlanning: shown.bothPlanning },
    );
  }
});

test("the biggest day card: its clock's hour ticks, labelled points and listed episodes", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaStory(page);
  await reachCard(page, "bigDay");
  check(
    "story-big-day-clock",
    `the big-day card's hour ticks (the narrow set), each point's hover title (no dot announced), the summary line and the listed rows are the oracle's timeline in ${oracle.timezone}`,
    expectedBigDay(oracle, "story"),
    await readBigDay(storyCard(page)),
  );
});

/**
 * Each of CompareSplit's three labels ("only you", "both", "only <peer>")
 * under `container`, and whether it is whole: its content no wider or taller
 * than its box (F5: the peer's label was cut to its box, its last glyph lost).
 */
function compareLabels(container: Locator) {
  return container.locator("[data-region]").evaluateAll((regions) =>
    regions.map((region) => {
      const label = region.lastElementChild as HTMLElement | null;
      return {
        label: label?.textContent?.trim() ?? null,
        whole: !!label && label.scrollWidth <= label.clientWidth && label.scrollHeight <= label.clientHeight,
      };
    }),
  );
}

const wholeLabels = (peer: string) => ["only you", "both", `only ${peer}`].map((label) => ({ label, whole: true }));

test("F5: every compare label is whole, in the story card's large discs and the recap panel's default ones, for every peer", async ({ page, hasTouch }) => {
  const oracle = oracleYear(AVA, YEAR);
  const peers = Object.keys(oracle.compare);

  // The story card (CompareSplit size "large").
  await openAvaStory(page);
  await reachCard(page, "compare");
  const card = storyCard(page);
  for (const [index, peer] of peers.entries()) {
    if (index > 0) {
      await tapCentre(page, card.getByText("Swap in", { exact: true }).locator("xpath=..").getByRole("button", { name: peer, exact: true }), hasTouch);
      await becomesVisible(card.getByText(`You & ${peer}`, { exact: true }), 5_000);
    }
    check(
      `F5-compare-labels-whole-story-${peer}`,
      `APP FINDING F5, fixed: on the story's compare card with ${peer} swapped in, every disc label is whole (scrollWidth <= clientWidth); see story/ava-2025-compare/${peer}`,
      wholeLabels(peer),
      await compareLabels(card),
    );
    await shotElement(card, `story/ava-2025-compare/${peer}`);
  }

  // The recap panel (CompareSplit size "default").
  const rendered = await openRecap(page, YEAR);
  check("F5-recap-rendered", "ava's 2025 recap renders", true, rendered);
  const chips = recapSection(page, "compare").getByText("Swap in", { exact: true }).locator("xpath=..").getByRole("button");
  for (const [index, peer] of peers.entries()) {
    if (index > 0) {
      const chip = chips.filter({ hasText: new RegExp(`^${peer}$`) });
      await (hasTouch ? chip.tap() : chip.click()).catch(() => undefined);
      await becomesVisible(page.getByRole("heading", { level: 2, name: `You & ${peer}`, exact: true }), 5_000);
    }
    const panel = recapSection(page, "compare");
    check(
      `F5-compare-labels-whole-recap-${peer}`,
      `APP FINDING F5, fixed: on the recap's compare panel with ${peer} swapped in, every disc label is whole (scrollWidth <= clientWidth); see recap/ava-2025-compare/${peer}`,
      wholeLabels(peer),
      await compareLabels(panel),
    );
    await shotElement(panel, `recap/ava-2025-compare/${peer}`);
  }
});

test("the summary card: 'Share your card' shares, and the reel neither advances nor closes", async ({ page, hasTouch }) => {
  // navigator.share with a file resolves at once and records what it was given.
  await page.addInitScript(() => {
    const shares: { name: string; type: string }[] = [];
    Object.assign(window, { __e2eShares: shares });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data?: ShareData) => {
        for (const file of data?.files ?? []) shares.push({ name: file.name, type: file.type });
        return Promise.resolve();
      },
    });
  });
  const total = await openAvaStory(page);
  await reachCard(page, "summary");

  const button = page.getByRole("button", { name: "Share your card" });
  check("story-share-shown", "the summary card has a 'Share your card' button", true, await becomesVisible(button, 5_000));
  await button.scrollIntoViewIfNeeded();
  const before = { path: new URL(page.url()).pathname, ...(await cardState(page)) };
  const reach = await onScreenAndReachable(button);
  check(
    "story-share-above-tap-zones",
    "the Share button is on screen and is what a tap at its centre hits (not the 'Next card' zone under it)",
    { inViewport: true, hitAtCentre: true },
    reach,
  );

  await tapCentre(page, button, hasTouch);
  const shared = await page
    .waitForFunction(() => (window as unknown as { __e2eShares: unknown[] }).__e2eShares.length > 0, undefined, { timeout: 15_000 })
    .then(
      () => true,
      () => false,
    );
  const shares = await page.evaluate(() => (window as unknown as { __e2eShares: { name: string; type: string }[] }).__e2eShares);
  check(
    "story-share-called",
    "the tap reached navigator.share with the card: one PNG, series-finale-2025.png",
    { shared: true, files: [{ name: `series-finale-${YEAR}.png`, type: "image/png" }] },
    { shared, files: shares },
  );

  // Give a stray card change or navigation time to happen before looking.
  await page.waitForTimeout(500);
  const after = { path: new URL(page.url()).pathname, ...(await cardState(page)) };
  check(
    "story-share-reel-unchanged",
    "after the Share tap the URL and the card are unchanged (the summary is the last card, so the share-called check above is what shows the tap did not fall through to a tap zone)",
    { path: `${RECAP_PATH}/story`, label: `Card ${total} of ${total}`, id: "summary" },
    { path: after.path, label: after.label, id: after.id },
  );
  check("story-share-same-as-before", "the URL and card index before and after the tap match", { path: before.path, label: before.label }, { path: after.path, label: after.label });
  check(
    "story-share-no-failure-line",
    "no 'could not be made' line after a share that resolved",
    0,
    await page.getByText("That card could not be made").count(),
  );
});

test("small phone: the tallest cards scroll to their bottom, and each next card starts at the top", async ({ page, hasTouch }, testInfo) => {
  test.skip(testInfo.project.name !== "small-phone", "the 360×640 small-phone project only");
  const oracle = oracleYear(AVA, YEAR);
  const total = await openAvaStory(page);
  await reachCard(page, "months");

  const tmdbLogo = storyCard(page).getByRole("img", { name: "TMDB" });
  const tmdbDisclaimer = storyCard(page).getByText(/not endorsed or certified by TMDB/);
  const scrollToBottom = async () => {
    const heights = await page.evaluate(() => {
      const root = document.scrollingElement ?? document.documentElement;
      root.scrollTop = root.scrollHeight;
      return { scrollHeight: root.scrollHeight, clientHeight: root.clientHeight };
    });
    await page.waitForTimeout(200);
    return heights;
  };
  const inViewport = async (locator: Locator) => {
    const reach = await onScreenAndReachable(locator);
    return reach === null ? null : reach.inViewport;
  };

  // The months card (a little taller with the weekday strip, which ava's
  // marathoner card leaves out) and the biggest day (its axis plus the listed
  // episodes: about 220 px past a 640 px screen) joined the tall cards in
  // plan 6; shame, crew and compare were already.
  const tallest: StoryCardId[] = ["months", "bigDay", "shame", "crew", "compare"];
  /** Whether the card's lowest content -- its last line, whatever it is -- is on screen. */
  const bottomOnScreen = () =>
    storyCard(page).evaluate((group) => {
      // Content only: the Shell's aria-hidden wash fills the card (inset-0)
      // and ends a sub-pixel below the screen.
      const leaves = Array.from(group.querySelectorAll("[data-card] *")).filter(
        (node) => node.children.length === 0 && node.getBoundingClientRect().height > 0 && !node.closest('[aria-hidden="true"]'),
      );
      const lowest = Math.max(...leaves.map((node) => node.getBoundingClientRect().bottom));
      return lowest <= window.innerHeight + 0.5;
    });
  for (const [index, id] of tallest.entries()) {
    if (index > 0) {
      const moved = await goToCard(page, id);
      check(`story-small-${id}-reached`, `ArrowRight moves on to the ${id} card`, true, moved);
      if (!moved) break;
      await page.waitForTimeout(100);
      check(`story-small-${id}-starts-at-top`, `the ${id} card starts at the top of the page (scroll reset)`, 0, (await pageScroll(page)).scrollTop);
    }

    const heights = await scrollToBottom();
    // ava's months card has no weekday strip (hers is the marathoner's rhythm
    // card), so it may just fit; the non-marathoners' months cards scroll a
    // little (51-story-visual checks each card's bottom is reachable).
    const mayFit = id === "months";
    note(
      `story-small-${id}-height`,
      `the ${id} card's page height against the 640 px screen`,
      mayFit ? "at most a little taller than the screen" : "taller than the screen",
      heights,
      mayFit || heights.scrollHeight > heights.clientHeight,
    );

    if (id === "months" || id === "bigDay") {
      check(`story-small-${id}-bottom`, `scrolled to the bottom, the ${id} card's last line is on screen`, true, await bottomOnScreen());
      if (id === "bigDay") {
        check(
          "story-small-bigDay-last-row",
          "scrolled to the bottom, the biggest day's last listed episode is on screen",
          true,
          await inViewport(storyCard(page).locator("[data-episode-row]").last()),
        );
      }
      continue;
    }

    if (id === "crew") {
      // The crew card shows no TMDB metadata, so it carries no attribution: its bottom is the count of the rest.
      check("story-small-crew-bottom", "scrolled to the bottom, the crew card's 'And N more.' line is on screen", true, await inViewport(storyCard(page).getByText(/^And [\w-]+ more\.$/)));
      continue;
    }

    check(`story-small-${id}-tmdb-logo`, `scrolled to the bottom, the ${id} card's TMDB logo is on screen`, true, await inViewport(tmdbLogo));
    check(`story-small-${id}-tmdb-disclaimer`, `scrolled to the bottom, the ${id} card's TMDB disclaimer is on screen`, true, await inViewport(tmdbDisclaimer));

    if (id === "compare") {
      const peers = Object.keys(oracle.compare);
      const swaps = storyCard(page).getByText("Swap in", { exact: true }).locator("xpath=..").getByRole("button");
      check(
        "story-small-compare-swap-peers",
        "the compare card's 'Swap in' row offers every peer the oracle compares, closest first, the shown one pressed",
        peers.map((peer, index) => ({ name: peer, pressed: String(index === 0) })),
        await swaps.evaluateAll((buttons) => buttons.map((button) => ({ name: button.textContent?.trim() ?? "", pressed: button.getAttribute("aria-pressed") ?? "" }))),
      );
      const reach = await Promise.all((await swaps.all()).map((swap) => onScreenAndReachable(swap)));
      check(
        "story-small-compare-swaps-reachable",
        "scrolled to the bottom, every 'Swap in' button is on screen and is what a tap at its centre hits",
        peers.map(() => ({ inViewport: true, hitAtCentre: true })),
        reach,
      );

      const swapTo = peers[1];
      if (swapTo) {
        const before = (await cardState(page)).label;
        const swap = swaps.filter({ hasText: swapTo });
        await tapCentre(page, swap, hasTouch);
        check(
          "story-small-compare-swap",
          `tapping '${swapTo}' swaps the compared peer in and leaves the card where it is`,
          { eyebrow: true, label: before },
          { eyebrow: await becomesVisible(storyCard(page).getByText(`You & ${swapTo}`, { exact: true }), 5_000), label: (await cardState(page)).label },
        );
      }
    }
  }

  const moved = await pressTo(page, "ArrowRight", total, total);
  check("story-small-summary-reached", "ArrowRight moves on to the summary card", true, moved);
  await page.waitForTimeout(100);
  check("story-small-summary-starts-at-top", "the summary card starts at the top of the page (scroll reset)", 0, (await pageScroll(page)).scrollTop);
});

test("wording matches the recap: dropped count, 'last watched' and straight days", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  const rendered = await openRecap(page, YEAR);
  check("story-parity-recap-rendered", "ava's 2025 recap renders", true, rendered);

  // The recap's side.
  const recapDropped = await tileValue(page, "Shows dropped");
  const recapStats = await textOf(recapSection(page, "top-show").locator("p").nth(1));
  const recapLastWatched = /last watched (.+)$/.exec(recapStats ?? "")?.[1] ?? null;
  const heroSentence = await textOf(recapSection(page, "hero").locator("p").nth(2));
  const recapStraightDays = /([\w-]+ straight days?) of screen/i.exec(heroSentence ?? "")?.[1]?.toLowerCase() ?? null;

  // The story's side.
  await openAvaStory(page);
  await reachCard(page, "hours");
  const hoursText = await textOf(storyCard(page));
  const storyStraightDays = /That is ([\w-]+ straight days?)/.exec(hoursText ?? "")?.[1] ?? null;

  await reachCard(page, "finished");
  const finishedText = await textOf(storyCard(page));
  const droppedWord = /given ([\w-]+) others? did not make it/.exec(finishedText ?? "")?.[1] ?? null;
  const storyDropped = droppedWord === null ? null : wordValue(droppedWord);

  await reachCard(page, "topShow");
  const topShowText = await textOf(storyCard(page));
  const storyLastWatched = /last watched (\d{1,2} [A-Z][a-z]+)/.exec(topShowText ?? "")?.[1] ?? null;

  await reachCard(page, "summary");
  const abandoned = await textOf(storyCard(page).locator("dt", { hasText: "abandoned" }).locator("xpath=following-sibling::dd[1]"));

  const days = Math.floor(oracle.minutes / (24 * 60));
  check(
    "story-parity-dropped",
    "the finished card's 'given N others did not make it' is the recap's 'Shows dropped' tile (and the oracle's titlesDropped)",
    { recap: String(oracle.titlesDropped), story: oracle.titlesDropped },
    { recap: recapDropped, story: storyDropped },
  );
  check(
    "story-parity-summary-abandoned",
    "the summary card's 'abandoned' is the recap's 'Shows dropped' tile",
    { recap: String(oracle.titlesDropped), story: String(oracle.titlesDropped) },
    { recap: recapDropped, story: abandoned },
  );
  check(
    "story-parity-last-watched",
    "the top show card's 'last watched' date is the recap's (the oracle's topShowLastWatched)",
    oracle.topShowLastWatched === null ? null : { recap: dayMonth(oracle.topShowLastWatched), story: dayMonth(oracle.topShowLastWatched) },
    { recap: recapLastWatched, story: storyLastWatched },
  );
  const phrase = `${words(days)} straight ${days === 1 ? "day" : "days"}`;
  check(
    "story-parity-straight-days",
    "the hours card's straight days read as the recap hero's (whole days of the oracle's minutes, in words)",
    { recap: phrase, story: phrase },
    { recap: recapStraightDays, story: storyStraightDays },
  );
});
