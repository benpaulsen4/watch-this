import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock shape mirrors src/lib/activity/service.test.ts. Keep them in step --
// later tasks append to this file and its queue order must track query order.
//
// Every select starts a query record, and the chain methods fill it in, so a
// test can assert which tables a query read, joined and filtered on. That is
// how the consent boundary is pinned: a refactor that drops the `users` join
// or the `share_stats_with_collaborators` filter fails a test here.
vi.mock("../db", () => {
  const resultsQueue: unknown[] = [];
  const queries: Array<{
    from: unknown;
    joins: Array<{ type: "left" | "inner"; table: unknown }>;
    where: unknown;
  }> = [];
  const current = () => queries[queries.length - 1];
  const startQuery = () => {
    queries.push({ from: undefined, joins: [], where: undefined });
    return chain;
  };

  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: (table: unknown) => {
      const query = current();
      if (query) query.from = table;
      return chain;
    },
    innerJoin: (table: unknown) => {
      current()?.joins.push({ type: "inner", table });
      return chain;
    },
    leftJoin: (table: unknown) => {
      current()?.joins.push({ type: "left", table });
      return chain;
    },
    where: (condition: unknown) => {
      const query = current();
      if (query) query.where = condition;
      return chain;
    },
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
    select: vi.fn(startQuery),
    selectDistinct: vi.fn(startQuery),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    __setResults: (rows: unknown[]) => {
      resultsQueue.length = 0;
      resultsQueue.push(...rows);
      queries.length = 0;
    },
    __getQueries: () => queries.slice(),
  };

  // `./runtime` imports its tables and `ContentType` from `../db` rather than
  // `../db/schema`; a factory mock that omits an export throws when it is
  // touched.
  return {
    db,
    ContentType: { MOVIE: "movie", TV: "tv" },
    tmdbCache: {},
    tmdbEpisodeRuntime: {},
    tmdbSeasonFetch: {},
  };
});

vi.mock("../db/schema", () => ({
  episodeWatchStatus: {},
  userContentStatus: {},
  tmdbCache: {},
  // Column sentinels, so the consent tests can find the filter by identity.
  users: {
    id: { column: "users.id" },
    username: { column: "users.username" },
    shareStatsWithCollaborators: { column: "users.share_stats_with_collaborators" },
  },
  lists: {},
  listItems: {},
  listCollaborators: {},
  seriesFinale: {},
  ContentType: { MOVIE: "movie", TV: "tv" },
}));

const getMovieGenres = vi.fn().mockResolvedValue({ genres: [] });
const getTVGenres = vi.fn().mockResolvedValue({ genres: [] });
vi.mock("../tmdb/client", () => ({
  isTMDBHttpError: () => false,
  tmdbClient: {
    getMovieGenres: () => getMovieGenres(),
    getTVGenres: () => getTVGenres(),
    getTVSeasonDetails: vi.fn(),
    getMovieDetails: vi.fn(),
  },
}));

import { db } from "../db";
import { listCollaborators, lists, users } from "../db/schema";
import { calendarYearPeriod } from "./periods";
import {
  buildCompare,
  clearGenreNameCache,
  CREW_LIMIT,
  loadCollaboratorIds,
  loadCollaboratorSlices,
  loadGenreNames,
  loadUserRows,
} from "./service";
import type { ComparePeer, TitleMeta } from "./types";

const setResults = (rows: unknown[]) =>
  (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults(rows);

interface RecordedQuery {
  from: unknown;
  joins: Array<{ type: "left" | "inner"; table: unknown }>;
  where: unknown;
}

const getQueries = () =>
  (db as unknown as { __getQueries: () => RecordedQuery[] }).__getQueries();

/**
 * Whether `target` is reachable anywhere inside `node` -- used to find a
 * column sentinel inside a drizzle `where` expression without depending on
 * how drizzle nests its SQL chunks.
 */
function references(node: unknown, target: unknown, seen = new WeakSet<object>()): boolean {
  if (node === target) return true;
  if (typeof node !== "object" || node === null) return false;
  if (seen.has(node)) return false;
  seen.add(node);

  return Object.values(node).some((value) => references(value, target, seen));
}

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

describe("CREW_LIMIT", () => {
  it("caps the leaderboard so a user on many shared lists cannot fan out unbounded", () => {
    expect(CREW_LIMIT).toBe(8);
  });
});

describe("buildCompare", () => {
  const period = calendarYearPeriod(2026);

  const meta = (tmdbId: number, title: string): TitleMeta => ({
    tmdbId,
    contentType: "tv",
    title,
    posterPath: null,
    genreIds: [],
    popularity: 1,
    runtime: null,
  });

  const status = (tmdbId: number, value: string, updatedAt = "2026-02-01T00:00:00Z") => ({
    tmdbId,
    contentType: "tv" as const,
    status: value,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date(updatedAt),
  });

  const mine = {
    episodes: [],
    titles: new Map<string, TitleMeta>([
      ["tv:3", meta(3, "Severance")],
      ["tv:5", meta(5, "Slow Horses")],
    ]),
    genreNames: new Map(),
    statuses: [
      status(1, "completed"),
      status(2, "completed"),
      status(3, "dropped"),
      status(4, "dropped"),
      status(5, "planning", "2020-01-01T00:00:00Z"),
      status(6, "planning"),
    ],
  };

  const peer = (overrides: Partial<ComparePeer> = {}): ComparePeer => ({
    userId: "u2",
    username: "ana",
    completedKeys: [],
    planningKeys: [],
    droppedKeys: [],
    ...overrides,
  });

  it("counts the three-way split of completed titles", () => {
    const result = buildCompare(
      mine,
      [peer({ completedKeys: ["tv:2", "tv:9"] })],
      period,
    );

    expect(result[0]).toMatchObject({
      username: "ana",
      onlyYou: 1,
      both: 1,
      onlyThem: 1,
    });
  });

  it("names a title they finished and you dropped", () => {
    const result = buildCompare(
      mine,
      [peer({ completedKeys: ["tv:3"] })],
      period,
    );

    expect(result[0]?.theyFinishedYouDropped).toBe("Severance");
  });

  it("skips a match whose title cannot be resolved, taking the next in sorted order", () => {
    // tv:4 sorts first but has no title metadata; tv:3 does.
    const resolvable = buildCompare(
      mine,
      [peer({ completedKeys: ["tv:4", "tv:3"] })],
      period,
    );
    expect(resolvable[0]?.theyFinishedYouDropped).toBe("Severance");

    const unresolvable = buildCompare(
      mine,
      [peer({ completedKeys: ["tv:4"] })],
      period,
    );
    expect(unresolvable[0]?.theyFinishedYouDropped).toBeNull();
  });

  it("names a title both of you are planning, however long ago it was added", () => {
    const result = buildCompare(
      mine,
      [peer({ planningKeys: ["tv:6", "tv:5"] })],
      period,
    );

    // tv:6 matches too, but has no title; tv:5 was planned in 2020 and still counts.
    expect(result[0]?.bothPlanningNeitherStarted).toBe("Slow Horses");
  });

  it("leaves your completions outside the period out of the split", () => {
    const result = buildCompare(
      { ...mine, statuses: [status(1, "completed", "2025-06-01T00:00:00Z")] },
      [peer({ completedKeys: ["tv:1"] })],
      period,
    );

    expect(result[0]).toMatchObject({ onlyYou: 0, both: 0, onlyThem: 1 });
  });

  it("returns an empty list when there are no peers", () => {
    expect(buildCompare(mine, [], period)).toEqual([]);
  });
});

describe("loadCollaboratorIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sorts ids and caps them at CREW_LIMIT, excluding the viewer", async () => {
    const ids = ["u9", "u3", "u10", "u1", "u7", "u5", "u2", "u8", "u6", "u4"];
    setResults([
      [{ listId: "l1" }],
      [{ userId: "viewer" }, ...ids.slice(0, 5).map((userId) => ({ userId }))],
      ids.slice(5).map((userId) => ({ userId })),
    ]);

    const result = await loadCollaboratorIds("viewer");

    expect(result).toEqual([...ids].sort().slice(0, CREW_LIMIT));
    expect(result).not.toContain("viewer");
  });

  it("joins users and filters on consent in every query that yields a collaborator id", async () => {
    setResults([[{ listId: "l1" }], [{ userId: "u2" }], [{ userId: "u3" }]]);

    await loadCollaboratorIds("viewer");

    const [, owners, collaborators] = getQueries();
    expect(owners?.from).toBe(lists);
    expect(collaborators?.from).toBe(listCollaborators);
    for (const query of [owners, collaborators]) {
      expect(query?.joins).toContainEqual({ type: "inner", table: users });
      expect(references(query?.where, users.shareStatsWithCollaborators)).toBe(true);
    }
  });
});

describe("loadCollaboratorSlices", () => {
  const period = calendarYearPeriod(2026);

  const episode = (tmdbId: number, episodeNumber: number) => ({
    tmdbId,
    seasonNumber: 1,
    episodeNumber,
    watchedAt: new Date("2026-03-14T20:00:00Z"),
  });

  const runtime = (tmdbId: number, episodeNumber: number, minutes: number) => ({
    tmdbId,
    seasonNumber: 1,
    episodeNumber,
    runtime: minutes,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getMovieGenres.mockResolvedValue({ genres: [] });
    getTVGenres.mockResolvedValue({ genres: [] });
    clearGenreNameCache();
  });

  it("returns empty slices without any per-collaborator query when the viewer shares no lists", async () => {
    setResults([[]]);

    const result = await loadCollaboratorSlices("viewer", period);

    expect(result).toEqual({ crew: [], peers: [] });
    expect(db.selectDistinct).toHaveBeenCalledTimes(1);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns empty slices without any per-collaborator query when no collaborator consents", async () => {
    // Lists exist, but the consent-filtered id queries return only the viewer.
    setResults([[{ listId: "l1" }], [{ userId: "viewer" }], []]);

    const result = await loadCollaboratorSlices("viewer", period);

    expect(result).toEqual({ crew: [], peers: [] });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("reads usernames in one consent-filtered query and skips anyone it does not return", async () => {
    setResults([
      [{ listId: "l1" }],
      [{ userId: "u2" }],
      [{ userId: "u3" }],
      // usernames: u3 withdrew between the id query and this one
      [{ id: "u2", username: "ana" }],
      // u2: episodes, statuses (none, so no titles query)
      [],
      [],
    ]);

    const result = await loadCollaboratorSlices("viewer", period);

    expect(result.crew.map((member) => member.userId)).toEqual(["u2"]);
    expect(result.peers.map((peer) => peer.userId)).toEqual(["u2"]);
    // One username query plus u2's two row queries. Nothing ran for u3.
    expect(db.select).toHaveBeenCalledTimes(3);

    const names = getQueries()[3];
    expect(names?.from).toBe(users);
    expect(references(names?.where, users.shareStatsWithCollaborators)).toBe(true);
  });

  it("scopes a peer's completed and dropped keys to the window but keeps planning unscoped", async () => {
    setResults([
      [{ listId: "l1" }],
      [{ userId: "u2" }],
      [],
      [{ id: "u2", username: "ana" }],
      [],
      [
        { tmdbId: 1, contentType: "tv", status: "completed", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-05-01T00:00:00Z") },
        { tmdbId: 2, contentType: "movie", status: "completed", createdAt: new Date("2024-01-01T00:00:00Z"), updatedAt: new Date("2025-12-31T23:59:59Z") },
        { tmdbId: 3, contentType: "tv", status: "dropped", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-06-01T00:00:00Z") },
        { tmdbId: 4, contentType: "tv", status: "dropped", createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2027-01-01T00:00:00Z") },
        { tmdbId: 5, contentType: "movie", status: "planning", createdAt: new Date("2020-01-01T00:00:00Z"), updatedAt: new Date("2020-01-01T00:00:00Z") },
      ],
      // titles
      [],
    ]);

    const { peers } = await loadCollaboratorSlices("viewer", period);

    expect(peers).toEqual([
      {
        userId: "u2",
        username: "ana",
        completedKeys: ["tv:1"],
        planningKeys: ["movie:5"],
        droppedKeys: ["tv:3"],
      },
    ]);
  });

  it.each([
    ["the higher id first", [20, 20, 10, 10]],
    ["the lower id first", [10, 10, 20, 20]],
  ])("breaks a top-show tie toward the lower tmdbId with %s", async (_label, ids) => {
    const episodes = ids.map((tmdbId, index) => episode(tmdbId, index + 1));
    setResults([
      [{ listId: "l1" }],
      [{ userId: "u2" }],
      [],
      [{ id: "u2", username: "ana" }],
      episodes,
      [],
      // titles
      [],
      // episode runtimes
      [],
    ]);

    const { crew } = await loadCollaboratorSlices("viewer", period);

    expect(crew[0]?.topShowTmdbId).toBe(10);
  });

  it("totals hours from the runtime cache and orders by episodes, then username", async () => {
    setResults([
      [{ listId: "l1" }],
      [{ userId: "u2" }, { userId: "u3" }, { userId: "u4" }],
      [],
      [
        { id: "u2", username: "zed" },
        { id: "u3", username: "ana" },
        { id: "u4", username: "bo" },
      ],
      // u2 (zed): four 45-minute episodes
      [episode(1, 1), episode(1, 2), episode(1, 3), episode(1, 4)],
      [],
      [],
      [runtime(1, 1, 45), runtime(1, 2, 45), runtime(1, 3, 45), runtime(1, 4, 45)],
      // u3 (ana): four episodes, runtimes unknown
      [episode(2, 1), episode(2, 2), episode(2, 3), episode(2, 4)],
      [],
      [],
      [],
      // u4 (bo): one episode
      [episode(3, 1)],
      [],
      [],
      [],
    ]);

    const { crew } = await loadCollaboratorSlices("viewer", period);

    expect(crew.map((member) => member.username)).toEqual(["ana", "zed", "bo"]);
    expect(crew.find((member) => member.username === "zed")).toMatchObject({
      episodes: 4,
      hours: 3,
      topShowTmdbId: 1,
    });
    expect(crew.find((member) => member.username === "ana")?.hours).toBe(0);
  });
});
