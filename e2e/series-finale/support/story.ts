// Locators and moves for the story reel (/series-finale/<period>/story).
// src/ carries no test ids, but the reel names itself: the current card is
// the one `role="group"` with `aria-roledescription="card"` and an
// aria-label "Card i of N"; its Shell carries `data-card=<id>`; the progress
// bars are `role="progressbar"`; the tap zones are the "Previous card" and
// "Next card" buttons; the close control is "Close story".
import type { Locator, Page } from "@playwright/test";

import type { OracleYear } from "../seed/oracle";
import { becomesVisible } from "./pages";

/** StoryReel.tsx's REEL_ORDER: the narrative order every reel filters. */
export const REEL_ORDER = [
  "intro",
  "hours",
  "episodes",
  "finished",
  "topShow",
  "niche",
  "genres",
  "months",
  "bigDay",
  "rhythm",
  "shame",
  "crew",
  "compare",
  "summary",
] as const;

export type StoryCardId = (typeof REEL_ORDER)[number];

/** The cards whose presence the oracle decides; genres and rhythm depend on data it does not compute. */
export const PREDICTED_CARDS: StoryCardId[] = REEL_ORDER.filter((id) => id !== "genres" && id !== "rhythm");

/** Which predicted cards the reel keeps for this oracle year (StoryReel.tsx's hasContent), in reel order. */
export function expectedCards(oracle: OracleYear): StoryCardId[] {
  const has: Record<StoryCardId, boolean> = {
    intro: true,
    hours: true,
    episodes: oracle.episodes > 0,
    finished: oracle.titlesCompleted > 0,
    topShow: oracle.topShow !== null,
    niche: oracle.niche !== null,
    genres: false,
    // buildMonths (aggregate.ts) buckets episodes AND completed films, so a
    // films-only year still has a months card.
    months: oracle.episodes > 0 || oracle.filmsCompleted > 0,
    bigDay: oracle.bigDay !== null,
    rhythm: false,
    shame: oracle.titlesDropped > 0 || oracle.stillPlanning.length > 0,
    crew: oracle.crew.length > 0,
    compare: Object.keys(oracle.compare).length > 0,
    summary: true,
  };
  return PREDICTED_CARDS.filter((id) => has[id]);
}

/** The card on screen: the reel's one card group. */
export function storyCard(page: Page): Locator {
  return page.locator('[role="group"][aria-roledescription="card"]');
}

/** The card group once it reads "Card <position> of <total>" (1-based). */
export function storyCardAt(page: Page, position: number, total: number): Locator {
  return page.locator(`[role="group"][aria-roledescription="card"][aria-label="Card ${position} of ${total}"]`);
}

// A first visit to a period can be generating it.
const FIRST_GENERATION_MS = 30_000;

/**
 * Opens `/series-finale/<year>/story` and waits for the first card (or the
 * thin-year card). Says whether it did, without throwing, so the caller can
 * check() it.
 */
export async function openStory(page: Page, year: string): Promise<boolean> {
  await page.goto(`/series-finale/${year}/story`);
  return becomesVisible(
    storyCard(page).or(page.getByRole("heading", { name: `Not much of a ${year}` })),
    FIRST_GENERATION_MS,
  );
}

export interface CardState {
  /** The Shell's data-card, e.g. "crew". */
  id: string | null;
  /** The group's aria-label, "Card 3 of 14". */
  label: string | null;
  /** The card's h2 text, whitespace collapsed; null when the card has none. */
  heading: string | null;
}

/** What the reel is showing now. */
export async function cardState(page: Page): Promise<CardState> {
  return page.evaluate(() => {
    const group = document.querySelector('[role="group"][aria-roledescription="card"]');
    const heading = group?.querySelector("h2")?.textContent?.replace(/\s+/g, " ").trim() ?? null;
    return {
      id: group?.querySelector("[data-card]")?.getAttribute("data-card") ?? null,
      label: group?.getAttribute("aria-label") ?? null,
      heading,
    };
  });
}

export interface ProgressState {
  bars: number;
  /** Every bar's aria-valuemax, deduplicated: ["1"] when all say 1. */
  valuemax: string[];
  /** Every bar's aria-valuenow as one string, "1110000" -- done bars first. */
  valuenow: string;
}

export async function progressState(page: Page): Promise<ProgressState> {
  return page.getByRole("progressbar").evaluateAll((bars) => ({
    bars: bars.length,
    valuemax: [...new Set(bars.map((bar) => bar.getAttribute("aria-valuemax") ?? "none"))],
    valuenow: bars.map((bar) => bar.getAttribute("aria-valuenow") ?? "?").join(""),
  }));
}

/** The progress a reel of `total` cards should show on card `position` (1-based). */
export function expectedProgress(position: number, total: number): ProgressState {
  return { bars: total, valuemax: ["1"], valuenow: "1".repeat(position) + "0".repeat(total - position) };
}

/**
 * Presses `key` and waits (softly) for the reel to show card `position` of
 * `total`. Says whether it got there.
 */
export async function pressTo(page: Page, key: "ArrowRight" | "ArrowLeft", position: number, total: number): Promise<boolean> {
  await page.keyboard.press(key);
  return becomesVisible(storyCardAt(page, position, total), 5_000);
}

/**
 * Presses ArrowRight until the card `id` is on screen, from wherever the reel
 * is. Says whether it got there (false if the reel ran out first).
 */
export async function goToCard(page: Page, id: StoryCardId): Promise<boolean> {
  for (let step = 0; step < REEL_ORDER.length; step += 1) {
    const state = await cardState(page);
    if (state.id === id) return true;
    const match = /^Card (\d+) of (\d+)$/.exec(state.label ?? "");
    if (!match) return false;
    const position = Number(match[1]);
    const total = Number(match[2]);
    if (position >= total) return false;
    if (!(await pressTo(page, "ArrowRight", position + 1, total))) return false;
  }
  return false;
}

/** The reel's size, from its progress bars. */
export async function reelLength(page: Page): Promise<number> {
  return page.getByRole("progressbar").count();
}

/** The page's scroll position and whether it scrolls sideways (documentElement, as 41-recap-visual measures). */
export async function pageScroll(page: Page): Promise<{ scrollTop: number; pageWidth: number; viewportWidth: number }> {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return {
      scrollTop: root.scrollTop,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    };
  });
}

/** Waits (softly) until every <img> has finished loading, so a screenshot shows posters, not holes. */
export async function imagesLoaded(page: Page): Promise<void> {
  await page
    .waitForFunction(() => Array.from(document.images).every((image) => image.complete), undefined, { timeout: 15_000 })
    .catch(() => undefined);
}

/**
 * Whether `locator` lies wholly inside the viewport and is the element hit at
 * its own centre -- on screen and not covered (by the fixed header, a tap
 * zone, anything). Null when it is absent.
 */
export async function onScreenAndReachable(locator: Locator): Promise<{ inViewport: boolean; hitAtCentre: boolean } | null> {
  if ((await locator.count()) === 0) return null;
  return locator.first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const inViewport = rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return { inViewport, hitAtCentre: !!hit && (hit === element || element.contains(hit)) };
  });
}

/** "The Bear" -> "the-bear"; long headings are cut at a word boundary. */
export function slug(text: string, max = 48): string {
  const full = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  if (full.length <= max) return full;
  const cut = full.slice(0, max);
  return cut.slice(0, cut.lastIndexOf("-") > 0 ? cut.lastIndexOf("-") : max);
}

/**
 * Taps the centre of `locator` by coordinates (a click without touch), so
 * whatever is on top there gets it, as a finger's would -- unlike
 * locator.tap(), which waits for the element itself to be hittable. Says
 * whether there was anything to tap.
 */
export async function tapCentre(page: Page, locator: Locator, hasTouch: boolean): Promise<boolean> {
  await locator.scrollIntoViewIfNeeded({ timeout: 5_000 }).catch(() => undefined);
  const box = await locator.boundingBox({ timeout: 5_000 }).catch(() => null);
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await (hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
  return true;
}
