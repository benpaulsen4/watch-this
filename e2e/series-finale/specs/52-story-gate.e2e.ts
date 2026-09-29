import { type Page, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { psql } from "../support/db";
import { check } from "../support/evidence";
import { banner, becomesVisible, openDashboard } from "../support/pages";
import { recapHeroRange } from "../support/recap";
import { shot } from "../support/shots";
import { storyCard } from "../support/story";

// The story-first gate (plan 6, Ben's decision 3), read-only, on a story not
// yet gone through: e2e_cy's 2025, the one recap the seeder leaves unmarked
// (seed.ts STORY_COMPLETED). On a phone (phone, small-phone) the recap route
// hands on to the story without showing the recap, and Close or Escape go to
// the dashboard -- the recap is not open yet; the banner's CTA, which opens
// the recap route, therefore lands on the story too. On desktop the recap is
// the default and never hands on, and Close goes to it. Nothing here reaches
// the summary card, which is what marks completion (85-story-completion does
// that, last): the last test confirms cy's row is still unmarked.

const CY = "e2e_cy";
const YEAR = "2025";
const RECAP_PATH = `/series-finale/${YEAR}`;
const STORY_PATH = `${RECAP_PATH}/story`;

test.use({ storageState: storageStatePath(CY) });

const phoneOnly = () => test.skip(test.info().project.name === "desktop", "the phone gate: phone and small-phone only");
const desktopOnly = () => test.skip(test.info().project.name !== "desktop", "the desktop default: desktop only");

/** cy's 2025 row as stored: whether it exists and whether its story is marked gone through. */
function cyRow(): { stored: boolean; storyCompleted: boolean } {
  const raw = psql(
    `select (s.story_completed_at is not null)::text from series_finale s join users u on u.id = s.user_id
     where u.username = :'u' and s.period_label = :'p';`,
    { u: CY, p: YEAR },
  );
  return { stored: raw !== "", storyCompleted: raw === "true" };
}

/**
 * Records, from the first script on, whether the recap's hero ("1 January –
 * 31 December <year>") is ever in the document -- across the client-side
 * handover to the story, which keeps the document.
 */
async function watchForRecap(page: Page): Promise<void> {
  await page.addInitScript((year) => {
    const store = window as unknown as { __e2eRecapSeen: boolean };
    store.__e2eRecapSeen = false;
    const look = () => {
      if (document.body?.textContent?.includes(`1 January – 31 December ${year}`)) store.__e2eRecapSeen = true;
    };
    new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });
  }, YEAR);
}

const recapSeen = (page: Page) => page.evaluate(() => (window as unknown as { __e2eRecapSeen?: boolean }).__e2eRecapSeen ?? null);

test("precondition: cy's 2025 is stored and its story not gone through", async () => {
  check("gate-cy-precondition", "cy's 2025 snapshot is stored (the seeder generated it) with no story_completed_at", { stored: true, storyCompleted: false }, cyRow());
});

test("phone: the recap route hands a story not gone through on to the story, showing none of the recap", async ({ page }) => {
  phoneOnly();
  await watchForRecap(page);
  await page.goto(RECAP_PATH);
  await page.waitForURL((url) => url.pathname === STORY_PATH, { timeout: 30_000 }).catch(() => undefined);
  check(
    "gate-phone-recap-to-story",
    "on a phone, /series-finale/2025 replaces itself with the story; the story's first card shows and the recap's hero never did",
    { path: STORY_PATH, card: true, recapSeen: false },
    { path: new URL(page.url()).pathname, card: await becomesVisible(storyCard(page), 30_000), recapSeen: await recapSeen(page) },
  );
  await shot(page, "story/cy-2025-gate/handed-on", { fullPage: true });
});

test("phone: Close and Escape go to the dashboard while the story is not gone through", async ({ page, hasTouch }) => {
  phoneOnly();
  await page.goto(STORY_PATH);
  const close = page.getByRole("button", { name: "Close story" });
  check("gate-phone-close-shown", "the story has a 'Close story' button", true, await becomesVisible(close, 30_000));
  await (hasTouch ? close.tap() : close.click()).catch(() => undefined);
  await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 10_000 }).catch(() => undefined);
  check("gate-phone-close-to-dashboard", "'Close story' goes to /dashboard: the recap is not open yet", "/dashboard", new URL(page.url()).pathname);

  await page.goto(STORY_PATH);
  await becomesVisible(storyCard(page), 30_000);
  await page.keyboard.press("Escape");
  await page.waitForURL((url) => url.pathname === "/dashboard", { timeout: 10_000 }).catch(() => undefined);
  check("gate-phone-escape-to-dashboard", "Escape goes to /dashboard too", "/dashboard", new URL(page.url()).pathname);
});

test("phone: the banner's CTA opens the recap route, which hands on to the story", async ({ page, hasTouch }) => {
  phoneOnly();
  await openDashboard(page);
  const link = banner(page).getByRole("link", { name: "See your Series Finale" });
  const shown = await becomesVisible(link, 30_000);
  check("gate-phone-banner-cta", "cy's dashboard banner offers 'See your Series Finale', linking the 2025 recap", { shown: true, href: RECAP_PATH }, {
    shown,
    href: shown ? await link.getAttribute("href") : null,
  });
  if (shown) await (hasTouch ? link.tap() : link.click());
  await page.waitForURL((url) => url.pathname === STORY_PATH, { timeout: 30_000 }).catch(() => undefined);
  check("gate-phone-banner-lands-on-story", "following it on a phone lands on the story", STORY_PATH, new URL(page.url()).pathname);
});

test("desktop: the recap is the default, shown without the story gone through, and the story's Close goes to it", async ({ page }) => {
  desktopOnly();
  await page.goto(RECAP_PATH);
  const recap = await becomesVisible(recapHeroRange(page, YEAR), 30_000);
  // Long enough for a handover that should not happen.
  await page.waitForTimeout(1_000);
  check(
    "gate-desktop-recap-shown",
    "on desktop /series-finale/2025 shows cy's recap though her story is not gone through, and stays on it",
    { recap: true, path: RECAP_PATH },
    { recap, path: new URL(page.url()).pathname },
  );
  await shot(page, "recap/cy-2025-gate-desktop", { fullPage: true });

  await page.goto(STORY_PATH);
  const close = page.getByRole("button", { name: "Close story" });
  await becomesVisible(close, 30_000);
  await close.click().catch(() => undefined);
  await page.waitForURL((url) => url.pathname === RECAP_PATH, { timeout: 10_000 }).catch(() => undefined);
  check("gate-desktop-close-to-recap", "on desktop 'Close story' goes to the recap", RECAP_PATH, new URL(page.url()).pathname);
});

test("still read-only: cy's story is not marked gone through", async () => {
  check("gate-cy-still-not-completed", "after this spec, cy's 2025 still has no story_completed_at", { stored: true, storyCompleted: false }, cyRow());
});
