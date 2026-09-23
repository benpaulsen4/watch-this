import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock shape mirrors src/lib/activity/service.test.ts. Keep them in step --
// later tasks append to this file and its queue order must track query order.
vi.mock("../db", () => {
  const resultsQueue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    set: () => chain,
    values: () => chain,
    onConflictDoUpdate: () => chain,
    limit: () => Promise.resolve(resultsQueue.shift() ?? []),
    returning: () => Promise.resolve(resultsQueue.shift() ?? []),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resultsQueue.shift() ?? []).then(resolve),
  });

  const db = {
    select: vi.fn(() => chain),
    selectDistinct: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    __setResults: (rows: unknown[]) => {
      resultsQueue.length = 0;
      resultsQueue.push(...rows);
    },
  };

  return { db };
});

vi.mock("../db/schema", () => ({
  episodeWatchStatus: {},
  userContentStatus: {},
  tmdbCache: {},
  users: {},
  lists: {},
  listItems: {},
  listCollaborators: {},
  seriesFinale: {},
  ContentType: { MOVIE: "movie", TV: "tv" },
}));

const getMovieGenres = vi.fn().mockResolvedValue({ genres: [] });
const getTVGenres = vi.fn().mockResolvedValue({ genres: [] });
vi.mock("../tmdb/client", () => ({
  tmdbClient: {
    getMovieGenres: () => getMovieGenres(),
    getTVGenres: () => getTVGenres(),
    getTVSeasonDetails: vi.fn(),
    getMovieDetails: vi.fn(),
  },
}));

import { db } from "../db";
import { calendarYearPeriod } from "./periods";
import { clearGenreNameCache, loadGenreNames, loadUserRows } from "./service";

const setResults = (rows: unknown[]) =>
  (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults(rows);

describe("loadUserRows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMovieGenres.mockResolvedValue({ genres: [] });
    getTVGenres.mockResolvedValue({ genres: [] });
    clearGenreNameCache();
  });

  it("returns episodes, statuses and a title map keyed by content type", async () => {
    setResults([
      // episodes
      [
        {
          tmdbId: 1,
          seasonNumber: 1,
          episodeNumber: 1,
          watchedAt: new Date("2026-03-14T20:00:00Z"),
        },
      ],
      // statuses
      [
        {
          tmdbId: 1,
          contentType: "tv",
          status: "completed",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-04-04T00:00:00Z"),
        },
      ],
      // titles
      [
        {
          tmdbId: 1,
          contentType: "tv",
          title: "The Bear",
          posterPath: "/a.jpg",
          genreIds: [18],
          popularity: "88.5",
          runtime: null,
        },
      ],
    ]);

    const result = await loadUserRows("user-1", calendarYearPeriod(2026));

    expect(result.episodes).toHaveLength(1);
    expect(result.statuses).toHaveLength(1);
    expect(result.titles.get("tv:1")?.title).toBe("The Bear");
  });

  it("coerces the decimal popularity column to a number", async () => {
    // R2: episodes and statuses must not both be empty, or the referenced-id
    // set is empty and the titles query never runs. A status row is enough to
    // drive the reference.
    setResults([
      [],
      [
        {
          tmdbId: 1,
          contentType: "movie",
          status: "completed",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-04-04T00:00:00Z"),
        },
      ],
      [
        {
          tmdbId: 1,
          contentType: "movie",
          title: "Sinners",
          posterPath: null,
          genreIds: [],
          popularity: "2.10",
          runtime: 164,
        },
      ],
    ]);

    const result = await loadUserRows("user-1", calendarYearPeriod(2026));

    expect(result.titles.get("movie:1")?.popularity).toBe(2.1);
  });
});

describe("loadGenreNames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMovieGenres.mockResolvedValue({ genres: [] });
    getTVGenres.mockResolvedValue({ genres: [] });
    clearGenreNameCache();
  });

  it("maps ids to names across both movie and TV lists", async () => {
    getMovieGenres.mockResolvedValue({ genres: [{ id: 18, name: "Drama" }] });
    getTVGenres.mockResolvedValue({
      genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
    });

    const names = await loadGenreNames();

    expect(names.get(18)).toBe("Drama");
    expect(names.get(10765)).toBe("Sci-Fi & Fantasy");
  });

  it("returns an empty map rather than throwing when TMDB is unreachable", async () => {
    getMovieGenres.mockRejectedValue(new Error("503"));
    getTVGenres.mockRejectedValue(new Error("503"));

    await expect(loadGenreNames()).resolves.toBeInstanceOf(Map);
  });

  it("serves a successful non-empty load from cache on the second call", async () => {
    getMovieGenres.mockResolvedValue({ genres: [{ id: 18, name: "Drama" }] });
    getTVGenres.mockResolvedValue({
      genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }],
    });

    const first = await loadGenreNames();
    const second = await loadGenreNames();

    expect(second.get(18)).toBe("Drama");
    expect(second).toEqual(first);
    expect(getMovieGenres).toHaveBeenCalledTimes(1);
    expect(getTVGenres).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed load, so a later successful load still returns names", async () => {
    getMovieGenres.mockRejectedValueOnce(new Error("503"));
    getTVGenres.mockRejectedValueOnce(new Error("503"));

    const failed = await loadGenreNames();
    expect(failed.size).toBe(0);

    getMovieGenres.mockResolvedValue({ genres: [{ id: 18, name: "Drama" }] });
    getTVGenres.mockResolvedValue({ genres: [] });

    const recovered = await loadGenreNames();
    expect(recovered.get(18)).toBe("Drama");
  });
});
