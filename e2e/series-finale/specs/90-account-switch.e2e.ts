import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type Page, test } from "@playwright/test";

import { signInAs } from "../support/auth";
import { CARD_SIZE, CARDS_DIR, pngSize } from "../support/cards";
import { check, note } from "../support/evidence";
import { becomesVisible } from "../support/pages";
import { clickProfileTab, finaleRows, logoutButton, openProfileTab, type ProfileTab } from "../support/profile";
import { recapHeroRange, recapSection, textOf } from "../support/recap";
import { shot } from "../support/shots";

// Switching accounts in one tab (desktop-mutating only) -- the regression
// test for the cross-account cache leak (I1): the app keeps one query cache,
// and the recap payload and card are cached under keys with no user in them,
// so AuthProvider must drop the cache when the signed-in user changes.
//
// One page, one virtual authenticator, one document: after ava signs in,
// every move is a click inside the app (client-side navigation), never a page
// load -- a load would empty the cache by itself and prove nothing. ava opens
// her 2025 recap (its card prefetches), signs out through the profile's
// Security tab, bat signs in on the /auth page that leaves, opens his own
// 2025 recap and clicks Share. A MutationObserver installed before the first
// page load reports every text node naming one of ava's crew.
//
// It also records the logout transition (P19, a known parked issue: an error
// box may flash as the profile loses its session) from the Security and the
// Streaming tab -- informational.

const AVA = "e2e_ava";
const BAT = "e2e_bat";
const YEAR = "2025";
const CARD_PATH = `/api/series-finale/${YEAR}/card`;
const CARD_NAME = `series-finale-${YEAR}.png`;
/** ava's crew names (e2e_bo also matches e2e_bo_renamed, after 80's rename). */
const AVA_CREW = ["e2e_bo", "e2e_cy", "e2e_dee"];

const isCard = (url: string) => new URL(url).pathname === CARD_PATH;

interface Sighting {
  at: number;
  name: string;
  text: string;
  path: string;
}

/**
 * Before any page loads: a MutationObserver over the whole document that
 * reports, through an exposed binding, every added or changed text naming
 * one of `names` -- with the page's clock and path, so each sighting can be
 * placed before or after a sign-out or sign-in.
 */
async function watchForNames(page: Page, names: string[]): Promise<Sighting[]> {
  const sightings: Sighting[] = [];
  await page.exposeBinding("__e2eSaw", (_source, sighting: Sighting) => {
    sightings.push(sighting);
  });
  await page.addInitScript((watched) => {
    const report = (text: string) => {
      for (const name of watched) {
        if (!text.includes(name)) continue;
        const saw = (window as unknown as { __e2eSaw?: (s: unknown) => void }).__e2eSaw;
        saw?.({ at: Date.now(), name, text: text.replace(/\s+/g, " ").trim().slice(0, 200), path: location.pathname });
      }
    };
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") report(mutation.target.textContent ?? "");
        for (const node of Array.from(mutation.addedNodes)) report(node.textContent ?? "");
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, names);
  return sightings;
}

/** Every card request, with the time it was made. */
function recordCardRequests(page: Page): number[] {
  const times: number[] = [];
  page.on("request", (request) => {
    if (isCard(request.url())) times.push(Date.now());
  });
  return times;
}

/**
 * From the dashboard to `/series-finale/<year>` by clicks alone: the header's
 * profile link, the Data Management tab, the archive row's Open. Says
 * whether the recap rendered.
 */
async function clickThroughToRecap(page: Page, username: string): Promise<boolean> {
  await page.getByRole("link", { name: `Profile for ${username}` }).click();
  await page.waitForURL("**/profile");
  if (!(await clickProfileTab(page, "data"))) return false;
  const row = finaleRows(page).filter({ hasText: `Series Finale ${YEAR}` });
  if (!(await becomesVisible(row, 30_000))) return false;
  await row.getByRole("link", { name: "Open" }).click();
  return becomesVisible(recapHeroRange(page, YEAR), 30_000);
}

/**
 * From now until the page leaves /profile, records every distinct error line
 * the profile shows: the red text its panels use for a failed load (the
 * passkey list's box, the streaming panel's line), outside the tab bar --
 * whose active tab is red too. Also samples them once right away.
 */
async function watchProfileErrors(page: Page): Promise<void> {
  await page.evaluate(() => {
    const store = window as unknown as { __e2eProfileErrors: string[]; __e2eProfileErrorsNow: () => string[] };
    store.__e2eProfileErrorsNow = () =>
      Array.from(document.querySelectorAll("main .text-red-400"))
        .filter((element) => !element.closest("nav") && element.getClientRects().length > 0)
        .map((element) => element.textContent?.replace(/\s+/g, " ").trim() ?? "")
        .filter((text) => text !== "");
    store.__e2eProfileErrors = [];
    const scan = () => {
      if (location.pathname !== "/profile") return;
      for (const text of store.__e2eProfileErrorsNow()) if (!store.__e2eProfileErrors.includes(text)) store.__e2eProfileErrors.push(text);
    };
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
}

async function profileErrorsSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __e2eProfileErrors?: string[] }).__e2eProfileErrors ?? []);
}

async function profileErrorsNow(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __e2eProfileErrorsNow?: () => string[] }).__e2eProfileErrorsNow?.() ?? []);
}

/**
 * Clicks Logout on the profile's `tab`, screenshots at once (P19), follows
 * the app to /auth, and notes whether an error line showed on the way out.
 */
async function logOutRecordingTransition(page: Page, tab: ProfileTab, username: string): Promise<void> {
  await watchProfileErrors(page);
  const beforeClick = await profileErrorsSeen(page);
  await logoutButton(page).click();
  // The frame and the error lines on it, as close to the click as can be.
  const atClick = await profileErrorsNow(page);
  await shot(page, `profile/logout-transition-${tab}`);
  const reachedAuth = await page.waitForURL("**/auth", { timeout: 15_000 }).then(
    () => true,
    () => false,
  );
  check(`logout-${tab}-reaches-auth`, `${username}'s Logout on the ${tab} tab leads to /auth`, true, reachedAuth);
  const seen = await profileErrorsSeen(page);
  note(
    `P19-logout-flash-${tab}`,
    `known parked issue P19: does an error line show on the profile's ${tab} tab between clicking Logout and /auth? (screenshot profile/logout-transition-${tab})`,
    "no error line",
    { beforeClick, atClick, seenUntilAuth: seen },
    seen.length === 0,
  );
}

test("one tab: ava signs out, bat signs in, and bat sees only his own recap and card (I1)", async ({ page }) => {
  const sightings = await watchForNames(page, [...AVA_CREW, AVA]);
  const cardRequests = recordCardRequests(page);

  // ava: sign in, then clicks only from here on.
  await signInAs(page, AVA);
  await page.evaluate(() => Object.assign(window, { __e2eDocument: "the document ava signed in on" }));
  const avaCard = page.waitForResponse((response) => isCard(response.url()));
  const avaRecap = await clickThroughToRecap(page, AVA);
  check("switch-ava-recap", "ava reaches her 2025 recap by clicks", true, avaRecap);
  const avaPrefetch = await avaCard;
  check("switch-ava-prefetch", "ava's recap prefetched her card (200, image/png)", { status: 200, type: "image/png" }, {
    status: avaPrefetch.status(),
    type: avaPrefetch.headers()["content-type"],
  });
  // The prefetch's body is the page's (Playwright cannot read a fetch body the
  // page streamed into a Blob), so ava's card bytes come from a direct GET
  // while she is still signed in -- the same bytes (the card is deterministic;
  // 70-share-button checks the download against a direct GET).
  const avaCardBytes = await (await page.request.get(CARD_PATH)).body();
  check("switch-ava-card", "ava's card, fetched directly while she is signed in, is a 1080x1350 PNG", CARD_SIZE, pngSize(avaCardBytes));
  check("switch-ava-crew-shown", "ava's crew is on screen (so the observer has something to see)", true, await becomesVisible(recapSection(page, "crew")));

  // Out through the profile's Security tab.
  await page.getByRole("link", { name: "Back to profile" }).click();
  await page.waitForURL(/\/profile(#.*)?$/);
  check("switch-ava-security-tab", "ava's profile opens its Security tab", true, await clickProfileTab(page, "security"));
  const loggedOutAt = Date.now();
  await logOutRecordingTransition(page, "security", AVA);

  // bat: on the /auth page Logout led to -- no page load.
  await signInAs(page, BAT, { navigate: false });
  const batSignedInAt = Date.now();
  const batRecap = await clickThroughToRecap(page, BAT);
  check("switch-bat-recap", "bat reaches his 2025 recap by clicks", true, batRecap);
  check(
    "switch-same-document",
    "ava's sign-in, her recap, the sign-out, bat's sign-in and his recap all happened in one document (no page load emptied the cache)",
    "the document ava signed in on",
    await page.evaluate(() => (window as unknown as { __e2eDocument?: string }).__e2eDocument ?? null),
  );
  check(
    "switch-bat-hero",
    "the recap is bat's: its hero names e2e_bat",
    `${BAT} · 1 January – 31 December ${YEAR}`,
    await textOf(recapSection(page, "hero").locator("p").first()),
  );
  check("switch-bat-no-crew", "bat has no crew panel (he shares no list)", 0, await recapSection(page, "crew").count());
  await page.waitForLoadState("networkidle");
  const batCardRequests = cardRequests.filter((at) => at > batSignedInAt).length;
  check("switch-bat-fresh-card-request", "bat's recap requested the card afresh after he signed in (not served ava's from the cache)", true, batCardRequests >= 1);

  mkdirSync(CARDS_DIR, { recursive: true });
  writeFileSync(join(CARDS_DIR, `ava-${YEAR}-before-switch.png`), avaCardBytes);
  const downloaded = page.waitForEvent("download", { timeout: 15_000 });
  await page.getByRole("banner").getByRole("button", { name: "Share", exact: true }).click();
  const download = await downloaded.catch(() => null);
  check("switch-bat-download", `Share downloads ${CARD_NAME}`, CARD_NAME, download?.suggestedFilename() ?? null);
  if (download) {
    const saved = join(CARDS_DIR, `bat-${YEAR}-after-switch.png`);
    await download.saveAs(saved);
    const bytes = readFileSync(saved);
    const direct = await (await page.request.get(CARD_PATH)).body();
    const avaDownloaded = join(CARDS_DIR, `ava-${YEAR}-downloaded.png`);
    check("switch-bat-card-png", "the download is a 1080x1350 PNG", CARD_SIZE, pngSize(bytes));
    check("switch-bat-card-not-avas", "the download is not ava's card (as fetched while she was signed in)", false, bytes.equals(avaCardBytes));
    if (existsSync(avaDownloaded)) {
      check("switch-bat-card-not-avas-download", `the download differs from cards/ava-${YEAR}-downloaded.png`, false, bytes.equals(readFileSync(avaDownloaded)));
    } else {
      note("switch-bat-card-not-avas-download", `no cards/ava-${YEAR}-downloaded.png (70-share-button did not run); compared with ava's prefetch only`, "the file", null, false);
    }
    check("switch-bat-card-is-bats", "the download is byte-for-byte bat's card from a direct GET", true, bytes.equals(direct));
  }

  // What the observer saw, placed against the sign-out and the sign-in.
  const crewSightings = sightings.filter((s) => s.name !== AVA);
  check("switch-observer-saw-ava-crew", "while ava was signed in, the observer saw her crew's names (it works)", true, crewSightings.some((s) => s.at < loggedOutAt));
  check(
    "switch-no-ava-crew-after-logout",
    "after ava's Logout -- through bat's sign-in and his recap -- no text named e2e_bo, e2e_cy or e2e_dee",
    [],
    crewSightings.filter((s) => s.at >= loggedOutAt),
  );
  check("switch-no-ava-after-bat-signin", "after bat signed in, no text named e2e_ava", [], sightings.filter((s) => s.name === AVA && s.at >= batSignedInAt));
  note(
    "switch-observer-counts",
    "how many texts the observer reported, by phase",
    "crew names only before Logout",
    {
      avaSignedIn: crewSightings.filter((s) => s.at < loggedOutAt).length,
      afterLogout: crewSightings.filter((s) => s.at >= loggedOutAt).length,
      avaNameAfterBatSignIn: sightings.filter((s) => s.name === AVA && s.at >= batSignedInAt).length,
    },
    crewSightings.every((s) => s.at < loggedOutAt),
  );
  await shot(page, "recap/bat-2025-after-switch");
});

test("the logout transition from the Streaming tab (P19, informational)", async ({ page }) => {
  await signInAs(page, AVA);
  check("logout-streaming-tab", "ava's profile opens its Streaming tab", true, await openProfileTab(page, "streaming"));
  // Let the tab's preferences load, as a person would have.
  await page.waitForLoadState("networkidle");
  await logOutRecordingTransition(page, "streaming", AVA);
});
