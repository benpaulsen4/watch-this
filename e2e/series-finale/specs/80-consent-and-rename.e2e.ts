import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type Page } from "@playwright/test";

import { signInAs } from "../support/auth";
import { CARD_SIZE, CARDS_DIR, compareCardPngsOutsidePosterBox, pngSize } from "../support/cards";
import { psql, userExists } from "../support/db";
import { check, note } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { alsoTopForLine, becomesVisible, pluralise, words } from "../support/pages";
import { crewSwitch, openProfileTab, sessionPut, toggleCrewSwitch } from "../support/profile";
import { crewRows, openRecap, recapSection, textOf } from "../support/recap";
import { shot, shotElement } from "../support/shots";
import { cardState, goToCard, openStory, storyCard } from "../support/story";
import { test } from "../support/test";

// Consent withdrawn, and a username changed, as other people's recaps see
// them (desktop-mutating only; the steps run in order and build on each
// other). Every sign-in goes through the UI with signInAs.
//   1. cy turns "Include me in crew comparisons" off; it stays off.
//   2. ava's 2025 recap no longer shows cy -- crew, compare, "Also number one
//      for" -- although her STORED snapshot still names cy: consent is
//      applied on read (service.ts withholdWithdrawnCollaborators).
//   3. bo renames himself e2e_bo_renamed through the profile.
//   4. ava's recap and story show bo under his new name; bo's own card is
//      drawn with it.
// Afterwards bo stays renamed and cy opted out: a re-seed needs a database
// reset first (e2e:all always resets).

const AVA = "e2e_ava";
const BO = "e2e_bo";
const CY = "e2e_cy";
const BO_RENAMED = "e2e_bo_renamed";
const YEAR = "2025";
const CREW_SHOWN = 5; // the story crew card's rows (StoryCard.tsx CREW_SHOWN)

// The tests run in file order (one worker). Not `serial` mode: that would
// skip every later step once one soft check failed, and a finding in one
// step should not hide the next.

interface StoredNames {
  crew: string[];
  compare: string[];
  alsoTopFor: string[];
}

/** The usernames frozen in `username`'s stored 2025 payload; null when no snapshot is stored. */
function storedNames(username: string): StoredNames | null {
  const raw = psql(
    `select json_build_object(
       'crew', coalesce((select json_agg(c->>'username') from jsonb_array_elements(s.payload->'crew') c), '[]'::json),
       'compare', coalesce((select json_agg(c->>'username') from jsonb_array_elements(s.payload->'compare') c), '[]'::json),
       'alsoTopFor', coalesce(s.payload->'topShow'->'alsoTopFor', '[]'::jsonb))
     from series_finale s join users u on u.id = s.user_id
     where u.username = :'u' and s.period_label = :'p';`,
    { u: username, p: YEAR },
  );
  return raw === "" ? null : (JSON.parse(raw) as StoredNames);
}

/** A user's stored consent: "t", "f", or "" when there is no such user. */
function consentOf(username: string): string {
  return psql("select share_stats_with_collaborators from users where username = :'u';", { u: username });
}

/** Who ava should see now: the oracle's view with cy withheld and bo shown as `boName`. */
function expectedForAva(boName: string) {
  const oracle = oracleYear(AVA, YEAR);
  const shown = (username: string) => (username === BO ? boName : username);
  const crew = oracle.crew.filter((member) => member.username !== CY).map((member) => ({ ...member, username: shown(member.username) }));
  const peers = Object.keys(oracle.compare)
    .filter((username) => username !== CY)
    .map(shown);
  const alsoTopFor = oracle.alsoTopFor.filter((username) => username !== CY).map(shown);
  return { oracle, crew, peers, alsoTopFor };
}

/** Opens ava's 2025 recap; logs whether it rendered, and stops the test if it did not. */
async function openAvaRecap(page: Page, id: string): Promise<void> {
  const rendered = await openRecap(page, YEAR);
  check(id, "ava's 2025 recap renders", true, rendered);
  if (!rendered) throw new Error("ava's 2025 recap did not render; nothing else can be checked");
}

/** The page's visible text, whitespace collapsed. */
async function visibleText(page: Page): Promise<string> {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

/** The recap's crew rows as `check` compares them: name ("you" for ava) and episodes. */
async function recapCrew(page: Page) {
  return (await crewRows(recapSection(page, "crew"))).map(({ name, episodes }) => ({ name, episodes }));
}

const shownAs = (username: string) => (username === AVA ? "you" : username);

test("before: ava's stored 2025 snapshot names cy and bo", async ({ page }) => {
  await signInAs(page, AVA);
  // Opening the recap generates the snapshot if no earlier spec has.
  await openAvaRecap(page, "consent-before-ava-recap");
  const stored = storedNames(AVA);
  check("consent-before-stored-cy", "ava's stored 2025 crew, compare and 'also number one for' all name cy", { crew: true, compare: true, alsoTopFor: true }, {
    crew: stored?.crew.includes(CY) ?? null,
    compare: stored?.compare.includes(CY) ?? null,
    alsoTopFor: stored?.alsoTopFor.includes(CY) ?? null,
  });
  check("consent-before-cy-consents", "cy consents before the opt-out (as seeded)", "t", consentOf(CY));
});

test("cy turns the crew switch off, and it stays off", async ({ page }) => {
  await signInAs(page, CY);
  const opened = await openProfileTab(page, "data");
  check("consent-cy-data-tab", "cy's Data Management tab opens", true, opened);
  const toggle = crewSwitch(page);
  const shown = await becomesVisible(toggle);
  check("consent-cy-switch-on-before", "cy's switch is shown, and on", { shown: true, on: true }, { shown, on: shown && (await toggle.isChecked()) });
  if (!shown) throw new Error("cy's crew switch never appeared");

  const put = sessionPut(page);
  await toggleCrewSwitch(page);
  const response = await put;
  check("consent-cy-put", "the PUT saving the switch answers 200", 200, response.status());
  check("consent-cy-switch-off", "the switch reads off after the save", false, await toggle.isChecked());

  await page.reload();
  const reloaded = await becomesVisible(toggle, 15_000);
  check("consent-cy-switch-off-after-reload", "after a reload the switch is still off", { shown: true, on: false }, {
    shown: reloaded,
    on: reloaded ? await toggle.isChecked() : null,
  });
  check("consent-cy-stored", "cy's stored consent is now false", "f", consentOf(CY));
  await shot(page, "profile/cy-switch-off", { fullPage: true });
});

test("ava's recap withholds cy on read; her stored snapshot is untouched", async ({ page }) => {
  const expected = expectedForAva(BO);
  await signInAs(page, AVA);
  await openAvaRecap(page, "consent-after-ava-recap");

  check(
    "consent-after-crew",
    "the crew is the oracle's without cy -- nobody moves up into her place (the stored crew is not recomputed)",
    expected.crew.map((member) => ({ name: shownAs(member.username), episodes: pluralise(member.episodes, "episode") })),
    await recapCrew(page),
  );
  check(
    "consent-after-compare",
    "the recap compares ava with bo, still the closest peer",
    [`You & ${expected.peers[0] ?? ""}`],
    await page.getByRole("heading", { level: 2, name: /^You & / }).allTextContents(),
  );
  check(
    "consent-after-also-top-for",
    "'Also number one for' names only bo",
    alsoTopForLine(expected.alsoTopFor),
    await textOf(recapSection(page, "top-show").getByText(/^Also number one for /)),
  );
  check("consent-after-no-cy-text", "e2e_cy appears nowhere on the page", false, (await visibleText(page)).includes(CY));

  const api = (await (await page.request.get(`/api/series-finale/${YEAR}`)).json()) as {
    payload?: { crew: { username: string }[]; compare: { username: string }[]; topShow: { alsoTopFor: string[] } | null };
  };
  check(
    "consent-after-api",
    "the payload ava is served has no cy in crew, compare or alsoTopFor",
    { crew: false, compare: false, alsoTopFor: false, compareOrder: expected.peers },
    {
      crew: api.payload?.crew.some((member) => member.username === CY) ?? null,
      compare: api.payload?.compare.some((peer) => peer.username === CY) ?? null,
      alsoTopFor: api.payload?.topShow?.alsoTopFor.includes(CY) ?? null,
      compareOrder: api.payload?.compare.map((peer) => peer.username) ?? null,
    },
  );

  const stored = storedNames(AVA);
  check(
    "consent-after-stored-still-names-cy",
    "ava's STORED 2025 payload still names cy in crew, compare and alsoTopFor (consent is applied on read, not written back)",
    { crew: true, compare: true, alsoTopFor: true },
    { crew: stored?.crew.includes(CY) ?? null, compare: stored?.compare.includes(CY) ?? null, alsoTopFor: stored?.alsoTopFor.includes(CY) ?? null },
  );

  await shotElement(recapSection(page, "crew"), "recap/ava-2025-after-cy-optout/crew");
  await shotElement(recapSection(page, "compare"), "recap/ava-2025-after-cy-optout/compare");
});

test("bo renames himself e2e_bo_renamed through the profile", async ({ page }) => {
  const precondition = { bo: userExists(BO), renamed: userExists(BO_RENAMED) };
  check("rename-precondition", "e2e_bo exists and e2e_bo_renamed does not (a fresh database)", { bo: true, renamed: false }, precondition);
  if (!precondition.bo) throw new Error("e2e_bo is already renamed: reset the database (npm run e2e:all) before re-running this spec");

  await signInAs(page, BO);
  const opened = await openProfileTab(page, "profile");
  check("rename-profile-tab", "bo's profile tab opens", true, opened);
  await page.getByRole("button", { name: "Change Username" }).click();
  await page.getByLabel("Username").fill(BO_RENAMED);
  const put = sessionPut(page);
  await page.getByRole("button", { name: "Save" }).click();
  const response = await put;
  check("rename-put", "the rename PUT answers 200", 200, response.status());
  check("rename-shown", "the profile shows @e2e_bo_renamed", true, await becomesVisible(page.getByText(`@${BO_RENAMED}`, { exact: true })));
  check("rename-stored", "the users table has e2e_bo_renamed and no e2e_bo", { bo: false, renamed: true }, {
    bo: userExists(BO),
    renamed: userExists(BO_RENAMED),
  });
  await shot(page, "profile/bo-renamed");

  // bo's own recap and card are drawn with the name he has now.
  const rendered = await openRecap(page, YEAR);
  check("rename-bo-recap-hero", "bo's own recap names him e2e_bo_renamed", `${BO_RENAMED} · 1 January – 31 December ${YEAR}`, rendered ? await textOf(recapSection(page, "hero").locator("p").first()) : null);

  const card = await page.request.get(`/api/series-finale/${YEAR}/card`);
  const bytes = await card.body();
  check("rename-bo-card", "bo's 2025 card answers 200 with a 1080x1350 PNG", { status: 200, size: CARD_SIZE }, { status: card.status(), size: pngSize(bytes) });
  mkdirSync(CARDS_DIR, { recursive: true });
  writeFileSync(join(CARDS_DIR, `bo-${YEAR}-renamed.png`), bytes);
  const before = join(CARDS_DIR, `bo-${YEAR}.png`);
  if (existsSync(before)) {
    // The card draws the viewer's username and nothing else of bo's changed,
    // so a different image means the name did. The name itself is checked by
    // eye (the report): Satori draws text as paths, so it is not in the bytes.
    check("rename-bo-card-changed", `bo's card differs from the one saved before the rename (cards/bo-${YEAR}.png)`, false, bytes.equals(readFileSync(before)));
  } else {
    note("rename-bo-card-changed", `no cards/bo-${YEAR}.png from before the rename (20-api-and-card did not run); nothing to compare`, "a card from before", null, false);
  }
});

test("ava's recap and story show bo under his new name", async ({ page }) => {
  const expected = expectedForAva(BO_RENAMED);
  await signInAs(page, AVA);
  await openAvaRecap(page, "rename-ava-recap");

  check(
    "rename-recap-crew",
    "the crew shows e2e_bo_renamed where bo was (and still no cy)",
    expected.crew.map((member) => ({ name: shownAs(member.username), episodes: pluralise(member.episodes, "episode") })),
    await recapCrew(page),
  );
  check(
    "rename-recap-compare",
    "the compare panel is 'You & e2e_bo_renamed', its disc 'only e2e_bo_renamed'",
    { heading: [`You & ${BO_RENAMED}`], disc: 1 },
    {
      heading: await page.getByRole("heading", { level: 2, name: /^You & / }).allTextContents(),
      disc: await recapSection(page, "compare").getByText(`only ${BO_RENAMED}`, { exact: true }).count(),
    },
  );
  check(
    "rename-recap-also-top-for",
    "'Also number one for' names e2e_bo_renamed",
    alsoTopForLine(expected.alsoTopFor),
    await textOf(recapSection(page, "top-show").getByText(/^Also number one for /)),
  );
  check("rename-recap-no-old-name", "the old name e2e_bo appears nowhere on the page (only e2e_bo_renamed)", [], (await visibleText(page)).match(/e2e_bo(?!_renamed)/g) ?? []);
  await shotElement(recapSection(page, "crew"), "recap/ava-2025-after-rename/crew");
  await shotElement(recapSection(page, "compare"), "recap/ava-2025-after-rename/compare");
  await shotElement(recapSection(page, "top-show"), "recap/ava-2025-after-rename/top-show");

  // The story: top show, crew and compare cards.
  const opened = await openStory(page, YEAR);
  check("rename-story-rendered", "ava's 2025 story renders", true, opened);
  if (!opened) throw new Error("ava's 2025 story did not render");

  check("rename-story-top-show-reached", "ArrowRight reaches the top show card", true, await goToCard(page, "topShow"));
  const others = expected.alsoTopFor.length;
  check(
    "rename-story-also-top-for",
    "the top show card names e2e_bo_renamed",
    `${alsoTopForLine(expected.alsoTopFor) ?? ""} You ${words(others + 1)} need new material.`,
    await textOf(storyCard(page).getByText(/^Also number one for /)),
  );
  await shot(page, "story/ava-2025-after-rename/top-show");

  check("rename-story-crew-reached", "ArrowRight reaches the crew card", true, await goToCard(page, "crew"));
  const top = expected.crew.slice(0, CREW_SHOWN);
  check(
    "rename-story-crew",
    "the crew card's top five show e2e_bo_renamed at rank 1",
    top.map((member) => ({ rank: String(member.rank), name: shownAs(member.username), episodes: pluralise(member.episodes, "episode") })),
    await crewRows(storyCard(page)),
  );
  const unshown = expected.crew.length - top.length;
  check(
    "rename-story-crew-and-more",
    `'And N more.' counts the rest of the crew without cy (N = ${expected.crew.length} - ${top.length})`,
    `And ${words(unshown)} more.`,
    await textOf(storyCard(page).getByText(/^And [\w-]+ more\.$/)),
  );
  await shot(page, "story/ava-2025-after-rename/crew");

  check("rename-story-compare-reached", "ArrowRight reaches the compare card", true, await goToCard(page, "compare"));
  const swaps = storyCard(page).getByText("Swap in", { exact: true }).locator("xpath=..").getByRole("button");
  check(
    "rename-story-compare",
    "the compare card is 'You & e2e_bo_renamed', and the swap row offers every peer (no cy), e2e_bo_renamed pressed",
    { eyebrow: true, swaps: expected.peers.map((peer, index) => ({ name: peer, pressed: String(index === 0) })) },
    {
      eyebrow: await storyCard(page).getByText(`You & ${BO_RENAMED}`, { exact: true }).isVisible(),
      swaps: await swaps.evaluateAll((buttons) => buttons.map((button) => ({ name: button.textContent?.trim() ?? "", pressed: button.getAttribute("aria-pressed") ?? "" }))),
    },
  );
  check("rename-story-compare-card", "still on the compare card", "compare", (await cardState(page)).id);
  await shot(page, "story/ava-2025-after-rename/compare", { fullPage: true });
});

test("privacy: ava's card is unchanged by cy's opt-out and bo's rename", async ({ page }) => {
  // The share card must carry no collaborator data at all (spec privacy rule
  // 2), so nothing another person does may change ava's card. Its text is
  // drawn as paths, so this compares the whole image against the one
  // 20-api-and-card saved before any mutation -- except the top-show
  // poster's box (POSTER_BOX), which `route.tsx`'s `posterDataUrl` fetches
  // live from TMDB's CDN on every render and is not guaranteed byte-stable
  // between two fetches (ruling G6). Everything outside that box must still
  // match exactly.
  await signInAs(page, AVA);
  const card = await page.request.get(`/api/series-finale/${YEAR}/card`);
  const bytes = await card.body();
  const before = join(CARDS_DIR, `ava-${YEAR}.png`);
  if (!existsSync(before)) {
    note("privacy-ava-card-unchanged", `no cards/ava-${YEAR}.png from before the mutations (20-api-and-card did not run); nothing to compare`, "a card from before", null, false);
    return;
  }
  const beforeBytes = readFileSync(before);
  const identicalBytes = bytes.equals(beforeBytes);
  const comparison = identicalBytes
    ? { sameSize: true, outsideIdentical: true, posterBoxIdentical: true }
    : await compareCardPngsOutsidePosterBox(page, bytes, beforeBytes);
  check(
    "privacy-ava-card-unchanged",
    `after e2e_cy opted out and e2e_bo renamed himself, ava's 2025 card matches cards/ava-${YEAR}.png from before everywhere outside the live poster's box`,
    { status: 200, sameSize: true, outsideIdentical: true },
    { status: card.status(), sameSize: comparison.sameSize, outsideIdentical: comparison.outsideIdentical },
  );
  note(
    "privacy-ava-card-poster-box-changed",
    "informational only: whether the live TMDB poster itself differed between the two fetches (expected to, sometimes)",
    "either",
    comparison.posterBoxIdentical ? "unchanged" : "changed",
    true,
  );
  if (!identicalBytes) writeFileSync(join(CARDS_DIR, `ava-${YEAR}-after-mutations.png`), bytes);
});
