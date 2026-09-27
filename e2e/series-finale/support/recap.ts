// Locators for the recap page (/series-finale/<period>) and its sections.
// src/ carries no test ids, so every section is found by role, heading or
// text: the hero is <main>'s first <section>, the stat tiles the <section>
// holding "Episodes watched", each panel the card around its <h2>, and the
// footer <main>'s <footer>. The top show and the niche share one panel, so
// each is the column holding its "Show" or "Film" badge.
import type { Locator, Page } from "@playwright/test";

import { becomesVisible } from "./pages";

/** The recap's sections, in page order, as the screenshot names spell them. */
export const RECAP_SECTIONS = [
  "hero",
  "tiles",
  "months",
  "rhythm",
  "top-show",
  "niche",
  "genres",
  "big-day",
  "shame",
  "crew",
  "compare",
  "footer",
] as const;

export type RecapSection = (typeof RECAP_SECTIONS)[number];

/**
 * A recap panel: the card around its <h2> title. The Panel is Card > header
 * block > title row > h2, so the card is the heading's third <div> ancestor
 * -- structural, since the card has no role or name of its own.
 */
export function recapPanel(page: Page, title: string | RegExp): Locator {
  const heading =
    typeof title === "string"
      ? page.getByRole("heading", { level: 2, name: title, exact: true })
      : page.getByRole("heading", { level: 2, name: title });
  return heading.locator("xpath=ancestor::div[3]");
}

/** The top-titles panel, whichever of its three titles it has. */
function topTitlesPanel(page: Page): Locator {
  return recapPanel(page, /^(Most watched|Least known)/);
}

/** One column of the top-titles panel: the one carrying the `badge` ("Show" or "Film"). */
function topTitlesColumn(page: Page, badge: "Show" | "Film"): Locator {
  return topTitlesPanel(page)
    .locator(":scope > div")
    .nth(1)
    .locator(":scope > div")
    .filter({ has: page.getByText(badge, { exact: true }) });
}

export function recapSection(page: Page, section: RecapSection): Locator {
  switch (section) {
    case "hero":
      return page.locator("main > section").first();
    case "tiles":
      return page.locator("main section").filter({ hasText: "Episodes watched" });
    case "months":
      return recapPanel(page, "Watched by month");
    case "rhythm":
      return recapPanel(page, "Your type");
    case "top-show":
      return topTitlesColumn(page, "Show");
    case "niche":
      return topTitlesColumn(page, "Film");
    case "genres":
      return recapPanel(page, "Genres");
    case "big-day":
      return recapPanel(page, "Biggest day");
    case "shame":
      return recapPanel(page, "Walked out on");
    case "crew":
      return recapPanel(page, "The crew");
    case "compare":
      return recapPanel(page, /^You & /);
    case "footer":
      return page.locator("main footer");
  }
}

/** The loaded recap's sign of life: the hero's "1 January – 31 December <year>" line. */
export function recapHeroRange(page: Page, year: string): Locator {
  return page.locator("main > section").first().getByText(`1 January – 31 December ${year}`);
}

/** The thin-year card's heading. */
export function thinYearHeading(page: Page, year: string): Locator {
  return page.getByRole("heading", { name: `Not much of a ${year}` });
}

// A first visit to a period can be generating it.
const FIRST_GENERATION_MS = 30_000;

/**
 * Opens `/series-finale/<year>` and waits for the recap (or the thin card) to
 * render. Says whether it did, without throwing, so the caller can check() it.
 */
export async function openRecap(page: Page, year: string): Promise<boolean> {
  await page.goto(`/series-finale/${year}`);
  return becomesVisible(recapHeroRange(page, year).or(thinYearHeading(page, year)), FIRST_GENERATION_MS);
}

/**
 * Scrolls the page top to bottom so every lazy poster starts loading, then
 * waits for the network to go quiet and every <img> to finish, and scrolls
 * back -- so a full-page or element screenshot shows posters, not holes.
 */
export async function loadAllImages(page: Page): Promise<void> {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = page.viewportSize()?.height ?? 800;
  for (let y = 0; y < height; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(100);
  }
  await page.waitForLoadState("networkidle");
  await page
    .waitForFunction(() => Array.from(document.images).every((image) => image.complete), undefined, { timeout: 15_000 })
    .catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** An element's text with whitespace collapsed; null when it is absent. */
export async function textOf(locator: Locator): Promise<string | null> {
  const text = await locator.first().textContent({ timeout: 1_000 }).catch(() => null);
  return text === null ? null : text.replace(/\s+/g, " ").trim();
}

/** A stat tile's big number, found by its label. */
export async function tileValue(page: Page, label: string | RegExp): Promise<string | null> {
  const tile = recapSection(page, "tiles").locator(":scope > div").filter({ hasText: label });
  return textOf(tile.locator(":scope > div").first());
}

export interface CrewRow {
  /** The row's rank number: the story's large list prints one, the recap's does not (null). */
  rank: string | null;
  /** The name as shown: a username, or "you" for the viewer. */
  name: string | null;
  /** "230 episodes". */
  episodes: string | null;
}

/**
 * CrewRanking's rows inside `container` (the recap's crew panel or the
 * story's crew card): `[data-rank]`, the `[data-name]` span, and the count
 * in the span after it.
 */
export async function crewRows(container: Locator): Promise<CrewRow[]> {
  return container.locator("ol > li").evaluateAll((items) =>
    items.map((item) => ({
      rank: item.querySelector("[data-rank]")?.textContent?.trim() ?? null,
      name: item.querySelector("[data-name]")?.textContent?.trim() ?? null,
      episodes: item.querySelector("[data-name] + span")?.textContent?.trim() ?? null,
    })),
  );
}

/** What a compare panel or card shows for one peer: CompareSplit's three discs and CompareFacts' two named facts. */
export interface ComparedPeer {
  onlyYou: number | null;
  both: number | null;
  onlyThem: number | null;
  theyFinishedYouDropped: string | null;
  bothPlanning: string | null;
}

/**
 * Reads CompareSplit and CompareFacts inside `container` (the recap's compare
 * panel or the story's compare card) for `peer`: each disc's count is the
 * div before its label, each fact the <dd> after its <dt>. Absent parts read
 * null.
 */
export async function readCompare(container: Locator, peer: string): Promise<ComparedPeer> {
  const disc = async (label: string) => {
    const count = await textOf(container.getByText(label, { exact: true }).locator("xpath=preceding-sibling::div[1]"));
    return count === null ? null : Number(count.replace(/[^\d]/g, ""));
  };
  const fact = (label: string) => textOf(container.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]"));
  return {
    onlyYou: await disc("only you"),
    both: await disc("both"),
    onlyThem: await disc(`only ${peer}`),
    theyFinishedYouDropped: await fact(`${peer} finished, you dropped`),
    bothPlanning: await fact("On both lists, neither started"),
  };
}
