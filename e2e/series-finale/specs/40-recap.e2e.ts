import { type Locator, type Page, test } from "@playwright/test";

import { storageStatePath } from "../support/auth";
import { check, note } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { becomesVisible, capitalise, pluralise, words } from "../support/pages";
import { openRecap, recapSection, textOf, tileValue } from "../support/recap";

// ava's 2025 recap, section by section, against the SQL oracle (desktop +
// phone; read-only). Each test opens the page from ava's saved storage state.
// Every fact goes through check() -- soft -- so it reaches the evidence log
// whether it holds or not; a test stops early only when the recap never
// rendered, after logging that.

const AVA = "e2e_ava";
const YEAR = "2025";

/** "28 December" for "2025-12-28" -- a local date key, read back in UTC so it never shifts. */
function dayMonth(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

/** "Saturday" for "2025-03-15". */
function weekdayOf(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
}

/** Opens ava's 2025 recap; logs whether it rendered, and stops the test if it did not. */
async function openAvaRecap(page: Page): Promise<void> {
  const rendered = await openRecap(page, YEAR);
  check("recap-ava-rendered", "ava's 2025 recap renders its hero", true, rendered);
  if (!rendered) throw new Error("ava's 2025 recap did not render; nothing else can be checked");
}

/** A badge list's titles: "Mr. Robot · S2E4" and "Nickel Boys · 312 days" read as the title alone. */
async function badgeTitles(badges: Locator): Promise<string[]> {
  const texts = await badges.locator(":scope > div").allTextContents();
  return texts.map((text) => text.split(" · ")[0]?.trim() ?? "");
}

test.use({ storageState: storageStatePath(AVA) });

test("hero: hours, the sentence, the date range, percentile and the runtime disclosure", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const hero = recapSection(page, "hero");
  const lines = hero.locator("p");

  check(
    "recap-hero-range",
    "the hero names ava and the period as 1 January – 31 December 2025",
    `${AVA} · 1 January – 31 December ${YEAR}`,
    await textOf(lines.nth(0)),
  );
  check(
    "recap-hero-hours",
    "the hero's big number is the oracle's hours, then 'hours'",
    [oracle.hours.toLocaleString("en-GB"), oracle.hours === 1 ? "hour" : "hours"],
    await lines.nth(1).locator("span").allTextContents(),
  );

  const sentence = await textOf(lines.nth(2));
  // The weekday comes from rhythm.topWeekday, which the oracle does not
  // compute; it is read from the page and must be a real weekday.
  const weekday = /most often on (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)s,/.exec(sentence ?? "")?.[1] ?? "<a weekday>";
  const straightDays = Math.floor(oracle.minutes / (24 * 60));
  check(
    "recap-hero-sentence",
    "the hero sentence states the oracle's episodes and films, and its minutes as whole straight days",
    `${pluralise(oracle.episodes, "episode")}, most often on ${weekday}s, and ${pluralise(oracle.filmsCompleted, "film")}. ` +
      `${capitalise(words(straightDays))} straight ${straightDays === 1 ? "day" : "days"} of screen, if you had done it all at once.`,
    sentence,
  );

  const percentile = await textOf(hero.getByText(/^Top \d+% of everyone on WatchThis$/));
  const n = Number(/Top (\d+)%/.exec(percentile ?? "")?.[1] ?? Number.NaN);
  check(
    "recap-hero-percentile",
    "the hero has the 'Top N% of everyone on WatchThis' line, with N at most 50",
    { line: "Top N% of everyone on WatchThis", nAtMost50: true },
    { line: percentile?.replace(/\d+/, "N") ?? null, nAtMost50: n <= 50 },
  );
  note("recap-hero-percentile-value", "ava's percentile as shown (Task 4 predicts Top 14% for this cohort)", "Top 14%", percentile, n === 14);

  const unknown = oracle.unknownRuntime;
  check(
    "recap-hero-unknown-runtime",
    "the hero discloses the oracle's unknown runtimes, as 'episodes or films'",
    `Excludes ${pluralise(unknown, "episode")} or ${unknown === 1 ? "film" : "films"} with no runtime on TMDB`,
    await textOf(hero.getByText(/^Excludes /)),
  );
});

test("stat tiles: episodes, completed, streak, dropped", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  check("recap-tile-episodes", "'Episodes watched' is the oracle's episodes", oracle.episodes.toLocaleString("en-GB"), await tileValue(page, "Episodes watched"));
  check(
    "recap-tile-completed",
    "'Titles completed' is the oracle's titlesCompleted",
    oracle.titlesCompleted.toLocaleString("en-GB"),
    await tileValue(page, "Titles completed"),
  );
  check("recap-tile-streak", "the day-streak tile is the oracle's longest streak", String(oracle.longestStreak), await tileValue(page, /Day streak/));
  check("recap-tile-dropped", "'Shows dropped' is the oracle's titlesDropped", String(oracle.titlesDropped), await tileValue(page, "Shows dropped"));
});

test("top show, 'also number one for', and the niche film", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const topShow = recapSection(page, "top-show");
  const lines = topShow.locator("p");

  check("recap-top-show-title", "the top show is the oracle's", oracle.topShow, await textOf(lines.nth(0)));
  const stats = await textOf(lines.nth(1));
  check(
    "recap-top-show-last-watched",
    "the top show's 'last watched' date is the oracle's topShowLastWatched",
    oracle.topShowLastWatched === null ? null : dayMonth(oracle.topShowLastWatched),
    /last watched (.+)$/.exec(stats ?? "")?.[1] ?? null,
  );
  const alsoTopFor = oracle.alsoTopFor;
  check(
    "recap-also-top-for",
    "'Also number one for' names the oracle's alsoTopFor (bo and cy)",
    `Also number one for ${alsoTopFor.slice(0, -1).join(", ")}${alsoTopFor.length > 1 ? " and " : ""}${alsoTopFor.slice(-1).join("")}.`,
    await textOf(topShow.getByText(/^Also number one for /)),
  );

  check("recap-niche-title", "the niche film is the oracle's", oracle.niche, await textOf(recapSection(page, "niche").locator("p").first()));
});

test("the shame panel: dropped count and names, 'And one more.', still planning", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const shame = recapSection(page, "shame");
  // The card's direct <div>s: its title block, the dropped badges, the planning badges.
  const blocks = shame.locator(":scope > div");

  const intro = await textOf(blocks.nth(0).locator("p"));
  check(
    "recap-shame-count",
    "the panel's headline count is the oracle's titlesDropped",
    `${capitalise(words(oracle.titlesDropped))} ${oracle.titlesDropped === 1 ? "show" : "shows"} marked dropped.`,
    /^\w+ shows? marked dropped\./.exec(intro ?? "")?.[0] ?? intro,
  );
  check(
    "recap-shame-named",
    "the dropped badges name exactly the oracle's namedDropped (the cached ones)",
    [...oracle.namedDropped].sort(),
    (await badgeTitles(blocks.nth(1))).sort(),
  );
  const unnamed = oracle.titlesDropped - oracle.namedDropped.length;
  check(
    "recap-shame-and-more",
    "the uncached dropped show is counted under the badges",
    unnamed > 0 ? `And ${words(unnamed)} more.` : null,
    await textOf(shame.getByText(/^And \w+ more\.$/)),
  );
  check(
    "recap-shame-still-planning",
    "the planning badges are exactly the oracle's stillPlanning, in order",
    oracle.stillPlanning,
    await badgeTitles(blocks.nth(2)),
  );
  check(
    "recap-shame-no-2026-film",
    "the film added to planning on 2026-02-10 (Columbus) is not listed",
    0,
    await shame.getByText("Columbus").count(),
  );
});

test("the biggest day", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const intro = await textOf(recapSection(page, "big-day").locator("p").first());
  const bigDay = oracle.bigDay;
  check(
    "recap-big-day",
    "the biggest day's date and episode count are the oracle's",
    bigDay === null ? null : `${weekdayOf(bigDay.date)} ${dayMonth(bigDay.date)} · ${pluralise(bigDay.episodes, "episode")}`,
    intro?.split(" · ").slice(0, 2).join(" · ") ?? null,
  );
});

test("the crew: eight collaborators and ava, ranked as the oracle", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const crew = recapSection(page, "crew");
  check("recap-crew-shown", "the crew panel is shown", true, await becomesVisible(crew));

  // `[data-name]` is CrewRanking's name span; the count is the span after it.
  const rows = await crew.locator("ol > li").evaluateAll((items) =>
    items.map((item) => ({
      name: item.querySelector("[data-name]")?.textContent?.trim() ?? null,
      episodes: item.querySelector("[data-name] + span")?.textContent?.trim() ?? null,
    })),
  );
  const shownAs = (username: string) => (username === AVA ? "you" : username);
  check(
    "recap-crew-rows",
    "the crew rows are the oracle's crew, in order, ava shown as 'you', each with its episodes",
    oracle.crew.map((member) => ({ name: shownAs(member.username), episodes: pluralise(member.episodes, "episode") })),
    rows,
  );
  check("recap-crew-size", "8 collaborators plus ava (CREW_LIMIT)", 9, rows.length);

  const names = rows.map((row) => row.name);
  check("recap-crew-bo-above-ava", "bo is ranked above ava", true, names.includes("e2e_bo") && names.indexOf("e2e_bo") < names.indexOf("you"));
  check("recap-crew-cy-present", "cy is in the crew (before her opt-out, which a later spec makes)", true, names.includes("e2e_cy"));
  check(
    "recap-crew-capped-out-absent",
    "the collaborators the oracle says the cap leaves out are not shown",
    oracle.crewCappedOut.map(() => false),
    oracle.crewCappedOut.map((username) => names.includes(username)),
  );

  // The recap's crew list (the default size, artboard 1e) prints no rank
  // numbers -- only the story's large variant does. So the shared rank is
  // derived from the rendered counts by competition ranking, as CrewRanking
  // ranks them, and compared with the oracle's ranks.
  const counts = rows.map((row) => Number((row.episodes ?? "").replace(/[^\d]/g, "")));
  const renderedRank = (name: string) => {
    const index = names.indexOf(name);
    return index < 0 ? null : 1 + counts.filter((count) => count > (counts[index] ?? 0)).length;
  };
  const oracleRank = (username: string) => oracle.crew.find((member) => member.username === username)?.rank ?? null;
  check(
    "recap-crew-ava-dee-tie",
    "ava and dee share a rank (competition ranking), ava listed first",
    { ava: oracleRank(AVA), dee: oracleRank("e2e_dee"), avaFirst: true },
    { ava: renderedRank("you"), dee: renderedRank("e2e_dee"), avaFirst: names.indexOf("you") + 1 === names.indexOf("e2e_dee") },
  );
  note(
    "recap-crew-rank-numbers",
    "the recap's crew list shows no rank numbers (as artboard 1e); the story's large variant does. The tie above is checked on rendered counts",
    "a rank number per row",
    await crew.locator("[data-rank]").count(),
    false,
  );

  // E5 APP FINDING, informational: CREW_LIMIT keeps the first 8 consenting
  // collaborators by user id, before any activity is loaded. In ava's 2025
  // the rule drops e2e_jon (seeded with the all-f id), who also happens to
  // have watched nothing; jon's own crew shows the rule dropping someone busy.
  const jon = oracleYear("e2e_jon", YEAR);
  const jonDropped = jon.crewCappedOut.map((username) => {
    const episodes = oracleYear(username, YEAR).episodes;
    return `${username} (${pluralise(episodes, "episode")})`;
  });
  note(
    "crew-cap-rule",
    `APP FINDING (E5): how the crew is capped at 8. ${oracle.crewCapRule}`,
    "cap by activity: the 8 most active consenting collaborators are kept",
    `cap by user id; e2e_jon excluded while listed on ava's shared list (ava's crew: ${oracle.crewCappedOut.join(", ")} left out); ` +
      `in e2e_jon's own 2025 the id rule leaves out ${jonDropped.join(", ")}`,
    false,
  );
});

test("compare: the split and the named facts for the peer shown", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const headings = await page.getByRole("heading", { level: 2, name: /^You & / }).allTextContents();
  const peers = headings.map((heading) => heading.replace(/^You & /, "").trim());
  // The recap shows one peer: the one with most titles in common (compare[0]).
  check("recap-compare-peer", "the recap compares ava with the oracle's closest peer", Object.keys(oracle.compare).slice(0, 1), peers);

  for (const peer of peers) {
    const expected = oracle.compare[peer];
    const panel = recapSection(page, "compare").filter({ hasText: `You & ${peer}` });
    const disc = async (label: string) =>
      Number(await textOf(panel.getByText(label, { exact: true }).locator("xpath=preceding-sibling::div[1]")));
    check(
      `recap-compare-${peer}-split`,
      `only you / both / only ${peer} are the oracle's`,
      expected ? { onlyYou: expected.onlyYou, both: expected.both, onlyThem: expected.onlyThem } : null,
      { onlyYou: await disc("only you"), both: await disc("both"), onlyThem: await disc(`only ${peer}`) },
    );
    const fact = (label: string) => textOf(panel.locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]"));
    check(
      `recap-compare-${peer}-finished-you-dropped`,
      `'${peer} finished, you dropped' names the oracle's title`,
      expected?.theyFinishedYouDropped ?? null,
      await fact(`${peer} finished, you dropped`),
    );
    check(
      `recap-compare-${peer}-both-planning`,
      "'On both lists, neither started' names the oracle's shared planning film",
      expected?.bothPlanning ?? null,
      await fact("On both lists, neither started"),
    );
  }
});

test("header actions and the TMDB footer", async ({ page }) => {
  await openAvaRecap(page);
  const header = page.getByRole("banner");
  const story = header.getByRole("link", { name: "Play as story" });
  check("recap-header-play-as-story", "the header links 'Play as story' to the 2025 story", "/series-finale/2025/story", await story.getAttribute("href", { timeout: 1_000 }).catch(() => null));
  check("recap-header-share", "the header has a 'Share' button", true, await header.getByRole("button", { name: "Share" }).isVisible());

  const footer = recapSection(page, "footer");
  check("recap-footer-tmdb-logo", "the footer carries the TMDB logo", true, await footer.getByRole("img", { name: "TMDB" }).isVisible());
  check(
    "recap-footer-tmdb-disclaimer",
    "the footer carries TMDB's disclaimer",
    true,
    await footer.getByText("This product uses the TMDB API but is not endorsed or certified by TMDB.").isVisible(),
  );
});
