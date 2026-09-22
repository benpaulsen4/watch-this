import { describe, expect, it } from "vitest";

import {
  buildBigDay,
  buildGenres,
  buildMonths,
  buildNiche,
  buildPayload,
  buildRhythm,
  buildShame,
  buildTopShow,
  countDropped,
  countFinished,
  episodesPerDay,
  longestStreak,
  median,
  medianEpisodesPerActiveDayByWeekday,
} from "./aggregate";
import {
  type AggregationInput,
  type ContentStatusRow,
  SERIES_FINALE_SCHEMA_VERSION,
  type TitleMeta,
  type WatchedEpisodeRow,
} from "./types";

const PERIOD = {
  start: new Date("2026-01-01T00:00:00Z"),
  end: new Date("2027-01-01T00:00:00Z"),
};

const episode = (iso: string, episodeNumber = 1): WatchedEpisodeRow => ({
  tmdbId: 1,
  seasonNumber: 1,
  episodeNumber,
  watchedAt: new Date(iso),
});

const status = (
  overrides: Partial<ContentStatusRow> & { tmdbId: number },
): ContentStatusRow => ({
  contentType: "tv",
  status: "completed",
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2026-04-04T00:00:00Z"),
  ...overrides,
});

describe("countFinished", () => {
  it("splits completed titles by content type", () => {
    const result = countFinished(
      [
        status({ tmdbId: 1, contentType: "movie" }),
        status({ tmdbId: 2, contentType: "movie" }),
        status({ tmdbId: 3, contentType: "tv" }),
      ],
      PERIOD,
    );

    expect(result).toEqual({ films: 2, shows: 1, total: 3 });
  });

  it("ignores titles completed outside the period", () => {
    const result = countFinished(
      [
        status({ tmdbId: 1, updatedAt: new Date("2025-06-01T00:00:00Z") }),
        status({ tmdbId: 2, updatedAt: new Date("2026-06-01T00:00:00Z") }),
      ],
      PERIOD,
    );

    expect(result.total).toBe(1);
  });

  it("ignores non-completed statuses", () => {
    const result = countFinished(
      [status({ tmdbId: 1, status: "watching" })],
      PERIOD,
    );

    expect(result.total).toBe(0);
  });

  it("treats period end as exclusive", () => {
    const result = countFinished(
      [status({ tmdbId: 1, updatedAt: new Date("2027-01-01T00:00:00Z") })],
      PERIOD,
    );

    expect(result.total).toBe(0);
  });

  it("treats period start as inclusive", () => {
    // The other half of the boundary the exclusive end implies. Without this,
    // `isWithin` could silently become `> start` -- four aggregators share it,
    // so the first instant of the year would vanish from all of them at once.
    const result = countFinished(
      [status({ tmdbId: 1, updatedAt: new Date("2026-01-01T00:00:00Z") })],
      PERIOD,
    );

    expect(result.total).toBe(1);
  });
});

describe("countDropped", () => {
  it("counts only dropped titles inside the period", () => {
    expect(
      countDropped(
        [
          status({ tmdbId: 1, status: "dropped" }),
          status({
            tmdbId: 2,
            status: "dropped",
            updatedAt: new Date("2025-01-01T00:00:00Z"),
          }),
          status({ tmdbId: 3, status: "completed" }),
        ],
        PERIOD,
      ),
    ).toBe(1);
  });
});

describe("buildMonths", () => {
  it("returns twelve zero-filled buckets", () => {
    const result = buildMonths([], [], "UTC", PERIOD);

    expect(result).toHaveLength(12);
    expect(result.every((m) => m.episodes === 0)).toBe(true);
    expect(result.map((m) => m.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("buckets episodes by the month observed in the user's timezone", () => {
    // 2026-04-01T00:30Z is still March in New York. The period starts at New
    // York's local midnight on 1 January, which is 05:00Z -- a real caller
    // builds the period in the viewer's zone, and the year check reads it
    // back in that same zone.
    const result = buildMonths(
      [episode("2026-04-01T00:30:00Z")],
      [],
      "America/New_York",
      {
        start: new Date("2026-01-01T05:00:00Z"),
        end: new Date("2027-01-01T05:00:00Z"),
      },
    );

    expect(result[2]?.episodes).toBe(1);
    expect(result[3]?.episodes).toBe(0);
  });

  it("derives the year in the viewer's timezone, not from UTC", () => {
    // Auckland is UTC+13 in December, so 2025-12-31T11:00Z is local
    // 2026-01-01 -- January of the recap year, on both sides of the check.
    // Taking the year from `period.start.getUTCFullYear()` would read 2025
    // here, match nothing, and return twelve empty buckets for every user east
    // of UTC without throwing.
    const period = {
      start: new Date("2025-12-31T11:00:00Z"),
      end: new Date("2026-12-31T11:00:00Z"),
    };

    const result = buildMonths(
      [episode("2025-12-31T11:00:00Z")],
      [],
      "Pacific/Auckland",
      period,
    );

    expect(result[0]?.episodes).toBe(1);
    expect(result.reduce((sum, m) => sum + m.episodes, 0)).toBe(1);
  });

  it("includes completed films dated by updatedAt", () => {
    const result = buildMonths(
      [],
      [
        status({
          tmdbId: 1,
          contentType: "movie",
          updatedAt: new Date("2026-03-14T12:00:00Z"),
        }),
      ],
      "UTC",
      PERIOD,
    );

    expect(result[2]?.episodes).toBe(1);
  });

  it("ignores rows from another year", () => {
    const result = buildMonths(
      [episode("2025-03-14T12:00:00Z")],
      [],
      "UTC",
      PERIOD,
    );

    expect(result.every((m) => m.episodes === 0)).toBe(true);
  });
});

describe("episodesPerDay", () => {
  it("divides by the number of days in the period", () => {
    expect(episodesPerDay(365, PERIOD)).toBeCloseTo(1, 5);
  });

  it("returns 0 for a zero-length period rather than Infinity", () => {
    expect(episodesPerDay(10, { start: PERIOD.start, end: PERIOD.start })).toBe(
      0,
    );
  });
});

const title = (
  overrides: Partial<TitleMeta> & { tmdbId: number },
): TitleMeta => ({
  contentType: "tv",
  title: `Title ${overrides.tmdbId}`,
  posterPath: null,
  genreIds: [],
  popularity: 50,
  runtime: null,
  ...overrides,
});

const titleMap = (metas: TitleMeta[]) =>
  new Map(metas.map((m) => [`${m.contentType}:${m.tmdbId}`, m]));

describe("median", () => {
  it("returns the middle value for an odd count", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("averages the middle pair for an even count", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns null for no values", () => {
    expect(median([])).toBeNull();
  });
});

describe("buildTopShow", () => {
  it("picks the show with the most watched episodes", () => {
    const result = buildTopShow(
      [
        {
          tmdbId: 1,
          seasonNumber: 1,
          episodeNumber: 1,
          watchedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          tmdbId: 1,
          seasonNumber: 1,
          episodeNumber: 2,
          watchedAt: new Date("2026-01-02T00:00:00Z"),
        },
        {
          tmdbId: 2,
          seasonNumber: 1,
          episodeNumber: 1,
          watchedAt: new Date("2026-01-03T00:00:00Z"),
        },
      ],
      titleMap([title({ tmdbId: 1 }), title({ tmdbId: 2 })]),
      new Map([
        ["1:1:1", 42],
        ["1:1:2", 45],
      ]),
      "UTC",
    );

    expect(result?.tmdbId).toBe(1);
    expect(result?.episodes).toBe(2);
    expect(result?.minutes).toBe(87);
  });

  it("dates the finish from the latest watchedAt, not a status column", () => {
    const result = buildTopShow(
      [
        {
          tmdbId: 1,
          seasonNumber: 1,
          episodeNumber: 1,
          watchedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          tmdbId: 1,
          seasonNumber: 1,
          episodeNumber: 2,
          watchedAt: new Date("2026-04-04T00:00:00Z"),
        },
      ],
      titleMap([title({ tmdbId: 1 })]),
      new Map(),
      "UTC",
    );

    expect(result?.finishedAt).toBe("2026-04-04");
  });

  it("returns null when there are no episodes", () => {
    expect(buildTopShow([], new Map(), new Map(), "UTC")).toBeNull();
  });

  it("returns null when the top show has no cached metadata", () => {
    const result = buildTopShow(
      [
        {
          tmdbId: 99,
          seasonNumber: 1,
          episodeNumber: 1,
          watchedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      new Map(),
      new Map(),
      "UTC",
    );

    expect(result).toBeNull();
  });
});

describe("buildNiche", () => {
  it("picks the least popular completed film and reports the median of the rest", () => {
    const statuses = [
      status({ tmdbId: 1, contentType: "movie" }),
      status({ tmdbId: 2, contentType: "movie" }),
      status({ tmdbId: 3, contentType: "movie" }),
    ];
    const titles = titleMap([
      title({ tmdbId: 1, contentType: "movie", popularity: 2.1 }),
      title({ tmdbId: 2, contentType: "movie", popularity: 68 }),
      title({ tmdbId: 3, contentType: "movie", popularity: 412 }),
    ]);

    const result = buildNiche(statuses, titles, PERIOD);

    expect(result?.tmdbId).toBe(1);
    expect(result?.popularity).toBe(2.1);
    expect(result?.medianPopularity).toBe(240);
    expect(result?.mostPopular?.tmdbId).toBe(3);
  });

  it("falls back to the film's own popularity when it is the only one", () => {
    // A real first year on the app, and the only case that exercises both the
    // `median(others) ?? least.popularity` fallback -- `others` is empty, so
    // the median is null -- and the `mostPopular: null` path, where the least
    // and most popular film are the same row and naming it twice would read
    // as a bug.
    const result = buildNiche(
      [status({ tmdbId: 1, contentType: "movie" })],
      titleMap([title({ tmdbId: 1, contentType: "movie", popularity: 2.1 })]),
      PERIOD,
    );

    expect(result?.medianPopularity).toBe(2.1);
    expect(result?.mostPopular).toBeNull();
  });

  it("returns null when no films were completed", () => {
    expect(buildNiche([], new Map(), PERIOD)).toBeNull();
  });
});

describe("buildGenres", () => {
  it("returns the top five plus a remainder bucket", () => {
    const statuses = Array.from({ length: 6 }, (_, i) =>
      status({ tmdbId: i + 1 }),
    );
    const titles = titleMap(
      Array.from({ length: 6 }, (_, i) =>
        title({ tmdbId: i + 1, genreIds: [i + 1] }),
      ),
    );
    const names = new Map([
      [1, "Sci-Fi & Fantasy"],
      [2, "Drama"],
      [3, "Comedy"],
      [4, "Thriller"],
      [5, "Documentary"],
      [6, "Western"],
    ]);

    const result = buildGenres(statuses, titles, names, PERIOD);

    expect(result).toHaveLength(6);
    expect(result[5]?.name).toBe("Everything else");
  });

  it("omits the remainder bucket when there are five or fewer genres", () => {
    const statuses = [status({ tmdbId: 1 })];
    const titles = titleMap([title({ tmdbId: 1, genreIds: [1] })]);

    const result = buildGenres(
      statuses,
      titles,
      new Map([[1, "Drama"]]),
      PERIOD,
    );

    expect(result).toEqual([{ name: "Drama", percent: 100 }]);
  });

  it("returns an empty list when nothing was completed", () => {
    expect(buildGenres([], new Map(), new Map(), PERIOD)).toEqual([]);
  });
});

/** N episodes sharing one instant -- i.e. a batch write. */
const batch = (iso: string, count: number): WatchedEpisodeRow[] =>
  Array.from({ length: count }, (_, i) => episode(iso, i + 1));

/** N episodes at distinct instants on the same day -- i.e. solo ticks. */
const soloDay = (day: string, hours: number[]): WatchedEpisodeRow[] =>
  hours.map((hour, i) =>
    episode(`${day}T${String(hour).padStart(2, "0")}:00:00.000Z`, i + 1),
  );

/**
 * One solo tick per entry at the given hour, each on its own day so no two
 * share an instant. Lets a test clear `SOLO_TICK_FLOOR` and still control the
 * hour distribution exactly.
 */
const soloTicksAtHours = (hours: number[]): WatchedEpisodeRow[] =>
  hours.map((hour, i) =>
    episode(
      `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String(
        (i % 28) + 1,
      ).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00.000Z`,
      i + 1,
    ),
  );

describe("longestStreak", () => {
  it("finds the longest run of consecutive days", () => {
    expect(
      longestStreak(["2026-01-02", "2026-01-03", "2026-01-04", "2026-02-01"]),
    ).toEqual({ days: 3, start: "2026-01-02", end: "2026-01-04" });
  });

  it("runs a streak across a month boundary", () => {
    // The classic off-by-one: day-of-month arithmetic breaks the run at the
    // end of January, reporting two streaks of two instead of one of four.
    expect(
      longestStreak(["2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02"]),
    ).toEqual({ days: 4, start: "2026-01-30", end: "2026-02-02" });
  });

  it("handles a single day", () => {
    expect(longestStreak(["2026-01-02"])).toEqual({
      days: 1,
      start: "2026-01-02",
      end: "2026-01-02",
    });
  });

  it("deduplicates repeated days", () => {
    expect(longestStreak(["2026-01-02", "2026-01-02"])?.days).toBe(1);
  });

  it("returns null for no days", () => {
    expect(longestStreak([])).toBeNull();
  });
});

describe("buildBigDay", () => {
  it("picks the day with the most episodes and counts all of them", () => {
    const result = buildBigDay(
      [...batch("2026-03-14T12:00:00.000Z", 11), ...soloDay("2026-03-15", [20])],
      "UTC",
      new Map(),
    );

    expect(result?.date).toBe("2026-03-14");
    expect(result?.episodes).toBe(11);
  });

  it("returns a null timeline when solo ticks are below the floor", () => {
    const result = buildBigDay(batch("2026-03-14T12:00:00.000Z", 11), "UTC", new Map());

    expect(result?.timeline).toBeNull();
    expect(result?.soloTickCount).toBe(0);
  });

  it("returns a timeline once solo ticks clear the floor", () => {
    // 60 solo ticks across 60 distinct hours, all on distinct days
    const solo = Array.from({ length: 60 }, (_, i) =>
      episode(
        `2026-0${Math.floor(i / 28) + 1}-${String((i % 28) + 1).padStart(2, "0")}T21:00:00.000Z`,
        i + 1,
      ),
    );

    const result = buildBigDay(solo, "UTC", new Map());

    expect(result?.timeline).not.toBeNull();
  });

  it("breaks a tie on the earlier date, whatever order the rows arrive in", () => {
    // Two days of two episodes each. Resolving the tie by iteration order
    // would make the answer depend on the caller's ORDER BY.
    const march = soloDay("2026-03-03", [10, 11]);
    const september = soloDay("2026-09-09", [10, 11]);

    expect(buildBigDay([...september, ...march], "UTC", new Map())?.date).toBe(
      "2026-03-03",
    );
    expect(buildBigDay([...march, ...september], "UTC", new Map())?.date).toBe(
      "2026-03-03",
    );
  });

  it("returns null for no episodes", () => {
    expect(buildBigDay([], "UTC", new Map())).toBeNull();
  });
});

describe("buildRhythm", () => {
  it("counts weekdays Monday-first over every episode, batched included", () => {
    // 2026-03-16 is a Monday
    const result = buildRhythm(batch("2026-03-16T12:00:00.000Z", 3), "UTC");

    expect(result.weekdayCounts[0]).toBe(3);
    expect(result.topWeekday).toBe(0);
  });

  it("returns a null lateShare below the solo-tick floor", () => {
    expect(buildRhythm(batch("2026-03-16T22:00:00.000Z", 3), "UTC").lateShare).toBeNull();
  });

  it("counts 21:00 onwards as late and divides by solo ticks alone", () => {
    // 40 ticks at 20:00 and 10 from 21:00 on. The hour-20 rows are the
    // boundary: counting them would give 1, not 0.2. The 100-episode batch
    // is excluded from both halves of the fraction, so it cannot dilute it.
    const rows = [
      ...soloTicksAtHours([
        ...Array.from({ length: 40 }, () => 20),
        ...Array.from({ length: 4 }, () => 21),
        ...Array.from({ length: 3 }, () => 22),
        ...Array.from({ length: 3 }, () => 23),
      ]),
      ...batch("2026-06-06T12:00:00.000Z", 100),
    ];

    expect(buildRhythm(rows, "UTC").lateShare).toBe(0.2);
  });

  it("separates no late ticks from too few ticks to say", () => {
    // One row either side of the floor, so "nothing to divide by" reads as
    // null and a genuine zero share reads as 0.
    const noon = (count: number) =>
      soloTicksAtHours(Array.from({ length: count }, () => 12));

    expect(buildRhythm(noon(49), "UTC").lateShare).toBeNull();
    expect(buildRhythm(noon(50), "UTC").lateShare).toBe(0);
  });

  it("returns zero counts for no episodes", () => {
    const result = buildRhythm([], "UTC");

    expect(result.weekdayCounts).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(result.topWeekday).toBeNull();
  });
});

describe("medianEpisodesPerActiveDayByWeekday", () => {
  it("computes the median only over days that weekday was active", () => {
    // Two Sundays: one with 4 episodes, one with 6. Median is 5.
    const result = medianEpisodesPerActiveDayByWeekday(
      [
        ...batch("2026-03-15T12:00:00.000Z", 4),
        ...batch("2026-03-22T12:00:00.000Z", 6),
      ],
      "UTC",
    );

    expect(result[6]).toBe(5);
  });

  it("leaves days that weekday was quiet out of the median entirely", () => {
    // Three active Sundays of 1, 1 and 9 episodes -- median 1. The other
    // forty-nine Sundays of the year must not enter as zeros, or every median
    // collapses toward zero and archetype rule 3 becomes unreachable.
    const result = medianEpisodesPerActiveDayByWeekday(
      [
        ...batch("2026-03-01T12:00:00.000Z", 1),
        ...batch("2026-03-08T12:00:00.000Z", 1),
        ...batch("2026-03-15T12:00:00.000Z", 9),
      ],
      "UTC",
    );

    expect(result[6]).toBe(1);
  });

  it("returns zero for a weekday with no activity", () => {
    expect(medianEpisodesPerActiveDayByWeekday([], "UTC")).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});

describe("buildShame", () => {
  const NOW = new Date("2026-12-31T00:00:00Z");

  it("lists dropped shows with the last episode watched", () => {
    const result = buildShame(
      [status({ tmdbId: 1, status: "dropped" })],
      titleMap([title({ tmdbId: 1, title: "Foundation" })]),
      [
        { tmdbId: 1, seasonNumber: 2, episodeNumber: 3, watchedAt: new Date("2026-02-01T00:00:00Z") },
        { tmdbId: 1, seasonNumber: 2, episodeNumber: 1, watchedAt: new Date("2026-01-01T00:00:00Z") },
      ],
      PERIOD,
      NOW,
    );

    expect(result.dropped).toEqual([
      { tmdbId: 1, title: "Foundation", lastEpisode: "S2E03" },
    ]);
  });

  it("reports a null last episode when none were watched", () => {
    const result = buildShame(
      [status({ tmdbId: 1, status: "dropped" })],
      titleMap([title({ tmdbId: 1 })]),
      [],
      PERIOD,
      NOW,
    );

    expect(result.dropped[0]?.lastEpisode).toBeNull();
  });

  it("lists still-planning films with days since they were added", () => {
    const result = buildShame(
      [
        status({
          tmdbId: 2,
          contentType: "movie",
          status: "planning",
          createdAt: new Date("2026-12-01T00:00:00Z"),
        }),
      ],
      titleMap([
        title({ tmdbId: 2, contentType: "movie", title: "Blade Runner 2049", runtime: 164 }),
      ]),
      [],
      PERIOD,
      NOW,
    );

    expect(result.stillPlanning).toEqual([
      { tmdbId: 2, title: "Blade Runner 2049", days: 30, runtime: 164 },
    ]);
  });

  it("counts a film added the same day as zero days, not one", () => {
    // Whole days elapsed, so something added this morning has not been
    // waiting a day yet. A ceiling here would open every recap with "1 day".
    const result = buildShame(
      [
        status({
          tmdbId: 2,
          contentType: "movie",
          status: "planning",
          createdAt: new Date("2026-12-31T00:00:00Z"),
        }),
      ],
      titleMap([title({ tmdbId: 2, contentType: "movie" })]),
      [],
      PERIOD,
      NOW,
    );

    expect(result.stillPlanning[0]?.days).toBe(0);
  });

  it("orders still-planning films by longest wait first", () => {
    const result = buildShame(
      [
        status({ tmdbId: 1, contentType: "movie", status: "planning", createdAt: new Date("2026-12-01T00:00:00Z") }),
        status({ tmdbId: 2, contentType: "movie", status: "planning", createdAt: new Date("2024-01-01T00:00:00Z") }),
      ],
      titleMap([
        title({ tmdbId: 1, contentType: "movie" }),
        title({ tmdbId: 2, contentType: "movie" }),
      ]),
      [],
      PERIOD,
      NOW,
    );

    expect(result.stillPlanning.map((f) => f.tmdbId)).toEqual([2, 1]);
  });

  it("orders both lists the same way whatever order the rows arrive in", () => {
    // Two dropped shows, and two films added on the same day so `days` ties.
    // Neither list ranks its entries against each other, so without an
    // explicit order both would fall back to the caller's query order and the
    // same year would render differently on a query change.
    const sameDay = new Date("2026-12-01T00:00:00Z");
    const statuses = [
      status({ tmdbId: 1, status: "dropped" }),
      status({ tmdbId: 2, status: "dropped" }),
      status({
        tmdbId: 3,
        contentType: "movie",
        status: "planning",
        createdAt: sameDay,
      }),
      status({
        tmdbId: 4,
        contentType: "movie",
        status: "planning",
        createdAt: sameDay,
      }),
    ];
    const titles = titleMap([
      title({ tmdbId: 1 }),
      title({ tmdbId: 2 }),
      title({ tmdbId: 3, contentType: "movie" }),
      title({ tmdbId: 4, contentType: "movie" }),
    ]);

    const forwards = buildShame(statuses, titles, [], PERIOD, NOW);
    const backwards = buildShame(
      [...statuses].reverse(),
      titles,
      [],
      PERIOD,
      NOW,
    );

    expect(forwards).toEqual(backwards);
    expect(forwards.dropped.map((s) => s.tmdbId)).toEqual([1, 2]);
    expect(forwards.stillPlanning.map((f) => f.tmdbId)).toEqual([3, 4]);
  });

  it("never reports negative days when a row is written ahead of the clock", () => {
    // Clock skew between the row's writer and this caller. A raw floor would
    // give -1 here, which renders as a broken recap rather than as the
    // sub-second skew it is.
    const result = buildShame(
      [
        status({
          tmdbId: 2,
          contentType: "movie",
          status: "planning",
          createdAt: new Date("2026-12-31T00:00:01Z"),
        }),
      ],
      titleMap([title({ tmdbId: 2, contentType: "movie" })]),
      [],
      PERIOD,
      NOW,
    );

    expect(result.stillPlanning[0]?.days).toBe(0);
  });

  it("returns empty lists when there is nothing to report", () => {
    expect(buildShame([], new Map(), [], PERIOD, NOW)).toEqual({
      dropped: [],
      stillPlanning: [],
    });
  });
});

const input = (overrides: Partial<AggregationInput> = {}): AggregationInput => ({
  period: { start: PERIOD.start, end: PERIOD.end, label: "2026" },
  timeZone: "UTC",
  episodes: [],
  statuses: [],
  titles: new Map(),
  genreNames: new Map(),
  episodeMinutes: { minutes: 0, unknownCount: 0 },
  filmMinutes: { minutes: 0, unknownCount: 0 },
  episodeRuntimeLookup: new Map(),
  collaborativeCompletedKeys: new Set(),
  crew: [],
  peers: [],
  percentile: null,
  ...overrides,
});

describe("buildPayload", () => {
  const NOW = new Date("2026-12-31T00:00:00Z");

  it("stamps the current schema version", () => {
    expect(buildPayload(input(), NOW).schemaVersion).toBe(
      SERIES_FINALE_SCHEMA_VERSION,
    );
  });

  it("combines episode and film minutes into the headline hours", () => {
    const payload = buildPayload(
      input({
        episodeMinutes: { minutes: 24_000, unknownCount: 3 },
        filmMinutes: { minutes: 750, unknownCount: 1 },
      }),
      NOW,
    );

    expect(payload.headline.minutes).toBe(24_750);
    // 412.5 hours, deliberately not a whole number: an exact multiple of 60
    // reads the same under floor, ceil and round, so it would pin the sum and
    // say nothing about the rounding.
    expect(payload.headline.hours).toBe(413);
    expect(payload.headline.unknownRuntimeEpisodes).toBe(4);
  });

  it("rounds the headline hours down when the remainder is under half", () => {
    // The other direction. A remainder over half also passes under `Math.ceil`
    // and one under half also passes under `Math.floor`, so only the pair pins
    // `Math.round`.
    const payload = buildPayload(
      input({ episodeMinutes: { minutes: 24_730, unknownCount: 0 } }),
      NOW,
    );

    expect(payload.headline.hours).toBe(412);
  });

  it("marks a thin period", () => {
    expect(buildPayload(input(), NOW).thin).toBe(true);
  });

  it("does not mark a substantial period as thin", () => {
    const episodes = Array.from({ length: 40 }, (_, i) =>
      episode(`2026-03-${String((i % 28) + 1).padStart(2, "0")}T12:00:00.000Z`, i + 1),
    );

    expect(buildPayload(input({ episodes }), NOW).thin).toBe(false);
  });

  it("passes the percentile through unchanged", () => {
    expect(buildPayload(input({ percentile: 4 }), NOW).headline.percentile).toBe(4);
  });

  it("serialises the period as ISO strings", () => {
    const payload = buildPayload(input(), NOW);

    expect(payload.period.start).toBe(PERIOD.start.toISOString());
    expect(payload.period.label).toBe("2026");
  });

  it("keeps the period-wide solo-tick count apart from the big day's", () => {
    // Sixty solo ticks, all at 21:00, five per month on distinct days so no
    // month dominates and no day holds more than one. The archetype reads the
    // period's count (60, clearing the floor, so rule 5 runs and lands on
    // nightly-ritualist) while `bigDay.soloTickCount` reads one day's (1).
    // The same name on two payload-facing fields with different denominators,
    // so crossing them typechecks: the archetype falls through to null because
    // 1 is below the floor, or the big day claims all sixty ticks.
    const episodes = Array.from({ length: 60 }, (_, i) =>
      episode(
        `2026-${String(Math.floor(i / 5) + 1).padStart(2, "0")}-0${(i % 5) + 1}T21:00:00.000Z`,
        i + 1,
      ),
    );

    const payload = buildPayload(input({ episodes }), NOW);

    expect(payload.rhythm.archetype).toBe("nightly-ritualist");
    expect(payload.bigDay?.soloTickCount).toBe(1);
  });

  it("routes each statistic to the field named for it", () => {
    // Every other test in this block leaves `statuses` empty, which makes
    // `titlesDropped`, `titlesCompleted` and `finished.total` all zero -- so
    // `titlesDropped: finished.total`, the crossing that typechecks silently,
    // passes every one of them. Here the three hold different values, and the
    // same fixture populates the months, genre and shame cards so their wiring
    // is pinned too.
    const statuses = [
      status({ tmdbId: 1, status: "dropped" }),
      status({ tmdbId: 2, status: "dropped" }),
      status({ tmdbId: 3, status: "dropped" }),
      status({ tmdbId: 4, contentType: "movie" }),
      status({ tmdbId: 5 }),
      status({
        tmdbId: 6,
        contentType: "movie",
        status: "planning",
        createdAt: new Date("2026-12-01T00:00:00Z"),
      }),
    ];
    const titles = titleMap([
      title({ tmdbId: 1, title: "Foundation" }),
      title({ tmdbId: 2 }),
      title({ tmdbId: 3 }),
      title({ tmdbId: 4, contentType: "movie", genreIds: [1] }),
      title({ tmdbId: 5, genreIds: [1, 2] }),
      title({ tmdbId: 6, contentType: "movie" }),
    ]);
    const episodes = [
      episode("2026-03-14T12:00:00.000Z", 1),
      episode("2026-03-15T12:00:00.000Z", 2),
    ];

    const payload = buildPayload(
      input({
        statuses,
        titles,
        episodes,
        genreNames: new Map([
          [1, "Drama"],
          [2, "Comedy"],
        ]),
      }),
      NOW,
    );

    expect(payload.headline.titlesDropped).toBe(3);
    expect(payload.headline.titlesCompleted).toBe(2);
    expect(payload.headline.episodes).toBe(2);
    expect(payload.finished).toEqual({ films: 1, shows: 1, total: 2 });

    // March holds the two episodes; April holds the completed film, dated by
    // `updatedAt`. The completed show contributes to neither -- only films are
    // bucketed that way, because only films lack a per-watch timestamp.
    expect(payload.months[2]?.episodes).toBe(2);
    expect(payload.months[3]?.episodes).toBe(1);

    // Three genre tags across the two completed titles, Drama carrying two of
    // them. Tags, not titles: the denominator is 3, not 2.
    expect(payload.genres).toEqual([
      { name: "Drama", percent: 67 },
      { name: "Comedy", percent: 33 },
    ]);

    expect(payload.shame.dropped.map((show) => show.tmdbId)).toEqual([1, 2, 3]);
    expect(payload.shame.dropped[0]?.lastEpisode).toBe("S1E02");
    expect(payload.shame.stillPlanning).toEqual([
      { tmdbId: 6, title: "Title 6", days: 30, runtime: null },
    ]);

    expect(payload.topShow?.tmdbId).toBe(1);
    expect(payload.topShow?.episodes).toBe(2);
    expect(payload.niche?.tmdbId).toBe(4);
  });
});
