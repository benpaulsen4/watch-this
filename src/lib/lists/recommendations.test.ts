import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("drizzle-orm", () => {
  const sqlTag = () => ({
    as: () => ({}),
  });

  return {
    and: vi.fn(() => ({})),
    eq: vi.fn(() => ({})),
    inArray: vi.fn(() => ({})),
    or: vi.fn(() => ({})),
    sql: Object.assign(sqlTag, { raw: vi.fn(() => ({})) }),
  };
});

vi.mock("../db", () => {
  const resultsQueue: any[] = [];
  const setResults = (arr: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...arr);
  };

  const insertCalls: Array<{ table: any; payload: any }> = [];

  const chain: any = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(resultsQueue.shift()),
    values: (payload: any) => {
      insertCalls.push({ table: (chain as any).__currentInsertTable, payload });
      return chain;
    },
    onConflictDoUpdate: () => Promise.resolve(undefined),
    then: (resolve: any) => Promise.resolve(resultsQueue.shift()).then(resolve),
  };

  const db: any = {
    select: vi.fn(() => chain),
    insert: vi.fn((table: any) => {
      (chain as any).__currentInsertTable = table;
      return chain;
    }),
  };
  (db as any).__setMockResults = setResults;
  (db as any).__getInsertCalls = () => insertCalls.slice();
  (db as any).__resetInserts = () => {
    insertCalls.length = 0;
  };

  const ListType = {
    MOVIE: "movies",
    TV: "tv",
    MIXED: "mixed",
  } as const;

  const ContentType = {
    MOVIE: "movie",
    TV: "tv",
  } as const;

  const ContentTypeEnum = ContentType;

  const listItems = {
    listId: "listItems.listId",
    tmdbId: "listItems.tmdbId",
    contentType: "listItems.contentType",
    createdAt: "listItems.createdAt",
  } as any;

  const listRecommendationsCache = {
    listId: "listRecommendationsCache.listId",
  } as any;

  const tmdbCache = {
    tmdbId: "tmdbCache.tmdbId",
    contentType: "tmdbCache.contentType",
  } as any;

  return {
    ContentType,
    ContentTypeEnum,
    ListType,
    db,
    listItems,
    listRecommendationsCache,
    tmdbCache,
  };
});

vi.mock("./service", () => ({
  getList: vi.fn(),
}));

vi.mock("@/lib/tmdb/cache-utils", () => ({
  getAllCachedContent: vi.fn(async (keys: any[]) =>
    keys.map((k) => ({
      id: k.tmdbId,
      tmdbId: k.tmdbId,
      contentType: k.contentType,
      title: `${k.contentType}-${k.tmdbId}`,
    })),
  ),
}));

vi.mock("@/lib/tmdb/client", () => ({
  tmdbClient: {
    discoverMovies: vi.fn(),
    discoverTVShows: vi.fn(),
    getExtendedMovieDetails: vi.fn(),
    getExtendedTVShowDetails: vi.fn(),
  },
}));

import { getAllCachedContent } from "@/lib/tmdb/cache-utils";
import { tmdbClient } from "@/lib/tmdb/client";

import { TMDBContent } from "../content-status/types";
import { db, listRecommendationsCache, ListType, tmdbCache } from "../db";
import { getListRecommendations } from "./recommendations";
import { getList } from "./service";

function makeMovieDetails(id: number, overrides: Partial<any> = {}) {
  return {
    id,
    title: `Movie ${id}`,
    overview: `Overview ${id}`,
    poster_path: `/p/${id}.jpg`,
    backdrop_path: `/b/${id}.jpg`,
    genres: [{ id: 10 }],
    credits: { cast: [{ id: 1000 }] },
    keywords: { keywords: [{ id: 500 }] },
    release_date: "2025-01-01",
    vote_average: 7.5,
    vote_count: 250,
    popularity: 123,
    adult: false,
    ...overrides,
  };
}

function makeTVDetails(id: number, overrides: Partial<any> = {}) {
  return {
    id,
    name: `Show ${id}`,
    overview: `Overview ${id}`,
    poster_path: `/p/${id}.jpg`,
    backdrop_path: `/b/${id}.jpg`,
    genres: [{ id: 20 }],
    aggregate_credits: { cast: [{ id: 2000 }] },
    keywords: { results: [{ id: 700 }] },
    first_air_date: "2025-01-01",
    vote_average: 7.2,
    vote_count: 200,
    popularity: 111,
    ...overrides,
  };
}

describe("getListRecommendations", () => {
  const userId = "user-1";
  const listId = "list-1";

  beforeEach(() => {
    vi.clearAllMocks();
    (db as any).__setMockResults([]);
    (db as any).__resetInserts();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-10T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns notFound when list is not accessible", async () => {
    (getList as any).mockResolvedValue("notFound");
    const res = await getListRecommendations(userId, listId);
    expect(res).toBe("notFound");
  });

  it("serves cached recommendations when cache is fresh and list unchanged", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.MOVIE });

    const cachedKeys = [
      { tmdbId: 101, contentType: "movie" },
      { tmdbId: 102, contentType: "movie" },
    ];

    (db as any).__setMockResults([
      [{ latestCreatedAt: "2024-12-01T00:00:00.000Z" }],
      [
        {
          listId,
          updatedAt: new Date("2025-01-05T00:00:00.000Z"),
          itemsUpdatedAt: new Date("2025-01-05T00:00:00.000Z"),
          recommendations: cachedKeys,
        },
      ],
    ]);

    const res = await getListRecommendations(userId, listId);

    expect(getAllCachedContent).toHaveBeenCalledWith(cachedKeys, userId);
    expect(tmdbClient.discoverMovies).not.toHaveBeenCalled();
    expect(tmdbClient.getExtendedMovieDetails).not.toHaveBeenCalled();
    expect(res).toEqual([
      { id: 101, tmdbId: 101, contentType: "movie", title: "movie-101" },
      { id: 102, tmdbId: 102, contentType: "movie", title: "movie-102" },
    ]);
  });

  it("bypasses cache when cached recommendations are older than 14 days", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.MOVIE });

    const cachedKeys = [{ tmdbId: 999, contentType: "movie" }];

    (tmdbClient.discoverMovies as any).mockImplementation(
      async ({ page }: any) => {
        const idsByPage: Record<number, number[]> = {
          1: [1, 100, 101],
          2: [102, 103],
          3: [104],
          4: [105],
        };
        return { results: (idsByPage[page] ?? []).map((id) => ({ id })) };
      },
    );

    (tmdbClient.getExtendedMovieDetails as any).mockImplementation(
      async (id: number) => makeMovieDetails(id),
    );

    (db as any).__setMockResults([
      [{ latestCreatedAt: "2025-01-01T00:00:00.000Z" }],
      [
        {
          listId,
          updatedAt: new Date("2024-12-10T00:00:00.000Z"),
          itemsUpdatedAt: new Date("2025-01-01T00:00:00.000Z"),
          recommendations: cachedKeys,
        },
      ],
      [{ tmdbId: 1, contentType: "movie" }],
      [
        {
          tmdbId: 1,
          contentType: "movie",
          genreIds: [10],
          keywordIds: [],
          castIds: [],
        },
      ],
    ]);

    const res = await getListRecommendations(userId, listId);

    expect(tmdbClient.discoverMovies).toHaveBeenCalled();
    expect((getAllCachedContent as any).mock.calls[0][0]).not.toEqual(
      cachedKeys,
    );
    expect(res).toHaveLength(6);
  });

  it("bypasses cache when list items changed after cache was generated", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.MOVIE });

    const cachedKeys = [{ tmdbId: 999, contentType: "movie" }];

    (tmdbClient.discoverMovies as any).mockImplementation(
      async ({ page }: any) => {
        const idsByPage: Record<number, number[]> = {
          1: [1, 100, 101],
          2: [102, 103],
          3: [104],
          4: [105],
        };
        return { results: (idsByPage[page] ?? []).map((id) => ({ id })) };
      },
    );

    (tmdbClient.getExtendedMovieDetails as any).mockImplementation(
      async (id: number) => makeMovieDetails(id),
    );

    (db as any).__setMockResults([
      [{ latestCreatedAt: "2025-01-09T00:00:00.000Z" }],
      [
        {
          listId,
          updatedAt: new Date("2025-01-05T00:00:00.000Z"),
          itemsUpdatedAt: new Date("2025-01-01T00:00:00.000Z"),
          recommendations: cachedKeys,
        },
      ],
      [{ tmdbId: 1, contentType: "movie" }],
      [
        {
          tmdbId: 1,
          contentType: "movie",
          genreIds: [10],
          keywordIds: [],
          castIds: [],
        },
      ],
    ]);

    const res = await getListRecommendations(userId, listId);

    expect(tmdbClient.discoverMovies).toHaveBeenCalled();
    expect((getAllCachedContent as any).mock.calls[0][0]).not.toEqual(
      cachedKeys,
    );
    expect(res).toHaveLength(6);
  });

  it("returns empty array when list has no items", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.MOVIE });

    (db as any).__setMockResults([[{ latestCreatedAt: null }], [], []]);

    const res = await getListRecommendations(userId, listId);
    expect(res).toEqual([]);
    expect(tmdbClient.discoverMovies).not.toHaveBeenCalled();
  });

  it("writes an empty cache when there is not enough metadata to discover candidates", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.MOVIE });

    (db as any).__setMockResults([
      [{ latestCreatedAt: null }],
      [],
      [
        { tmdbId: 1, contentType: "movie" },
        { tmdbId: 2, contentType: "movie" },
      ],
      [],
    ]);

    const res = await getListRecommendations(userId, listId);
    expect(res).toEqual([]);

    const inserts = (db as any).__getInsertCalls();
    const cacheInsert = inserts.find(
      (c: any) => c.table === listRecommendationsCache,
    );
    expect(cacheInsert).toBeTruthy();
    expect(cacheInsert.payload.listId).toBe(listId);
    expect(cacheInsert.payload.recommendations).toEqual([]);
  });

  it("filters out discovered items already present in the list and caches empty results", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.MOVIE });

    (tmdbClient.discoverMovies as any).mockResolvedValue({
      results: [{ id: 1 }, { id: 2 }],
    });

    (db as any).__setMockResults([
      [{ latestCreatedAt: null }],
      [],
      [
        { tmdbId: 1, contentType: "movie" },
        { tmdbId: 2, contentType: "movie" },
      ],
      [
        {
          tmdbId: 1,
          contentType: "movie",
          genreIds: [10],
          keywordIds: [],
          castIds: [],
        },
      ],
    ]);

    const res = await getListRecommendations(userId, listId);
    expect(res).toEqual([]);

    expect(tmdbClient.discoverMovies).toHaveBeenCalled();
    expect(tmdbClient.getExtendedMovieDetails).not.toHaveBeenCalled();

    const inserts = (db as any).__getInsertCalls();
    const cacheInsert = inserts.find(
      (c: any) => c.table === listRecommendationsCache,
    );
    expect(cacheInsert.payload.recommendations).toEqual([]);
  });

  it("discovers candidates, upserts TMDB cache rows, stores recommendation keys, and returns hydrated content", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.MOVIE });

    (tmdbClient.discoverMovies as any).mockImplementation(
      async ({ page }: any) => {
        const idsByPage: Record<number, number[]> = {
          1: [1, 100, 101],
          2: [102, 103],
          3: [104],
          4: [105],
        };
        return { results: (idsByPage[page] ?? []).map((id) => ({ id })) };
      },
    );

    (tmdbClient.getExtendedMovieDetails as any).mockImplementation(
      async (id: number) => makeMovieDetails(id),
    );

    (db as any).__setMockResults([
      [{ latestCreatedAt: null }],
      [],
      [{ tmdbId: 1, contentType: "movie" }],
      [
        {
          tmdbId: 1,
          contentType: "movie",
          genreIds: [10],
          keywordIds: [],
          castIds: [],
        },
      ],
    ]);

    const res = await getListRecommendations(userId, listId);

    expect(tmdbClient.discoverTVShows).not.toHaveBeenCalled();
    expect(tmdbClient.getExtendedMovieDetails).toHaveBeenCalledTimes(6);
    expect(tmdbClient.getExtendedMovieDetails).toHaveBeenCalledWith(100);
    expect(tmdbClient.getExtendedMovieDetails).toHaveBeenCalledWith(105);

    const inserts = (db as any).__getInsertCalls();
    const tmdbUpserts = inserts.filter((c: any) => c.table === tmdbCache);
    expect(tmdbUpserts).toHaveLength(6);

    const cacheInsert = inserts.find(
      (c: any) => c.table === listRecommendationsCache,
    );
    expect(cacheInsert.payload.recommendations).toHaveLength(6);
    expect(cacheInsert.payload.recommendations).not.toContainEqual({
      tmdbId: 1,
      contentType: "movie",
    });

    expect(res).toHaveLength(6);
    expect(res[0]).toEqual(
      expect.objectContaining({
        tmdbId: expect.any(Number),
        contentType: "movie",
        title: expect.stringMatching(/^movie-/),
      }),
    );
  });

  it("deduplicates discovered results across pages and mixed content types", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.MIXED });

    (tmdbClient.discoverMovies as any).mockImplementation(
      async ({ page }: any) => {
        const idsByPage: Record<number, number[]> = {
          1: [100, 100, 101],
          2: [101],
          3: [100],
          4: [],
        };
        return { results: (idsByPage[page] ?? []).map((id) => ({ id })) };
      },
    );

    (tmdbClient.discoverTVShows as any).mockImplementation(
      async ({ page }: any) => {
        const idsByPage: Record<number, number[]> = {
          1: [200, 200, 201],
          2: [201],
          3: [200],
          4: [],
        };
        return { results: (idsByPage[page] ?? []).map((id) => ({ id })) };
      },
    );

    (tmdbClient.getExtendedMovieDetails as any).mockImplementation(
      async (id: number) => makeMovieDetails(id),
    );
    (tmdbClient.getExtendedTVShowDetails as any).mockImplementation(
      async (id: number) => makeTVDetails(id),
    );

    (db as any).__setMockResults([
      [{ latestCreatedAt: null }],
      [],
      [
        { tmdbId: 1, contentType: "movie" },
        { tmdbId: 2, contentType: "tv" },
      ],
      [
        {
          tmdbId: 1,
          contentType: "movie",
          genreIds: [10],
          keywordIds: [],
          castIds: [],
        },
        {
          tmdbId: 2,
          contentType: "tv",
          genreIds: [20],
          keywordIds: [700],
          castIds: [],
        },
      ],
    ]);

    const res = await getListRecommendations(userId, listId);

    expect(tmdbClient.getExtendedMovieDetails).toHaveBeenCalledTimes(2);
    expect(tmdbClient.getExtendedMovieDetails).toHaveBeenCalledWith(100);
    expect(tmdbClient.getExtendedMovieDetails).toHaveBeenCalledWith(101);

    expect(tmdbClient.getExtendedTVShowDetails).toHaveBeenCalledTimes(2);
    expect(tmdbClient.getExtendedTVShowDetails).toHaveBeenCalledWith(200);
    expect(tmdbClient.getExtendedTVShowDetails).toHaveBeenCalledWith(201);

    const inserts = (db as any).__getInsertCalls();
    const tmdbUpserts = inserts.filter((c: any) => c.table === tmdbCache);
    expect(tmdbUpserts).toHaveLength(4);

    const cacheInsert = inserts.find(
      (c: any) => c.table === listRecommendationsCache,
    );
    expect(cacheInsert.payload.recommendations).toHaveLength(4);

    expect(res).toHaveLength(4);
    expect(
      new Set((res as TMDBContent[]).map((r: any) => r.contentType)),
    ).toEqual(new Set(["movie", "tv"]));
  });

  it("writes an empty cache when list type is tv but there are no genre/keyword tallies", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.TV });

    (db as any).__setMockResults([
      [{ latestCreatedAt: null }],
      [],
      [{ tmdbId: 1, contentType: "tv" }],
      [],
    ]);

    const res = await getListRecommendations(userId, listId);
    expect(res).toEqual([]);
    expect(tmdbClient.discoverTVShows).not.toHaveBeenCalled();

    const inserts = (db as any).__getInsertCalls();
    const cacheInsert = inserts.find(
      (c: any) => c.table === listRecommendationsCache,
    );
    expect(cacheInsert.payload.recommendations).toEqual([]);
  });

  it("uses TV discovery and TV details when list type is tv", async () => {
    (getList as any).mockResolvedValue({ listType: ListType.TV });

    (tmdbClient.discoverTVShows as any).mockImplementation(
      async ({ page }: any) => {
        const idsByPage: Record<number, number[]> = {
          1: [200, 201],
          2: [202, 203],
          3: [204, 205],
          4: [206],
        };
        return { results: (idsByPage[page] ?? []).map((id) => ({ id })) };
      },
    );

    (tmdbClient.getExtendedTVShowDetails as any).mockImplementation(
      async (id: number) => makeTVDetails(id),
    );

    (db as any).__setMockResults([
      [{ latestCreatedAt: null }],
      [],
      [{ tmdbId: 1, contentType: "tv" }],
      [
        {
          tmdbId: 1,
          contentType: "tv",
          genreIds: [20],
          keywordIds: [],
          castIds: [],
        },
      ],
    ]);

    const res = await getListRecommendations(userId, listId);

    expect(tmdbClient.discoverMovies).not.toHaveBeenCalled();
    expect(tmdbClient.getExtendedTVShowDetails).toHaveBeenCalled();
    expect(res).toHaveLength(7);
    expect(res[0]).toEqual(
      expect.objectContaining({
        contentType: "tv",
        title: expect.stringMatching(/^tv-/),
      }),
    );
  });
});
