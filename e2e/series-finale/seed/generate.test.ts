import { describe, expect, it } from "vitest";

import { buildPayload } from "../../../src/lib/series-finale/aggregate";
import { THIN_YEAR_EPISODES, THIN_YEAR_TITLES, titleKey, type TitleMeta } from "../../../src/lib/series-finale/types";
import { getTimezoneDateKey, getTimezoneHour } from "../../../src/lib/time";
import { type CatalogueEntry, loadCatalogue } from "./catalogue";
import { type EpisodeRow, generate, type GeneratedRows } from "./generate";
import { PERSONAS, type PersonaSpec, UNKNOWN_RUNTIME_EPISODES } from "./personas";
import { mulberry32, seedFrom } from "./prng";

// A tiny catalogue, so none of this needs TMDB.
const CATALOGUE = new Map<string, CatalogueEntry>(
  (
    [
      { key: "alpha", title: "Alpha", year: 2020, type: "tv", tmdbId: 101, seasons: [{ season: 1, episodes: 60 }, { season: 2, episodes: 60 }] },
      { key: "beta", title: "Beta", year: 2020, type: "tv", tmdbId: 102, seasons: [{ season: 1, episodes: 50 }, { season: 2, episodes: 50 }] },
      { key: "gamma", title: "Gamma", year: 2020, type: "tv", tmdbId: 103, seasons: [{ season: 1, episodes: 40 }] },
      ...[1, 2, 3, 4, 5].map((n) => ({ key: `f${n}`, title: `Film ${n}`, year: 2020, type: "movie" as const, tmdbId: 200 + n })),
    ] satisfies CatalogueEntry[]
  ).map((entry) => [entry.key, entry]),
);

const BRISBANE = "Australia/Brisbane";

const AVA_LIKE: PersonaSpec = {
  username: "e2e_test_ava",
  signsIn: false,
  timezone: "Australia/Brisbane",
  createdAt: "2023-02-01",
  years: {
    2025: {
      shows: [
        { key: "alpha", episodes: 100, outcome: "completed" },
        { key: "beta", episodes: 60, outcome: "dropped", outcomeOn: "2025-10-12" },
        { key: "gamma", episodes: 20 },
      ],
      films: [
        { key: "f1", outcome: "completed", on: "2025-05-03" },
        { key: "f2", outcome: "completed" },
      ],
      weekdayWeights: [0.34, 0.08, 0.08, 0.1, 0.1, 0.14, 0.16],
      soloShare: 0.5,
      lateShareOfSolo: 0.45,
      bigDay: { date: "2025-03-15", episodes: 14 },
      streak: { start: "2025-07-04", days: 17 },
      extraEpisodes: [
        { key: "gamma", season: 1, episode: 39, localDateTime: "2025-01-01T05:00" },
        { key: "gamma", season: 1, episode: 40, localDateTime: "2026-01-01T08:00" },
      ],
    },
  },
  planning: [
    { key: "f4", addedOn: "2024-03-10" },
    { key: "f5", addedOn: "2026-02-10" },
  ],
};

const BATCH_ONLY: PersonaSpec = {
  username: "e2e_test_bat",
  signsIn: false,
  timezone: "UTC",
  createdAt: "2023-06-01",
  years: {
    2025: {
      shows: [
        { key: "alpha", episodes: 120 },
        { key: "beta", episodes: 100 },
      ],
      films: [],
      weekdayWeights: [1, 1, 1, 1, 1, 1, 1],
      soloShare: 0,
      lateShareOfSolo: 0,
    },
  },
};

const THIN: PersonaSpec = {
  username: "e2e_test_thin",
  signsIn: false,
  timezone: "Australia/Brisbane",
  createdAt: "2023-02-01",
  years: {
    2023: {
      shows: [{ key: "alpha", episodes: 6 }],
      films: [
        { key: "f1", outcome: "completed" },
        { key: "f2", outcome: "completed" },
      ],
      weekdayWeights: [1, 1, 1, 1, 1, 1, 1],
      soloShare: 0.5,
      lateShareOfSolo: 0.5,
    },
  },
};

/** The user-local calendar year as UTC instants, [start, end). */
function localYear(year: number, zoneOffsetHours: number): { start: Date; end: Date } {
  const hour = 60 * 60 * 1000;
  return {
    start: new Date(Date.UTC(year, 0, 1) - zoneOffsetHours * hour),
    end: new Date(Date.UTC(year + 1, 0, 1) - zoneOffsetHours * hour),
  };
}

const inside = (at: Date, window: { start: Date; end: Date }) => at >= window.start && at < window.end;

function uniqueInstants(rows: EpisodeRow[]): EpisodeRow[] {
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.watchedAt.getTime(), (counts.get(row.watchedAt.getTime()) ?? 0) + 1);
  return rows.filter((row) => counts.get(row.watchedAt.getTime()) === 1);
}

function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(keyOf(item), (counts.get(keyOf(item)) ?? 0) + 1);
  return counts;
}

const addDays = (dateKey: string, days: number) =>
  new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

describe("prng", () => {
  it("is a deterministic stream in [0, 1) per seed", () => {
    const a = mulberry32(seedFrom("e2e_ava", 2025));
    const b = mulberry32(seedFrom("e2e_ava", 2025));
    const draws = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(draws);
    expect(draws.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seedFrom("e2e_ava", 2025)).not.toBe(seedFrom("e2e_ava", 2024));
    expect(seedFrom("e2e_ava", 2025)).not.toBe(seedFrom("e2e_bo", 2025));
  });
});

describe("generate", () => {
  const rows = generate(AVA_LIKE, CATALOGUE);
  const year2025 = localYear(2025, 10);
  const inYear = rows.episodes.filter((row) => inside(row.watchedAt, year2025));
  const dateKey = (row: EpisodeRow) => getTimezoneDateKey(row.watchedAt, BRISBANE);

  it("is deterministic: the same persona twice gives identical rows", () => {
    expect(generate(AVA_LIKE, CATALOGUE)).toEqual(rows);
  });

  it("produces exactly the requested episodes per show and per year, inside the local year", () => {
    const perShow = countBy(inYear, (row) => String(row.tmdbId));
    // gamma: 20 in sequence plus the 2025-01-01 zone-edge row.
    expect(Object.fromEntries(perShow)).toEqual({ "101": 100, "102": 60, "103": 21 });
    expect(inYear).toHaveLength(181);
    // Everything else the spec produced is the one row that belongs to 2026.
    expect(rows.episodes).toHaveLength(182);
  });

  it("walks each show in order through real seasons, never repeating an episode", () => {
    const keys = rows.episodes.map((row) => `${row.tmdbId}:${row.seasonNumber}:${row.episodeNumber}`);
    expect(new Set(keys).size).toBe(keys.length);

    const alpha = rows.episodes
      .filter((row) => row.tmdbId === 101)
      .sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime() || a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
    expect(alpha.map((row) => [row.seasonNumber, row.episodeNumber])).toEqual([
      ...Array.from({ length: 60 }, (_, i) => [1, i + 1]),
      ...Array.from({ length: 40 }, (_, i) => [2, i + 1]),
    ]);
  });

  it("puts the zone-edge rows on the right side of the year boundary", () => {
    const edge = (episode: number) => rows.episodes.find((row) => row.tmdbId === 103 && row.episodeNumber === episode);
    // 2025-01-01 05:00 Brisbane is 2024-12-31 19:00 UTC: counts in 2025.
    expect(edge(39)?.watchedAt.toISOString()).toBe("2024-12-31T19:00:00.000Z");
    expect(inside(edge(39)!.watchedAt, year2025)).toBe(true);
    // 2026-01-01 08:00 Brisbane is 2025-12-31 22:00 UTC: does not.
    expect(edge(40)?.watchedAt.toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(inside(edge(40)!.watchedAt, year2025)).toBe(false);
  });

  it("ticks soloShare of episodes alone, and batches the rest in 2-6 rows sharing a timestamp", () => {
    const solo = uniqueInstants(rows.episodes);
    expect(Math.abs(solo.length / rows.episodes.length - 0.5)).toBeLessThanOrEqual(0.02);

    const batchSizes = [...countBy(rows.episodes, (row) => String(row.watchedAt.getTime())).values()].filter((n) => n > 1);
    expect(batchSizes.length).toBeGreaterThan(0);
    expect(batchSizes.every((n) => n >= 2 && n <= 6)).toBe(true);
  });

  it("puts lateShareOfSolo of the solo ticks at 21:00 local or later", () => {
    const solo = uniqueInstants(rows.episodes);
    const late = solo.filter((row) => getTimezoneHour(row.watchedAt, BRISBANE) >= 21);
    expect(Math.abs(late.length / solo.length - 0.45)).toBeLessThanOrEqual(0.03);
  });

  it("gives the big day exactly its episodes, all solo, and more than any other day", () => {
    const onBigDay = inYear.filter((row) => dateKey(row) === "2025-03-15");
    expect(onBigDay).toHaveLength(14);
    const solo = new Set(uniqueInstants(rows.episodes));
    expect(onBigDay.every((row) => solo.has(row))).toBe(true);

    const perDay = countBy(inYear, dateKey);
    perDay.delete("2025-03-15");
    expect(Math.max(...perDay.values())).toBeLessThan(14);
  });

  it("watches every day of the streak and neither day either side of it", () => {
    const days = new Set(inYear.map(dateKey));
    for (let offset = 0; offset < 17; offset += 1) {
      expect(days.has(addDays("2025-07-04", offset)), addDays("2025-07-04", offset)).toBe(true);
    }
    expect(days.has("2025-07-03")).toBe(false);
    expect(days.has("2025-07-21")).toBe(false);
  });

  it("dates completed and dropped statuses inside the year, on outcomeOn when given", () => {
    const status = (tmdbId: number) => rows.statuses.find((row) => row.tmdbId === tmdbId);

    for (const tmdbId of [101, 102, 201, 202]) {
      expect(inside(status(tmdbId)!.updatedAt, year2025), String(tmdbId)).toBe(true);
    }
    expect(status(101)).toMatchObject({ contentType: "tv", status: "completed" });
    expect(status(102)).toMatchObject({ contentType: "tv", status: "dropped" });
    expect(status(103)).toMatchObject({ contentType: "tv", status: "watching" });
    expect(status(202)).toMatchObject({ contentType: "movie", status: "completed" });
    expect(getTimezoneDateKey(status(102)!.updatedAt, BRISBANE)).toBe("2025-10-12");
    expect(getTimezoneDateKey(status(201)!.updatedAt, BRISBANE)).toBe("2025-05-03");

    // A completed show is dated by its last episode.
    const lastAlpha = Math.max(...rows.episodes.filter((row) => row.tmdbId === 101).map((row) => row.watchedAt.getTime()));
    expect(status(101)!.updatedAt.getTime()).toBeGreaterThanOrEqual(lastAlpha);

    for (const row of rows.statuses) expect(row.createdAt.getTime()).toBeLessThanOrEqual(row.updatedAt.getTime());
  });

  it("dates planning rows at local midnight of addedOn", () => {
    const planning = rows.statuses.filter((row) => row.status === "planning");
    expect(planning.map((row) => [row.tmdbId, row.contentType, row.createdAt.toISOString()])).toEqual([
      [204, "movie", "2024-03-09T14:00:00.000Z"],
      [205, "movie", "2026-02-09T14:00:00.000Z"],
    ]);
  });

  it("produces no unique timestamps for a batch-only persona", () => {
    const batch = generate(BATCH_ONLY, CATALOGUE);
    expect(batch.episodes).toHaveLength(220);
    expect(uniqueInstants(batch.episodes)).toHaveLength(0);
    const sizes = [...countBy(batch.episodes, (row) => String(row.watchedAt.getTime())).values()];
    expect(sizes.every((n) => n >= 2 && n <= 6)).toBe(true);
    expect(batch.episodes.every((row) => inside(row.watchedAt, localYear(2025, 0)))).toBe(true);
  });

  it("keeps a thin spec below both thin-year thresholds", () => {
    const thin = generate(THIN, CATALOGUE);
    const window = localYear(2023, 10);
    const episodes = thin.episodes.filter((row) => inside(row.watchedAt, window));
    const completed = thin.statuses.filter((row) => row.status === "completed" && inside(row.updatedAt, window));
    expect(episodes.length).toBeLessThan(THIN_YEAR_EPISODES);
    expect(completed.length).toBeLessThan(THIN_YEAR_TITLES);
    // Nothing before the account existed.
    expect(thin.episodes.every((row) => getTimezoneDateKey(row.watchedAt, BRISBANE) >= "2023-02-01")).toBe(true);
  });

  it("refuses a title used twice, and more episodes than have aired", () => {
    const twice: PersonaSpec = { ...THIN, planning: [{ key: "f1", addedOn: "2024-01-01" }] };
    expect(() => generate(twice, CATALOGUE)).toThrow(/f1/);

    const tooMany: PersonaSpec = {
      ...BATCH_ONLY,
      years: { 2025: { ...BATCH_ONLY.years[2025]!, shows: [{ key: "gamma", episodes: 41 }] } },
    };
    expect(() => generate(tooMany, CATALOGUE)).toThrow(/gamma/);
  });

  it("refuses a dropped film, a state the app cannot produce", () => {
    const year = THIN.years[2023]!;
    const droppedFilm = { key: "f3", outcome: "dropped" } as unknown as (typeof year.films)[number];
    const spec: PersonaSpec = { ...THIN, years: { 2023: { ...year, films: [...year.films, droppedFilm] } } };
    expect(() => generate(spec, CATALOGUE)).toThrow(/f3/);
  });
});

// The real cast against the committed lock: the properties the specs and the
// oracle rely on, checked with the engine's own pure functions where it has one.
describe("the cast", () => {
  const catalogue = loadCatalogue();
  const generated = new Map(PERSONAS.map((persona) => [persona.username, generate(persona, catalogue)]));
  const rowsOf = (username: string): GeneratedRows => {
    const rows = generated.get(username);
    if (!rows) throw new Error(`no persona ${username}`);
    return rows;
  };
  const avaWindow = localYear(2025, 10);
  const idOf = (key: string) => catalogue.get(key)!.tmdbId;
  const episodesIn = (username: string, window = avaWindow) => rowsOf(username).episodes.filter((row) => inside(row.watchedAt, window));
  const keysWhere = (username: string, status: string, window?: { start: Date; end: Date }) =>
    new Set(
      rowsOf(username)
        .statuses.filter((row) => row.status === status && (!window || inside(row.updatedAt, window)))
        .map((row) => titleKey(row.tmdbId, row.contentType)),
    );

  // What the seeder leaves out of tmdb_cache.
  const uncached = new Set(
    PERSONAS.flatMap((p) => Object.values(p.years).flatMap((y) => y.shows.filter((s) => s.uncached).map((s) => s.key))),
  );

  /** The engine's payload for one persona-year, with every cached title resolvable. */
  function payloadFor(username: string, year: number) {
    const persona = PERSONAS.find((p) => p.username === username)!;
    const window = localYear(year, persona.timezone === "UTC" ? 0 : 10);
    const titles = new Map<string, TitleMeta>(
      [...catalogue.values()].filter((entry) => !uncached.has(entry.key)).map((entry) => [
        titleKey(entry.tmdbId, entry.type),
        { tmdbId: entry.tmdbId, contentType: entry.type, title: entry.title, posterPath: null, genreIds: [], popularity: 0, runtime: null },
      ]),
    );
    return buildPayload(
      {
        period: { ...window, label: String(year) },
        timeZone: persona.timezone,
        episodes: episodesIn(username, window),
        statuses: rowsOf(username).statuses,
        titles,
        genreNames: new Map(),
        episodeMinutes: { minutes: 0, unknownCount: 0 },
        filmMinutes: { minutes: 0, unknownCount: 0 },
        episodeRuntimeLookup: new Map(),
        collaborativeCompletedKeys: new Set(),
        crew: [],
        peers: [],
        percentile: null,
      },
      new Date("2026-09-26T00:00:00Z"),
    );
  }

  it("has valid, unique usernames and the right accounts signing in", () => {
    const names = PERSONAS.map((p) => p.username);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^[a-zA-Z0-9_-]{3,50}$/);
    expect(PERSONAS.filter((p) => p.signsIn).map((p) => p.username)).toEqual([
      "e2e_ava",
      "e2e_bo",
      "e2e_cy",
      "e2e_tia",
      "e2e_neo",
      "e2e_bat",
      "e2e_flo_watches_only_films_and_has_a_long_name",
    ]);
  });

  it("gives ava a rich 2025 with every designed statistic", () => {
    const ava = payloadFor("e2e_ava", 2025);
    expect(ava.headline.episodes).toBe(230);
    expect(ava.topShow?.title).toBe("The Bear");
    expect(ava.finished).toEqual({ films: 22, shows: 4, total: 26 });
    // Five dropped shows, one of them left uncached: four named -> "And one more."
    expect(ava.headline.titlesDropped).toBe(5);
    expect(ava.shame.dropped.map((show) => show.title).sort()).toEqual(["Andor", "Hacks", "Mr. Robot", "The Last of Us"]);
    expect([...uncached]).toEqual(["station-eleven"]);
    expect(ava.soloTickTotal).toBeGreaterThanOrEqual(120);
    expect(ava.rhythm.lateShare).toBeCloseTo(0.45, 1);
    // Sunday-heavy weights with big Sunday sittings: rule 3, ahead of the
    // popularity rule these zero popularities would otherwise trip.
    expect(ava.rhythm.archetype).toBe("weekday-marathoner");
    expect(ava.bigDay).toMatchObject({ date: "2025-03-15", episodes: 14, soloTickCount: 14 });
    expect(ava.bigDay?.timeline).toHaveLength(14);
    expect(ava.bigDay?.streak).toEqual({ days: 17, start: "2025-07-04", end: "2025-07-20" });
    expect(ava.shame.stillPlanning.map((film) => film.title).sort()).toEqual(["Fallen Leaves", "Nickel Boys", "Petite Maman"]);
    expect(ava.thin).toBe(false);
  });

  it("gives ava a non-thin 2024 and a thin 2023", () => {
    expect(payloadFor("e2e_ava", 2024)).toMatchObject({ thin: false, finished: { films: 8 } });
    expect(payloadFor("e2e_ava", 2023)).toMatchObject({ thin: true, headline: { episodes: 6, titlesCompleted: 2 } });
  });

  it("leaves Hacks and Station Eleven to ava alone, and she watched the unknown-runtime episodes in 2025", () => {
    const avaEpisodes = new Set(episodesIn("e2e_ava").map((row) => `${row.tmdbId}:${row.seasonNumber}:${row.episodeNumber}`));
    for (const { key, season, episode } of UNKNOWN_RUNTIME_EPISODES) {
      expect(avaEpisodes.has(`${idOf(key)}:${season}:${episode}`)).toBe(true);
    }
    for (const [username, rows] of generated) {
      if (username === "e2e_ava") continue;
      expect(rows.episodes.some((row) => row.tmdbId === idOf("hacks")), username).toBe(false);
      expect(rows.statuses.some((row) => row.tmdbId === idOf("station-eleven")), username).toBe(false);
    }
  });

  it("makes bo out-watch ava with the same top show, and overlap her as designed", () => {
    expect(episodesIn("e2e_bo").length).toBeGreaterThan(230);
    expect(payloadFor("e2e_bo", 2025).topShow?.title).toBe("The Bear");
    expect(payloadFor("e2e_cy", 2025).topShow?.title).toBe("The Bear");

    const avaCompleted = keysWhere("e2e_ava", "completed", avaWindow);
    const boCompleted = keysWhere("e2e_bo", "completed", avaWindow);
    expect([...boCompleted].filter((key) => avaCompleted.has(key))).toHaveLength(10);
    // theyFinishedYouDropped and bothPlanningNeitherStarted each have exactly one candidate.
    const avaDropped = keysWhere("e2e_ava", "dropped", avaWindow);
    expect([...boCompleted].filter((key) => avaDropped.has(key))).toEqual([titleKey(idOf("mr-robot"), "tv")]);
    const avaPlanning = keysWhere("e2e_ava", "planning");
    expect([...keysWhere("e2e_bo", "planning")].filter((key) => avaPlanning.has(key))).toEqual([titleKey(idOf("fallen-leaves"), "movie")]);
  });

  it("ties dee with ava in ava's window, and keeps The Bear off every other collaborator's top", () => {
    expect(episodesIn("e2e_dee")).toHaveLength(230);
    for (const username of ["e2e_dee", "e2e_eli", "e2e_fay", "e2e_gus", "e2e_hal", "e2e_ivy"]) {
      const count = episodesIn(username).length;
      expect(count, username).toBeGreaterThanOrEqual(40);
      expect(count, username).toBeLessThanOrEqual(230);
      expect(payloadFor(username, 2025).topShow?.title, username).not.toBe("The Bear");
    }
    expect(episodesIn("e2e_jon")).toHaveLength(0);
    expect(rowsOf("e2e_jon").episodes.length).toBeGreaterThan(0);
  });

  it("shares one list, owned by ava, with the nine collaborators", () => {
    const owners = PERSONAS.filter((p) => p.lists?.length);
    expect(owners.map((p) => p.username)).toEqual(["e2e_ava"]);
    const [list] = owners[0]!.lists!;
    expect(list?.name).toBe("Couch Crew");
    expect(list?.collaborators).toEqual(["e2e_bo", "e2e_cy", "e2e_dee", "e2e_eli", "e2e_fay", "e2e_gus", "e2e_hal", "e2e_ivy", "e2e_jon"]);
  });

  it("never seeds a dropped film for anyone", () => {
    for (const [username, rows] of generated) {
      expect(rows.statuses.filter((row) => row.contentType === "movie" && row.status === "dropped"), username).toEqual([]);
    }
  });

  it("covers the edge accounts: thin tia, empty neo, batch-only bat, films-only flo", () => {
    expect(payloadFor("e2e_tia", 2025)).toMatchObject({ thin: true, headline: { episodes: 7, titlesCompleted: 2 } });
    expect(payloadFor("e2e_tia", 2024).thin).toBe(false);

    const neo = rowsOf("e2e_neo");
    expect(neo.episodes).toHaveLength(0);
    expect(neo.statuses.every((row) => row.createdAt >= new Date("2026-05-01T00:00:00Z"))).toBe(true);

    const bat = payloadFor("e2e_bat", 2025);
    expect(bat.headline.episodes).toBe(220);
    expect(bat.soloTickTotal).toBe(0);
    expect(bat.bigDay?.timeline).toBeNull();
    expect(bat.rhythm.lateShare).toBeNull();

    const flo = payloadFor("e2e_flo_watches_only_films_and_has_a_long_name", 2025);
    expect(flo.headline.episodes).toBe(0);
    expect(flo.finished).toEqual({ films: 28, shows: 0, total: 28 });
    expect(flo.topShow).toBeNull();
  });

  it("gives every percentile-cohort member a non-thin 2025 and no lists", () => {
    const pops = PERSONAS.filter((p) => p.username.startsWith("e2e_pop"));
    expect(pops).toHaveLength(12);
    for (const pop of pops) {
      expect(pop.lists, pop.username).toBeUndefined();
      expect(payloadFor(pop.username, 2025).thin, pop.username).toBe(false);
    }
  });
});
