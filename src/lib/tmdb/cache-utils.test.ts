import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal drizzle-like mock. Records every `select()` projection and every
// insert/update payload so the tests can assert on the shape of the queries.
vi.mock("../db", () => {
  const selectProjections: any[] = [];
  const insertPayloads: any[] = [];
  const updatePayloads: any[] = [];
  const resultsQueue: any[] = [];

  const shift = () => (resultsQueue.length ? resultsQueue.shift() : []);

  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(shift()),
    returning: (projection?: any) => {
      selectProjections.push(projection);
      return Promise.resolve(shift());
    },
    onConflictDoNothing: () => chain,
    set: (payload: any) => {
      updatePayloads.push(payload);
      return chain;
    },
    values: (payload: any) => {
      insertPayloads.push(payload);
      return chain;
    },
    then: (resolve: any) => Promise.resolve(shift()).then(resolve),
  };

  const db: any = {
    select: vi.fn((projection?: any) => {
      selectProjections.push(projection);
      return chain;
    }),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    __setMockResults: (arr: any[]) => {
      resultsQueue.length = 0;
      resultsQueue.push(...arr);
    },
    __getSelectProjections: () => selectProjections.slice(),
    __getInsertPayloads: () => insertPayloads.slice(),
    __getUpdatePayloads: () => updatePayloads.slice(),
    __reset: () => {
      selectProjections.length = 0;
      insertPayloads.length = 0;
      updatePayloads.length = 0;
      resultsQueue.length = 0;
    },
  };

  // Column markers -- the real table object is not needed, only identity.
  const tmdbCache = new Proxy(
    {},
    { get: (_t, prop) => (prop === "then" ? undefined : `tmdbCache.${String(prop)}`) },
  ) as any;

  return {
    db,
    tmdbCache,
    ContentType: { MOVIE: "movie", TV: "tv" },
  };
});

vi.mock("../content-status/service", () => ({
  enrichWithContentStatus: vi.fn(async (c: any) => c),
  enrichAllWithContentStatus: vi.fn(async (c: any[]) => c),
}));

vi.mock("./client", () => ({
  tmdbClient: {
    getExtendedMovieDetails: vi.fn(),
    getExtendedTVShowDetails: vi.fn(),
  },
}));

import { db } from "../db";
import { addToCache, getAllCachedContent, getCachedContent } from "./cache-utils";
import { tmdbClient } from "./client";

const anyDb = db as any;

function movieDetails(releaseDate: string) {
  return {
    id: 501,
    title: "Untitled Sequel",
    overview: "",
    poster_path: null,
    backdrop_path: null,
    release_date: releaseDate,
    vote_average: 0,
    vote_count: 0,
    popularity: 0,
    genres: [{ id: 28 }],
    adult: false,
    credits: { cast: [{ id: 1 }] },
    keywords: { keywords: [{ id: 2 }] },
  };
}

function tvDetails(firstAirDate: string) {
  return {
    id: 502,
    name: "Untitled Series",
    overview: "",
    poster_path: null,
    backdrop_path: null,
    first_air_date: firstAirDate,
    vote_average: 0,
    vote_count: 0,
    popularity: 0,
    genres: [{ id: 18 }],
    aggregate_credits: { cast: [{ id: 3 }] },
    keywords: { results: [{ id: 4 }] },
  };
}

function cacheRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "cache-1",
    tmdbId: 501,
    contentType: "movie",
    title: "Untitled Sequel",
    overview: "",
    posterPath: null,
    backdropPath: null,
    releaseDate: new Date(0),
    voteAverage: "0",
    voteCount: 0,
    popularity: "0",
    genreIds: [],
    adult: false,
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("cache-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    anyDb.__reset();
  });

  describe("LOGIC-09: undated content must not write an Invalid Date", () => {
    it("falls back to the epoch when TMDB returns an empty release_date", async () => {
      (tmdbClient.getExtendedMovieDetails as any).mockResolvedValue(
        movieDetails(""),
      );
      anyDb.__setMockResults([[cacheRow()]]);

      await addToCache(501, "movie");

      const [payload] = anyDb.__getInsertPayloads();
      expect(payload.releaseDate).toBeInstanceOf(Date);
      // `new Date("")` is an Invalid Date, which the NOT NULL column rejects.
      expect(Number.isNaN(payload.releaseDate.getTime())).toBe(false);
      expect(payload.releaseDate.getTime()).toBe(0);
    });

    it("falls back to the epoch when TMDB returns an empty first_air_date", async () => {
      (tmdbClient.getExtendedTVShowDetails as any).mockResolvedValue(
        tvDetails(""),
      );
      anyDb.__setMockResults([[cacheRow({ tmdbId: 502, contentType: "tv" })]]);

      await addToCache(502, "tv");

      const [payload] = anyDb.__getInsertPayloads();
      expect(Number.isNaN(payload.releaseDate.getTime())).toBe(false);
      expect(payload.releaseDate.getTime()).toBe(0);
    });

    it("still uses the real date when TMDB provides one", async () => {
      (tmdbClient.getExtendedMovieDetails as any).mockResolvedValue(
        movieDetails("2024-05-17"),
      );
      anyDb.__setMockResults([[cacheRow()]]);

      await addToCache(501, "movie");

      const [payload] = anyDb.__getInsertPayloads();
      expect(payload.releaseDate.toISOString()).toBe(
        new Date("2024-05-17").toISOString(),
      );
    });
  });

  describe("DATA-09: reads project only the consumed columns", () => {
    const forbidden = ["castIds", "keywordIds"];
    const required = [
      "id",
      "tmdbId",
      "contentType",
      "title",
      "overview",
      "posterPath",
      "backdropPath",
      "releaseDate",
      "voteAverage",
      "voteCount",
      "popularity",
      "genreIds",
      "adult",
      "updatedAt",
    ];

    it("getCachedContent projects a bounded column list", async () => {
      anyDb.__setMockResults([[cacheRow()]]);

      await getCachedContent(501, "movie", "user-1");

      const projections = anyDb
        .__getSelectProjections()
        .filter((p: unknown) => p !== undefined);
      expect(projections.length).toBeGreaterThan(0);
      for (const projection of projections) {
        const keys = Object.keys(projection);
        expect(keys.sort()).toEqual([...required].sort());
        for (const column of forbidden) {
          expect(keys).not.toContain(column);
        }
      }
    });

    it("getAllCachedContent projects a bounded column list", async () => {
      anyDb.__setMockResults([[cacheRow()]]);

      await getAllCachedContent([{ tmdbId: 501, contentType: "movie" }], "user-1");

      const projections = anyDb
        .__getSelectProjections()
        .filter((p: unknown) => p !== undefined);
      expect(projections.length).toBeGreaterThan(0);
      for (const projection of projections) {
        for (const column of forbidden) {
          expect(Object.keys(projection)).not.toContain(column);
        }
      }
    });

    it("never issues an unprojected select() against tmdb_cache", async () => {
      anyDb.__setMockResults([[cacheRow()]]);
      await getCachedContent(501, "movie", "user-1");

      // `db.select()` with no argument selects every column, including the
      // unbounded overview and the three integer arrays.
      for (const call of (db.select as any).mock.calls) {
        expect(call[0]).toBeDefined();
      }
    });
  });
});
