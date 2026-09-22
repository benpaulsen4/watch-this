import { describe, expect, it } from "vitest";

import {
  buildGenres,
  buildMonths,
  buildNiche,
  buildTopShow,
  countDropped,
  countFinished,
  episodesPerDay,
  median,
} from "./aggregate";
import type { ContentStatusRow, TitleMeta, WatchedEpisodeRow } from "./types";

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
