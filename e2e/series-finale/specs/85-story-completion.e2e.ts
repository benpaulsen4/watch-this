import { devices, type Page } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { psql } from "../support/db";
import { check } from "../support/evidence";
import { becomesVisible } from "../support/pages";
import { recapHeroRange } from "../support/recap";
import { shot } from "../support/shots";
import { goToCard, storyCard } from "../support/story";
import { test } from "../support/test";

// Going through the story on a phone (mutating: runs in desktop-mutating,
// after every read-only project). Reaching the summary card marks the story
// gone through on the account -- POST .../story-complete, stored as
// series_finale.story_completed_at -- and from then on the phone's recap
// route shows the recap instead of handing on to the story, and Close goes to
// it. e2e_cy's 2025 is the one recap the seeder leaves unmarked (seed.ts
// STORY_COMPLETED); 52-story-gate saw it gated, read-only, before this.
//
// A phone in desktop-mutating: this file emulates the phone project's device
// (Pixel 7 at 390 x 844, DPR 2, touch) rather than adding a phone-mutating
// project, so run.ts's two invocations (read-only projects, then
// desktop-mutating alone) and the report's project list stay as they are.
// Leaves cy's 2025 marked: re-running needs a fresh database (pnpm e2e:all).

const CY = "e2e_cy";
const YEAR = "2025";
const RECAP_PATH = `/series-finale/${YEAR}`;
const STORY_PATH = `${RECAP_PATH}/story`;
const COMPLETE_PATH = `/api/series-finale/${YEAR}/story-complete`;

// Pixel 7 as the phone project uses it; `defaultBrowserType` is a worker
// option a file cannot set, and every project here is Chromium anyway.
const { defaultBrowserType: _browser, ...pixel7 } = devices["Pixel 7"];
test.use({ ...pixel7, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, storageState: storageStatePath(CY) });

/** cy's 2025 story_completed_at as stored ("" when null), read through db.sh. */
function storedCompletion(): string {
  return psql(
    `select coalesce(s.story_completed_at::text, '') from series_finale s join users u on u.id = s.user_id
     where u.username = :'u' and s.period_label = :'p';`,
    { u: CY, p: YEAR },
  );
}

/** Every POST to the story-complete route this page makes, with its status once answered. */
function recordCompletions(page: Page): { status: number | null }[] {
  const posts: { status: number | null }[] = [];
  page.on("request", (request) => {
    if (request.method() !== "POST" || new URL(request.url()).pathname !== COMPLETE_PATH) return;
    const entry: { status: number | null } = { status: null };
    posts.push(entry);
    void request.response().then((response) => {
      entry.status = response?.status() ?? null;
    });
  });
  return posts;
}

test("on a phone, reaching the summary card marks the story gone through; then the recap opens", async ({ page, hasTouch }) => {
  const before = storedCompletion();
  check("completion-precondition", "cy's 2025 story is not yet marked gone through (a fresh database)", "", before);
  if (before !== "") throw new Error("cy's 2025 is already completed: reset the database (pnpm e2e:all) before re-running this spec");

  const posts = recordCompletions(page);
  await page.goto(RECAP_PATH);
  await page.waitForURL((url) => url.pathname === STORY_PATH, { timeout: 30_000 }).catch(() => undefined);
  check("completion-starts-on-story", "the phone's recap route first hands on to the story", STORY_PATH, new URL(page.url()).pathname);
  await becomesVisible(storyCard(page), 30_000);

  const beforeSummary = posts.length;
  const reached = await goToCard(page, "summary");
  check("completion-summary-reached", "ArrowRight reaches the summary card", true, reached);
  if (!reached) throw new Error("the summary card was never reached");
  await page.waitForResponse((response) => new URL(response.url()).pathname === COMPLETE_PATH, { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  check(
    "completion-posted",
    "no completion was posted before the summary card; on it, exactly one POST .../2025/story-complete, answered 200",
    { beforeSummary: 0, posts: [{ status: 200 }] },
    { beforeSummary, posts },
  );
  const stored = storedCompletion();
  check(
    "completion-stored",
    "series_finale.story_completed_at is set for cy's 2025 (read-only psql through db.sh)",
    true,
    /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/.test(stored),
  );

  const link = storyCard(page).getByRole("link", { name: "See the full recap" });
  const linkShown = await becomesVisible(link, 5_000);
  check("completion-recap-link", "the summary card offers 'See the full recap', linking the recap", { shown: true, href: RECAP_PATH }, {
    shown: linkShown,
    href: linkShown ? await link.getAttribute("href") : null,
  });
  await shot(page, "story/cy-2025-completion/summary", { fullPage: true });

  if (linkShown) await (hasTouch ? link.tap() : link.click());
  await page.waitForURL((url) => url.pathname === RECAP_PATH, { timeout: 10_000 }).catch(() => undefined);
  const recap = await becomesVisible(recapHeroRange(page, YEAR), 30_000);
  await page.waitForTimeout(1_000);
  check(
    "completion-link-opens-recap",
    "following it opens cy's recap, and the phone stays on it",
    { recap: true, path: RECAP_PATH },
    { recap, path: new URL(page.url()).pathname },
  );
});

test("afterwards, the phone's recap route shows the recap, the story's Close goes to it, and nothing is posted again", async ({ page, hasTouch }) => {
  const posts = recordCompletions(page);

  // A fresh document: the completion comes from the server, not a cache.
  await page.goto(RECAP_PATH);
  const recap = await becomesVisible(recapHeroRange(page, YEAR), 30_000);
  await page.waitForTimeout(1_000);
  check(
    "completion-recap-route-shows-recap",
    "on a phone, /series-finale/2025 now shows the recap and does not hand on to the story",
    { recap: true, path: RECAP_PATH },
    { recap, path: new URL(page.url()).pathname },
  );
  await shot(page, "recap/cy-2025-after-completion", { fullPage: true });

  await page.goto(STORY_PATH);
  await becomesVisible(storyCard(page), 30_000);
  const reached = await goToCard(page, "summary");
  await page.waitForTimeout(500);
  check("completion-no-second-post", "reaching the summary card again posts nothing (the story is already gone through)", { reached: true, posts: 0 }, {
    reached,
    posts: posts.length,
  });

  const close = page.getByRole("button", { name: "Close story" });
  await (hasTouch ? close.tap() : close.click()).catch(() => undefined);
  await page.waitForURL((url) => url.pathname === RECAP_PATH, { timeout: 10_000 }).catch(() => undefined);
  check("completion-close-to-recap", "'Close story' now goes to the recap, not the dashboard", RECAP_PATH, new URL(page.url()).pathname);
});
