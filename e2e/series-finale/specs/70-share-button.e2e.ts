import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type Locator, type Page, type Request, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { CARD_SIZE, CARDS_DIR, pngSize } from "../support/cards";
import { check, note } from "../support/evidence";
import { becomesVisible } from "../support/pages";
import { openRecap } from "../support/recap";
import { shot } from "../support/shots";
import { goToCard, openStory, storyCard } from "../support/story";

// The Share button (read-only; desktop + phone). The recap header's Share
// prefetches the card when it mounts, then:
//   - desktop (no navigator.share with files): downloads series-finale-2025.png;
//   - phone: hands navigator.share exactly one File and nothing else. The
//     share sheet is stubbed with addInitScript -- resolved, or rejected with
//     an AbortError (the person cancelled) -- and the call recorded;
//   - either: a card that cannot be fetched (a forced 500) shows the failure line.
// The story's summary card carries the same button ("Share your card").

const AVA = "e2e_ava";
const YEAR = "2025";
const CARD_PATH = `/api/series-finale/${YEAR}/card`;
const CARD_NAME = `series-finale-${YEAR}.png`;
const FAILURE_LINE = "That card could not be made. Try again in a moment.";

const isCard = (url: URL) => url.pathname === CARD_PATH;

test.use({ storageState: storageStatePath(AVA) });

const desktopOnly = () => test.skip(test.info().project.name !== "desktop", "the download path: desktop only");
const phoneOnly = () => test.skip(test.info().project.name !== "phone", "navigator.share: phone only");

/** Every card request the page makes, in order, with the time it was made. */
function recordCardRequests(page: Page): { at: number; request: Request }[] {
  const requests: { at: number; request: Request }[] = [];
  page.on("request", (request) => {
    if (isCard(new URL(request.url()))) requests.push({ at: Date.now(), request });
  });
  return requests;
}

/** Every download the page starts. */
function recordDownloads(page: Page): string[] {
  const names: string[] = [];
  page.on("download", (download) => names.push(download.suggestedFilename()));
  return names;
}

interface ShareCall {
  keys: string[];
  files: { isFile: boolean; name: string; type: string; size: number }[];
}

/**
 * Replaces the platform share sheet before any page script runs:
 * canShare() says yes, and share() records what it was handed, then
 * resolves (the person shared) or rejects with `{ name: "AbortError" }`
 * (they cancelled). The first shared File is kept for its bytes.
 */
async function stubShareSheet(page: Page, outcome: "share" | "cancel"): Promise<void> {
  await page.addInitScript((mode) => {
    const calls: ShareCall[] = [];
    const store = window as unknown as { __e2eShareCalls: ShareCall[]; __e2eSharedFile?: File };
    store.__e2eShareCalls = calls;
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: (data: ShareData = {}) => {
        const files = Array.from(data.files ?? []);
        calls.push({
          keys: Object.keys(data).sort(),
          files: files.map((file) => ({ isFile: file instanceof File, name: file.name, type: file.type, size: file.size })),
        });
        store.__e2eSharedFile ??= files[0];
        return mode === "share" ? Promise.resolve() : Promise.reject({ name: "AbortError" });
      },
    });
  }, outcome);
}

async function shareCalls(page: Page): Promise<ShareCall[]> {
  return page.evaluate(() => (window as unknown as { __e2eShareCalls?: ShareCall[] }).__e2eShareCalls ?? []);
}

/** Waits (softly) for the stubbed share() to have been called; says whether it was. */
async function shareCalled(page: Page): Promise<boolean> {
  return page
    .waitForFunction(() => ((window as unknown as { __e2eShareCalls?: unknown[] }).__e2eShareCalls ?? []).length > 0, undefined, {
      timeout: 15_000,
    })
    .then(
      () => true,
      () => false,
    );
}

/** The bytes of the first File handed to share(), or null. */
async function sharedFileBytes(page: Page): Promise<Buffer | null> {
  const base64 = await page.evaluate(async () => {
    const file = (window as unknown as { __e2eSharedFile?: File }).__e2eSharedFile;
    if (!file) return null;
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  });
  return base64 === null ? null : Buffer.from(base64, "base64");
}

/** The card as a direct GET with this page's session. */
async function directCard(page: Page): Promise<Buffer> {
  return (await page.request.get(CARD_PATH)).body();
}

/** The recap header's Share button. */
function headerShare(page: Page): Locator {
  return page.getByRole("banner").getByRole("button", { name: "Share", exact: true });
}

/** Opens ava's 2025 recap; logs whether it rendered, and stops the test if it did not. */
async function openAvaRecap(page: Page, id: string): Promise<void> {
  const rendered = await openRecap(page, YEAR);
  check(id, "ava's 2025 recap renders", true, rendered);
  if (!rendered) throw new Error("ava's 2025 recap did not render; there is no Share button");
}

/** Taps (touch) or clicks the button, as the project's device would. */
async function press(button: Locator, hasTouch: boolean): Promise<void> {
  await (hasTouch ? button.tap() : button.click());
}

/** Waits for a moment and says whether the failure line is on screen. */
async function failureLineAfterSettling(page: Page): Promise<number> {
  await page.waitForTimeout(1_000);
  return page.getByText(FAILURE_LINE).count();
}

test("desktop: Share downloads series-finale-2025.png, the card prefetched on mount", async ({ page }) => {
  desktopOnly();
  const cardRequests = recordCardRequests(page);
  const prefetched = page.waitForResponse((response) => isCard(new URL(response.url())));
  await openAvaRecap(page, "share-desktop-recap");
  const prefetch = await prefetched;
  check("share-desktop-prefetch", "the card was requested as the button mounted, before any click, and answered 200", { requests: 1, status: 200 }, {
    requests: cardRequests.length,
    status: prefetch.status(),
  });

  const platform = await page.evaluate(() => ({
    share: typeof navigator.share,
    canShare: typeof navigator.canShare,
  }));
  note(
    "share-desktop-platform",
    "desktop Chromium's Web Share support (the download path is taken when canShare is missing or refuses files)",
    "no navigator.canShare/share on desktop Linux Chromium",
    platform,
    platform.canShare !== "function",
  );

  const downloaded = page.waitForEvent("download", { timeout: 15_000 });
  await headerShare(page).click();
  const download = await downloaded.catch(() => null);
  check("share-desktop-download", `clicking Share starts a download named ${CARD_NAME}`, CARD_NAME, download?.suggestedFilename() ?? null);
  if (!download) return;

  mkdirSync(CARDS_DIR, { recursive: true });
  const saved = join(CARDS_DIR, `ava-${YEAR}-downloaded.png`);
  await download.saveAs(saved);
  const bytes = readFileSync(saved);
  check("share-desktop-download-png", "the downloaded file is a 1080x1350 PNG", CARD_SIZE, pngSize(bytes));
  check("share-desktop-no-refetch", "the click used the prefetched card: no second card request", 1, cardRequests.length);
  check("share-desktop-download-is-card", "the download is byte-for-byte the card a direct GET returns", true, bytes.equals(await directCard(page)));
  check("share-desktop-no-failure-line", "no failure line after a download", 0, await failureLineAfterSettling(page));
});

test("phone: Share hands navigator.share exactly one PNG file, and nothing else", async ({ page, hasTouch }) => {
  phoneOnly();
  await stubShareSheet(page, "share");
  const cardRequests = recordCardRequests(page);
  const downloads = recordDownloads(page);
  const prefetched = page.waitForResponse((response) => isCard(new URL(response.url())));
  await openAvaRecap(page, "share-phone-recap");
  await prefetched;
  check("share-phone-prefetch", "the card was requested as the button mounted, before the tap", 1, cardRequests.length);

  await press(headerShare(page), hasTouch);
  const called = await shareCalled(page);
  const calls = await shareCalls(page);
  check(
    "share-phone-payload",
    `navigator.share was called once with exactly { files: [one File ${CARD_NAME}, image/png] } -- no text, title or url`,
    [{ keys: ["files"], files: [{ isFile: true, name: CARD_NAME, type: "image/png" }] }],
    calls.map((call) => ({ keys: call.keys, files: call.files.map(({ isFile, name, type }) => ({ isFile, name, type })) })),
  );
  check("share-phone-called", "the tap reached navigator.share", true, called);

  const bytes = await sharedFileBytes(page);
  check("share-phone-file-png", "the shared file is a 1080x1350 PNG", CARD_SIZE, bytes && pngSize(bytes));
  check("share-phone-file-is-card", "the shared file is byte-for-byte the card a direct GET returns", true, !!bytes && bytes.equals(await directCard(page)));
  check("share-phone-no-refetch", "the tap used the prefetched card: no second card request", 1, cardRequests.length);
  check("share-phone-no-failure-line", "no failure line after a share that resolved", 0, await failureLineAfterSettling(page));
  check("share-phone-no-download", "a share that resolved does not also download", [], downloads);
});

test("phone: cancelling the share sheet is not a failure", async ({ page, hasTouch }) => {
  phoneOnly();
  await stubShareSheet(page, "cancel");
  const downloads = recordDownloads(page);
  const prefetched = page.waitForResponse((response) => isCard(new URL(response.url())));
  await openAvaRecap(page, "share-cancel-recap");
  await prefetched;

  await press(headerShare(page), hasTouch);
  check("share-cancel-called", "the tap reached navigator.share, which rejected with an AbortError", true, await shareCalled(page));
  check("share-cancel-no-failure-line", "after the cancel there is no failure line", 0, await failureLineAfterSettling(page));
  check("share-cancel-no-download", "a cancel does not fall back to a download", [], downloads);
  check("share-cancel-button-enabled", "the button is usable again", true, await headerShare(page).isEnabled());
});

test("a card that cannot be made shows the failure line", async ({ page, hasTouch }) => {
  let served = 0;
  await page.route(isCard, (route) => {
    served += 1;
    return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "e2e: forced failure" }) });
  });
  // On the phone the share sheet is stubbed, so a call to it would be recorded.
  if (test.info().project.name === "phone") await stubShareSheet(page, "share");
  const downloads = recordDownloads(page);
  try {
    await openAvaRecap(page, "share-failure-recap");
    // The prefetch fails first (the card query does not retry).
    await page.waitForLoadState("networkidle");
    check("share-failure-prefetch-failed", "the mount-time prefetch got the forced 500", 1, served);
    check("share-failure-no-line-before", "no failure line before anyone asks to share", 0, await page.getByText(FAILURE_LINE).count());

    await press(headerShare(page), hasTouch);
    const shown = await becomesVisible(page.getByText(FAILURE_LINE), 10_000);
    check("share-failure-line", `after Share: "${FAILURE_LINE}"`, true, shown);
    check("share-failure-refetched", "Share asked for the card again rather than giving up on the failed prefetch", 2, served);
    check("share-failure-nothing-shared", "nothing was downloaded or shared", { downloads: [], shareCalls: 0 }, {
      downloads,
      shareCalls: (await shareCalls(page)).length,
    });
    // APP FINDING F6, fixed: the line used to sit under the button inside the
    // header's fixed-height bar, pushing the button off its top. Now the
    // button stays in the bar and the line is set below the bar, outside it
    // (RecapClient's ShareFailureNotice), where it is visible.
    const span = async (element: Locator) => {
      const box = await element.boundingBox({ timeout: 2_000 }).catch(() => null);
      return box && { top: Math.round(box.y), bottom: Math.round(box.y + box.height) };
    };
    const [bar, button, line] = await Promise.all([span(page.getByRole("banner")), span(headerShare(page)), span(page.getByText(FAILURE_LINE))]);
    const inside = (box: { top: number; bottom: number } | null) => !!bar && !!box && box.top >= bar.top && box.bottom <= bar.bottom;
    const below = !!bar && !!line && line.top >= bar.bottom;
    check(
      "share-failure-layout",
      "with the failure line shown, the Share button lies inside the header bar and the line sits below the bar, visible",
      { buttonInsideBar: true, lineBelowBar: true, lineVisible: true },
      { buttonInsideBar: inside(button), lineBelowBar: below, lineVisible: await page.getByText(FAILURE_LINE).isVisible() },
    );
    note(
      "share-failure-layout-boxes",
      "vertical extents (CSS px) of the header bar, the Share button and the failure line",
      "button within the bar, line below it",
      { bar, button, line },
      inside(button) && below,
    );
    await shot(page, "share/failure-line");
  } finally {
    await page.unroute(isCard);
  }
});

test("phone: the story summary's 'Share your card' shares the same way", async ({ page, hasTouch }) => {
  phoneOnly();
  await stubShareSheet(page, "share");
  const downloads = recordDownloads(page);
  const opened = await openStory(page, YEAR);
  check("share-story-rendered", "ava's 2025 story renders", true, opened);
  if (!opened) throw new Error("ava's 2025 story did not render");
  const reached = await goToCard(page, "summary");
  check("share-story-summary", "ArrowRight reaches the summary card", true, reached);
  if (!reached) throw new Error("the summary card was never reached");

  const button = storyCard(page).getByRole("button", { name: "Share your card" });
  check("share-story-button", "the summary card has 'Share your card'", true, await becomesVisible(button, 5_000));
  await press(button, hasTouch);
  check("share-story-called", "the tap reached navigator.share", true, await shareCalled(page));
  const calls = await shareCalls(page);
  check(
    "share-story-payload",
    `navigator.share got exactly { files: [one File ${CARD_NAME}, image/png] } -- no text, title or url`,
    [{ keys: ["files"], files: [{ isFile: true, name: CARD_NAME, type: "image/png" }] }],
    calls.map((call) => ({ keys: call.keys, files: call.files.map(({ isFile, name, type }) => ({ isFile, name, type })) })),
  );
  const bytes = await sharedFileBytes(page);
  check("share-story-file-png", "the shared file is a 1080x1350 PNG", CARD_SIZE, bytes && pngSize(bytes));
  check("share-story-no-failure-line", "no failure line after a share that resolved", 0, await failureLineAfterSettling(page));
  check("share-story-no-download", "a share that resolved does not also download", [], downloads);
  if (bytes) {
    mkdirSync(CARDS_DIR, { recursive: true });
    writeFileSync(join(CARDS_DIR, `ava-${YEAR}-shared-from-story.png`), bytes);
  }
});
