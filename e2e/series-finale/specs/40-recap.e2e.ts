import { type Locator, type Page, test } from "@playwright/test";

import { expectedArchetypeLabel, readArchetypeVisual, SEEDED_ARCHETYPES } from "../support/archetype";
import { storageStatePath } from "../support/auth";
import { expectedBigDay, readBigDay } from "../support/big-day";
import { psql } from "../support/db";
import { check, note } from "../support/evidence";
import { oracleYear } from "../support/oracle";
import { alsoTopForLine, becomesVisible, capitalise, dayMonth, monthName, percent, pluralise, weekdayName, words } from "../support/pages";
import { crewRows, openRecap, readCompare, recapSection, textOf, tileValue } from "../support/recap";

// ava's 2025 recap, section by section, against the SQL oracle (desktop +
// phone; read-only). Each test opens the page from ava's saved storage state;
// on the phone that shows the recap because the seeder marked her story gone
// through (seed.ts STORY_COMPLETED) -- else the phone hands on to the story.
// Every fact goes through check() -- soft -- so it reaches the evidence log
// whether it holds or not; a test stops early only when the recap never
// rendered, after logging that.

const AVA = "e2e_ava";
const YEAR = "2025";

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
  const straightDays = Math.floor(oracle.minutes / (24 * 60));
  check(
    "recap-hero-sentence",
    "the hero sentence states the oracle's episodes, top local weekday and films, and its minutes as whole straight days",
    `${pluralise(oracle.episodes, "episode")}, most often on ${weekdayName(oracle.topWeekday ?? -1)}s, and ${pluralise(oracle.filmsCompleted, "film")}. ` +
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
  // The count below only proves zone handling if ava's zone edges do not
  // cancel out: bucketed in UTC her year would hold a different number.
  check(
    "recap-zone-edges-discriminate",
    `precondition: ava's 2025 holds ${oracle.episodes} episodes in her Brisbane window and ${oracle.episodesIfUtcWindow} in a UTC one -- they must differ (the seeded zone edges are lopsided)`,
    true,
    oracle.episodesIfUtcWindow !== oracle.episodes,
  );
  check("recap-tile-episodes", "'Episodes watched' is the oracle's episodes, counted in ava's own zone", oracle.episodes.toLocaleString("en-GB"), await tileValue(page, "Episodes watched"));
  check(
    "recap-tile-completed",
    "'Titles completed' is the oracle's titlesCompleted",
    oracle.titlesCompleted.toLocaleString("en-GB"),
    await tileValue(page, "Titles completed"),
  );
  check("recap-tile-streak", "the day-streak tile is the oracle's longest streak", String(oracle.longestStreak), await tileValue(page, /Day streak/));
  check("recap-tile-dropped", "'Shows dropped' is the oracle's titlesDropped", String(oracle.titlesDropped), await tileValue(page, "Shows dropped"));
});

test("watched by month: every local month's bar, and the peak", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const panel = recapSection(page, "months");

  // Bar heights are a share of the axis's top tick (BarChart.tsx), so each
  // month's count is read back as height x top / 100.
  const chart = await panel
    .getByRole("img")
    .evaluate((plot) => {
      const axis = plot.parentElement?.parentElement?.firstElementChild;
      return {
        top: Number(axis?.querySelector("span")?.textContent ?? Number.NaN),
        heights: Array.from(plot.querySelectorAll<HTMLElement>("[data-bar]")).map((bar) => Number.parseFloat(bar.style.height)),
      };
    }, undefined, { timeout: 5_000 })
    .catch(() => null);
  check(
    "recap-months-bars",
    "the twelve bars are the oracle's local-month counts (episodes and completed films, in Brisbane) -- January holds the 2025-01-01 edge episode and December not the 2026-01-01 ones",
    oracle.months,
    chart ? chart.heights.map((height) => Math.round((height * chart.top) / 100)) : null,
  );

  // peakMonth (format.ts): the first month with the most, if any has one.
  const peak = Math.max(...oracle.months);
  const peakMonth = oracle.months.indexOf(peak) + 1;
  check(
    "recap-months-peak",
    "the panel names the oracle's peak month and its count",
    peak > 0 ? `Peak: ${monthName(peakMonth)}, ${peak.toLocaleString("en-GB")}` : null,
    await textOf(panel.getByText(/^Peak: /)),
  );
});

test("your type: the top weekday's share and the after-21:00 share", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const panel = recapSection(page, "rhythm");
  const text = (await textOf(panel)) ?? "";

  const top = oracle.topWeekday;
  const total = oracle.weekdayCounts.reduce((sum, count) => sum + count, 0);
  check(
    "recap-rhythm-top-weekday",
    "the type panel gives the oracle's top local weekday and its share of episodes",
    top === null ? null : `${percent(oracle.weekdayCounts[top] ?? 0, total)}% of your episodes landed on a ${weekdayName(top)}.`,
    /\d+% of your episodes landed on a \w+\./.exec(text)?.[0] ?? null,
  );
  check(
    "recap-rhythm-weekday-strip",
    "the weekday strip highlights the oracle's top weekday",
    top === null ? "Episodes by weekday." : `Episodes by weekday. Peak ${weekdayName(top)}.`,
    await panel.getByRole("img").getAttribute("aria-label", { timeout: 1_000 }).catch(() => null),
  );
  // ava is the weekday marathoner: her type's picture is the weekday strip
  // (the larger one, in this card), so the months panel carries no second
  // "By day of the week" strip.
  const archetype = SEEDED_ARCHETYPES[AVA]!;
  check(
    "recap-rhythm-archetype-visual",
    `the type panel draws the ${archetype}'s picture, labelled with the oracle's numbers`,
    { archetype, label: expectedArchetypeLabel(archetype, oracle) },
    await readArchetypeVisual(panel),
  );
  check(
    "recap-months-no-weekday-row",
    "the months panel has no 'By day of the week' row for the marathoner (her card is the strip)",
    0,
    await recapSection(page, "months").getByRole("heading", { name: "By day of the week" }).count(),
  );
  // The positive side of bat's "no share" (41-recap-visual): ava ticks enough
  // episodes one at a time, so hers is shown, and must be the oracle's.
  check(
    "recap-rhythm-late-share",
    `the type panel gives the oracle's after-21:00 share of solo ticks (${oracle.lateSoloTicks} of ${oracle.soloTicks}, local time)`,
    oracle.lateShare === null ? null : `${percent(oracle.lateShare, 1)}% of the episodes you ticked one at a time came after 21:00.`,
    /\d+% of the episodes you ticked one at a time came after 21:00\./.exec(text)?.[0] ?? null,
  );
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
    alsoTopForLine(alsoTopFor),
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

test("the biggest day: its date, and its clock of hour ticks, labelled points and listed episodes", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const panel = recapSection(page, "big-day");
  const intro = await textOf(panel.locator("p").first());
  const bigDay = oracle.bigDay;
  check(
    "recap-big-day",
    "the biggest day's date and episode count are the oracle's",
    bigDay === null ? null : `${weekdayOf(bigDay.date)} ${dayMonth(bigDay.date)} · ${pluralise(bigDay.episodes, "episode")}`,
    intro?.split(" · ").slice(0, 2).join(" · ") ?? null,
  );

  // The clock: an hour axis in ava's zone from the first tick's hour to the
  // hour after the last, labelled every hour from lg (the desktop panel) and
  // more sparsely below it; a dot per solo tick named "HH:MM · Show S1E03";
  // and the episodes listed by time. All from the oracle's timeline.
  const wide = (page.viewportSize()?.width ?? 0) >= 1024;
  check(
    "recap-big-day-clock",
    `the biggest day's hour ticks (${wide ? "every hour, lg and up" : "the narrow set, below lg"}), each point's label, the summary line and the listed rows are the oracle's timeline in ${oracle.timezone}`,
    expectedBigDay(oracle, wide ? "recap-lg" : "recap-below-lg"),
    await readBigDay(panel),
  );
});

test("the crew: eight collaborators and ava, ranked as the oracle", async ({ page }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const crew = recapSection(page, "crew");
  check("recap-crew-shown", "the crew panel is shown", true, await becomesVisible(crew));

  const rows = (await crewRows(crew)).map(({ name, episodes }) => ({ name, episodes }));
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

  // APP FINDING F3 (E5), now fixed: CREW_LIMIT once kept the first 8
  // consenting collaborators by user id, before any activity was loaded; it
  // now keeps the 8 most active. In ava's 2025 either rule drops e2e_jon
  // (all-f id, nothing watched), so her crew cannot tell them apart. e2e_jon's
  // own 2025 can: he has nine consenting collaborators, dee's id sorts last
  // among them though she is one of the busiest, and the seeder generated his
  // snapshot through the app. The check compares the crew the app stored for
  // him with his 8 most active (the oracle's crewTopByActivity).
  const jon = oracleYear("e2e_jon", YEAR);
  const jonStored = psql(
    `select coalesce(json_agg(c->>'username'), '[]'::json) from series_finale s join users u on u.id = s.user_id,
       jsonb_array_elements(s.payload->'crew') c
     where u.username = 'e2e_jon' and s.period_label = :'p';`,
    { p: YEAR },
  );
  const stored = (JSON.parse(jonStored || "[]") as string[]).sort();
  const byActivity = [...jon.crewTopByActivity].sort();
  const episodesOf = (username: string) => `${username} (${pluralise(oracleYear(username, YEAR).episodes, "episode")})`;
  check(
    "crew-cap-rule",
    `APP FINDING F3 (E5), fixed: the crew keeps the 8 most active, in e2e_jon's 2025 (nine consent; dee's id sorts last, so the old id cap left her out). ${oracle.crewCapRule}`,
    { storedCrew: byActivity, moreActiveButLeftOut: [] },
    { storedCrew: stored, moreActiveButLeftOut: byActivity.filter((username) => !stored.includes(username)).map(episodesOf) },
  );
});

test("compare: the closest peer first, then every peer swapped in, each with the oracle's split and named facts", async ({ page, hasTouch }) => {
  const oracle = oracleYear(AVA, YEAR);
  await openAvaRecap(page);
  const headings = await page.getByRole("heading", { level: 2, name: /^You & / }).allTextContents();
  const shownFirst = headings.map((heading) => heading.replace(/^You & /, "").trim());
  // The recap opens on one peer: the one with most titles in common (compare[0]).
  check("recap-compare-peer", "the recap compares ava with the oracle's closest peer", Object.keys(oracle.compare).slice(0, 1), shownFirst);

  // "Swap in" lists every peer, the one shown pressed (ComparePeerPicker);
  // choosing one redraws the title, the Venn and the facts for them. Every
  // peer is visited in the oracle's order -- e2e_fay among them.
  const peers = Object.keys(oracle.compare);
  const chips = recapSection(page, "compare").getByText("Swap in", { exact: true }).locator("xpath=..").getByRole("button");
  check(
    "recap-compare-swap-row",
    "the compare panel's 'Swap in' row offers every peer the oracle compares, closest first, the shown one pressed",
    peers.map((peer, index) => ({ name: peer, pressed: String(index === 0) })),
    await chips.evaluateAll((buttons) => buttons.map((button) => ({ name: button.textContent?.trim() ?? "", pressed: button.getAttribute("aria-pressed") ?? "" }))),
  );

  for (const [index, peer] of peers.entries()) {
    if (index > 0) {
      const chip = chips.filter({ hasText: new RegExp(`^${peer}$`) });
      await (hasTouch ? chip.tap() : chip.click()).catch(() => undefined);
      check(
        `recap-compare-${peer}-swapped`,
        `choosing '${peer}' makes the panel 'You & ${peer}', with only its chip pressed`,
        { heading: true, pressed: [peer] },
        {
          heading: await becomesVisible(page.getByRole("heading", { level: 2, name: `You & ${peer}`, exact: true }), 5_000),
          pressed: await chips.evaluateAll((buttons) =>
            buttons.filter((button) => button.getAttribute("aria-pressed") === "true").map((button) => button.textContent?.trim() ?? ""),
          ),
        },
      );
    }
    const expected = oracle.compare[peer];
    const shown = await readCompare(recapSection(page, "compare").filter({ hasText: `You & ${peer}` }), peer);
    check(
      `recap-compare-${peer}-split`,
      `only you / both / only ${peer} are the oracle's`,
      expected ? { onlyYou: expected.onlyYou, both: expected.both, onlyThem: expected.onlyThem } : null,
      { onlyYou: shown.onlyYou, both: shown.both, onlyThem: shown.onlyThem },
    );
    check(
      `recap-compare-${peer}-finished-you-dropped`,
      `'${peer} finished, you dropped' names the oracle's title`,
      expected?.theyFinishedYouDropped ?? null,
      shown.theyFinishedYouDropped,
    );
    check(
      `recap-compare-${peer}-both-planning`,
      "'On both lists, neither started' names the oracle's shared planning film",
      expected?.bothPlanning ?? null,
      shown.bothPlanning,
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
