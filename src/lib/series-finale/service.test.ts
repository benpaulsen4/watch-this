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
  const inserted: unknown[] = [];
  const conflicts: unknown[] = [];
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
    values: (row: unknown) => {
      inserted.push(row);
      return chain;
    },
    onConflictDoUpdate: (config: unknown) => {
      conflicts.push(config);
      return chain;
    },
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
      inserted.length = 0;
      conflicts.length = 0;
    },
    __getQueries: () => queries.slice(),
    __getInserted: () => inserted.slice(),
    __getConflicts: () => conflicts.slice(),
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
  lists: { ownerId: { column: "lists.owner_id" } },
  listItems: {},
  listCollaborators: { userId: { column: "list_collaborators.user_id" } },
  // Column sentinels, so the upsert test can check its conflict target by
  // identity.
  seriesFinale: {
    userId: { column: "series_finale.user_id" },
    periodStart: { column: "series_finale.period_start" },
    periodEnd: { column: "series_finale.period_end" },
    periodLabel: { column: "series_finale.period_label" },
    payload: { column: "series_finale.payload" },
    schemaVersion: { column: "series_finale.schema_version" },
    generatedAt: { column: "series_finale.generated_at" },
    dismissedAt: { column: "series_finale.dismissed_at" },
  },
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

import { db, tmdbSeasonFetch } from "../db";
import { listCollaborators, lists, seriesFinale, users } from "../db/schema";
import { tmdbClient } from "../tmdb/client";
import { buildPayload } from "./aggregate";
import { calendarYearPeriod } from "./periods";
import {
  alsoTopForOf,
  buildCompare,
  clearGenreNameCache,
  CREW_LIMIT,
  getOrGenerateSnapshot,
  LIST_GENERATION_BUDGET_MS,
  listAvailableSnapshots,
  listSnapshots,
  loadCohortMinutes,
  loadCollaborativeTitleKeys,
  loadCollaboratorIds,
  loadCollaboratorSlices,
  loadFirstActivity,
  loadGenreNames,
  loadUserRows,
  PERCENTILE_COHORT_MINIMUM,
  PERCENTILE_LENGTH_TOLERANCE,
  percentileOf,
} from "./service";
import {
  type ComparePeer,
  type CrewMemberTotals,
  SERIES_FINALE_SCHEMA_VERSION,
  type SeriesFinalePayload,
  type TitleMeta,
} from "./types";

const setResults = (rows: unknown[]) =>
  (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults(rows);

interface RecordedQuery {
  from: unknown;
  joins: Array<{ type: "left" | "inner"; table: unknown }>;
  where: unknown;
}

const getQueries = () =>
  (db as unknown as { __getQueries: () => RecordedQuery[] }).__getQueries();

const getInserted = () =>
  (db as unknown as { __getInserted: () => unknown[] }).__getInserted();

const getConflicts = () =>
  (db as unknown as { __getConflicts: () => unknown[] }).__getConflicts();

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

  it("orders rows by titles in common, most first, then by username", () => {
    const result = buildCompare(
      mine,
      [
        peer({ userId: "u2", username: "zed", completedKeys: ["tv:1"] }),
        peer({ userId: "u3", username: "bo", completedKeys: [] }),
        peer({ userId: "u4", username: "ana", completedKeys: ["tv:1"] }),
        peer({ userId: "u5", username: "cy", completedKeys: ["tv:1", "tv:2"] }),
      ],
      period,
    );

    expect(result.map((row) => [row.username, row.both])).toEqual([
      ["cy", 2],
      ["ana", 1],
      ["zed", 1],
      ["bo", 0],
    ]);
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

describe("percentileOf", () => {
  const cohort = Array.from({ length: 20 }, (_, i) => i * 100);

  it("returns null below the cohort minimum", () => {
    expect(percentileOf(500, [1, 2, 3])).toBeNull();
  });

  it("puts a top scorer in a low percentile number", () => {
    expect(percentileOf(10_000, cohort)).toBe(1);
  });

  it("puts a bottom scorer in a high percentile number", () => {
    expect(percentileOf(0, cohort)).toBeGreaterThan(90);
  });

  it("uses exactly the cohort minimum as the floor", () => {
    expect(PERCENTILE_COHORT_MINIMUM).toBe(10);
    expect(percentileOf(500, Array.from({ length: 10 }, () => 100))).not.toBeNull();
    expect(percentileOf(500, Array.from({ length: 9 }, () => 100))).toBeNull();
  });

  it("uses a 10% length tolerance for cohort membership", () => {
    expect(PERCENTILE_LENGTH_TOLERANCE).toBe(0.1);
  });
});

describe("loadCohortMinutes", () => {
  const period = calendarYearPeriod(2026);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The mocked db chain hands back whatever rows a test queues, so it can't
  // exercise the SQL itself -- the jsonb extraction, the schemaVersion
  // filter, or the own-snapshot exclusion clause. What it can honestly test
  // is the code that runs on the rows the query returns: the length-based
  // cohort filter and the null-minutes drop.

  it("keeps a row within the 10% length tolerance and drops one outside it", async () => {
    setResults([
      [
        // Same length as the target period: within tolerance.
        { minutes: 100, periodStart: period.start, periodEnd: period.end },
        // A 30-day period against a ~365-day target: well outside tolerance.
        {
          minutes: 200,
          periodStart: period.start,
          periodEnd: new Date(
            period.start.getTime() + 30 * 24 * 60 * 60 * 1000,
          ),
        },
      ],
    ]);

    const result = await loadCohortMinutes(period, "viewer");

    expect(result).toEqual([100]);
  });

  it("drops a row with null minutes", async () => {
    setResults([
      [
        { minutes: null, periodStart: period.start, periodEnd: period.end },
        { minutes: 150, periodStart: period.start, periodEnd: period.end },
      ],
    ]);

    const result = await loadCohortMinutes(period, "viewer");

    expect(result).toEqual([150]);
  });

  it("keeps thin snapshots out of the cohort, alongside the existing conditions", async () => {
    setResults([[]]);

    await loadCohortMinutes(period, "viewer");

    // The mock cannot run SQL, so this pins the clause's presence: the where
    // reads the payload's `thin` flag, which only the thin exclusion does.
    const [query] = getQueries();
    expect(query?.from).toBe(seriesFinale);
    expect(references(query?.where, seriesFinale.payload)).toBe(true);
    expect(containsText(query?.where, "->>'thin' IS DISTINCT FROM 'true'")).toBe(true);
    expect(references(query?.where, seriesFinale.schemaVersion)).toBe(true);
    expect(bindsColumnTo(query?.where, seriesFinale.userId, "viewer")).toBe(true);
  });

  it("returns plain numbers in row order", async () => {
    setResults([
      [
        { minutes: 300, periodStart: period.start, periodEnd: period.end },
        { minutes: 100, periodStart: period.start, periodEnd: period.end },
        { minutes: 200, periodStart: period.start, periodEnd: period.end },
      ],
    ]);

    const result = await loadCohortMinutes(period, "viewer");

    expect(result).toEqual([300, 100, 200]);
  });
});

/** Whether any raw SQL text inside a drizzle expression contains `text`. */
function containsText(
  node: unknown,
  text: string,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof node === "string") return node.includes(text);
  if (typeof node !== "object" || node === null) return false;
  if (seen.has(node)) return false;
  seen.add(node);

  return Object.values(node).some((value) => containsText(value, text, seen));
}

/**
 * Whether a drizzle expression carries a bound parameter at exactly this
 * instant. Used to tell which period -- the canonical one or the user's local
 * window -- reached a given query.
 */
function containsInstant(
  node: unknown,
  iso: string,
  seen = new WeakSet<object>(),
): boolean {
  if (node instanceof Date) return node.toISOString() === iso;
  if (typeof node !== "object" || node === null) return false;
  if (seen.has(node)) return false;
  seen.add(node);

  return Object.values(node).some((value) => containsInstant(value, iso, seen));
}

/**
 * Whether some comparison inside a drizzle expression puts `column` and the
 * bound value `value` side by side -- i.e. filters that column on that value,
 * rather than merely mentioning the column somewhere.
 */
function bindsColumnTo(
  node: unknown,
  column: unknown,
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (typeof node !== "object" || node === null) return false;
  if (seen.has(node)) return false;
  seen.add(node);

  const chunks = (node as { queryChunks?: unknown }).queryChunks;
  if (
    Array.isArray(chunks) &&
    chunks.includes(column) &&
    // drizzle binds a value against a real column as a `Param`; against the
    // plain-object sentinels this file mocks columns with, it leaves it raw.
    chunks.some(
      (chunk) =>
        chunk === value ||
        (typeof chunk === "object" &&
          chunk !== null &&
          (chunk as { value?: unknown }).value === value),
    )
  ) {
    return true;
  }

  return Object.values(node).some((child) =>
    bindsColumnTo(child, column, value, seen),
  );
}

/** A well-formed current-version payload with nothing in it. */
function emptyPayload(): SeriesFinalePayload {
  return buildPayload(
    {
      period: calendarYearPeriod(2026),
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
    },
    new Date("2027-02-01T00:00:00Z"),
  );
}

describe("alsoTopForOf", () => {
  const member = (
    userId: string,
    username: string,
    topShowTmdbId: number | null,
  ): CrewMemberTotals => ({ userId, username, episodes: 10, hours: 5, topShowTmdbId });

  it("names only crew members whose top show matches, in crew order", () => {
    const crew = [
      member("u1", "ana", 1),
      member("u2", "marcus", 2),
      member("u3", "bo", 1),
      member("u4", "cy", null),
    ];

    expect(alsoTopForOf(crew, 1)).toEqual(["ana", "bo"]);
  });

  it("names nobody when the viewer has no top show, even crew who have none either", () => {
    expect(alsoTopForOf([member("u4", "cy", null)], null)).toEqual([]);
  });
});

describe("loadFirstActivity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the earlier of the first watched episode and the first status row", async () => {
    setResults([
      [{ first: new Date("2024-05-01T00:00:00Z") }],
      [{ first: new Date("2023-02-01T00:00:00Z") }],
    ]);

    expect(await loadFirstActivity("viewer")).toEqual(
      new Date("2023-02-01T00:00:00Z"),
    );
  });

  it("uses whichever source has activity when the other has none", async () => {
    setResults([[{ first: new Date("2024-05-01T00:00:00Z") }], [{ first: null }]]);

    expect(await loadFirstActivity("viewer")).toEqual(
      new Date("2024-05-01T00:00:00Z"),
    );
  });

  it("returns null for a user with no activity at all", async () => {
    setResults([[{ first: null }], [{ first: null }]]);

    expect(await loadFirstActivity("viewer")).toBeNull();
  });
});

describe("loadCollaborativeTitleKeys", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keys titles on shared lists the user owns or has joined", async () => {
    setResults([
      [
        { tmdbId: 1, contentType: "tv" },
        { tmdbId: 2, contentType: "movie" },
      ],
    ]);

    const keys = await loadCollaborativeTitleKeys("viewer");

    expect(keys).toEqual(new Set(["tv:1", "movie:2"]));

    const [query] = getQueries();
    expect(query?.joins).toContainEqual({ type: "inner", table: lists });
    expect(query?.joins).toContainEqual({ type: "inner", table: listCollaborators });
    // Both directions of membership: a list the user owns, and one they were
    // invited onto. Owner-only would count a joined list's titles as solo.
    expect(bindsColumnTo(query?.where, lists.ownerId, "viewer")).toBe(true);
    expect(bindsColumnTo(query?.where, listCollaborators.userId, "viewer")).toBe(true);
  });
});

// Through the gated entry point: the generator itself is not exported.
describe("snapshot generation", () => {
  const period = calendarYearPeriod(2026);
  const now = new Date("2027-02-01T00:00:00Z");

  const episode = (tmdbId: number, episodeNumber: number) => ({
    tmdbId,
    seasonNumber: 1,
    episodeNumber,
    watchedAt: new Date("2026-03-14T20:00:00Z"),
  });

  const status = (
    tmdbId: number,
    contentType: "movie" | "tv",
    updatedAt: string,
  ) => ({
    tmdbId,
    contentType,
    status: "completed",
    createdAt: new Date("2025-01-01T00:00:00Z"),
    updatedAt: new Date(updatedAt),
  });

  const title = (
    tmdbId: number,
    contentType: "movie" | "tv",
    name: string,
  ) => ({
    tmdbId,
    contentType,
    title: name,
    posterPath: null,
    genreIds: [],
    popularity: "10",
    runtime: null,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getMovieGenres.mockResolvedValue({ genres: [] });
    getTVGenres.mockResolvedValue({ genres: [] });
    clearGenreNameCache();
  });

  it("fills alsoTopFor, compare and the percentile from other users' data, then freezes it", async () => {
    setResults([
      // no stored row
      [],
      // zone, then first activity (episodes, statuses)
      [{ timezone: "America/Los_Angeles" }],
      [{ first: new Date("2025-06-01T00:00:00Z") }],
      [{ first: null }],
      // viewer: episodes, statuses, titles
      [episode(1, 1), episode(1, 2)],
      [
        status(1, "tv", "2026-03-15T00:00:00Z"),
        status(9, "movie", "2026-06-01T00:00:00Z"),
        // Inside the canonical UTC year, but still New Year's Eve 2025 in Los
        // Angeles: outside the window, so no film minutes and no compare key.
        status(10, "movie", "2026-01-01T03:00:00Z"),
      ],
      [title(1, "tv", "Severance"), title(9, "movie", "Arrival"), title(10, "movie", "Heat")],
      // episode runtimes: every watched episode is cached, so no season fetch
      [
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 1, runtime: 50 },
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 2, runtime: 50 },
      ],
      // film runtimes
      [{ tmdbId: 9, runtime: 120 }],
      // collaborators: list ids, owners, collaborators, usernames
      [{ listId: "l1" }],
      [{ userId: "u2" }],
      [{ userId: "u3" }],
      [
        { id: "u2", username: "ana" },
        { id: "u3", username: "bo" },
      ],
      // u2: episodes, statuses, titles, runtimes
      [episode(1, 1)],
      [status(1, "tv", "2026-04-01T00:00:00Z")],
      [],
      [],
      // u3: episodes, statuses, titles, runtimes
      [episode(2, 1)],
      [],
      [],
      [],
      // collaborative title keys
      [{ tmdbId: 1, contentType: "tv" }],
      // cohort
      Array.from({ length: 10 }, () => ({
        minutes: 100,
        periodStart: period.start,
        periodEnd: period.end,
      })),
    ]);

    const payload = await getOrGenerateSnapshot("viewer", period, now);
    if (payload === null) throw new Error("expected a generated payload");

    expect(payload.topShow?.tmdbId).toBe(1);
    expect(payload.topShow?.alsoTopFor).toEqual(["ana"]);
    expect(payload.crew.map((member) => member.username)).toEqual(["ana", "bo"]);
    expect(payload.compare).toEqual([
      {
        userId: "u2",
        username: "ana",
        onlyYou: 1,
        both: 1,
        onlyThem: 0,
        theyFinishedYouDropped: null,
        bothPlanningNeitherStarted: null,
      },
      {
        userId: "u3",
        username: "bo",
        onlyYou: 2,
        both: 0,
        onlyThem: 0,
        theyFinishedYouDropped: null,
        bothPlanningNeitherStarted: null,
      },
    ]);
    // 100 episode minutes plus the one in-window film. Had the out-of-window
    // film been looked up too, it would come back unknown.
    expect(payload.headline.minutes).toBe(220);
    expect(payload.headline.unknownRuntimeEpisodes).toBe(0);
    expect(payload.headline.percentile).toBe(1);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(getInserted()).toEqual([
      expect.objectContaining({ userId: "viewer", payload }),
    ]);
  });
});

describe("generation's runtime fetches", () => {
  const period = calendarYearPeriod(2026);
  const afterPeriod = new Date("2027-02-01T00:00:00Z");
  const getTVSeasonDetails = vi.mocked(tmdbClient.getTVSeasonDetails);

  const episode = (episodeNumber: number) => ({
    tmdbId: 1,
    seasonNumber: 1,
    episodeNumber,
    watchedAt: new Date("2026-03-14T20:00:00Z"),
  });
  const runtime = (episodeNumber: number, minutes: number | null) => ({
    tmdbId: 1,
    seasonNumber: 1,
    episodeNumber,
    runtime: minutes,
  });

  // Stored-row lookup (none), zone and account, first activity.
  const gate = () => [
    [],
    [{ timezone: "UTC" }],
    [{ first: new Date("2025-06-01T00:00:00Z") }],
    [{ first: null }],
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    getMovieGenres.mockResolvedValue({ genres: [] });
    getTVGenres.mockResolvedValue({ genres: [] });
    clearGenreNameCache();
  });

  it("asks TMDB nothing for a fully cached year, however old its season fetch records are", async () => {
    setResults([
      ...gate(),
      [episode(1), episode(2)],
      [], // statuses
      [], // titles
      // Both episodes have an entry -- one a known "TMDB has no runtime". Any
      // season fetch record for this season would be months old; it must not
      // even be read.
      [runtime(1, 50), runtime(2, null)],
      [], // collaborator list ids
      [], // collaborative title keys
      [], // cohort
    ]);

    const payload = await getOrGenerateSnapshot("viewer", period, afterPeriod);

    expect(payload?.headline.minutes).toBe(50);
    expect(getTVSeasonDetails).not.toHaveBeenCalled();
    expect(getQueries().some((query) => query.from === tmdbSeasonFetch)).toBe(false);
  });

  it("fetches only a season holding an uncached episode, then reloads runtimes", async () => {
    getTVSeasonDetails.mockResolvedValue({
      episodes: [
        { episode_number: 1, runtime: 50 },
        { episode_number: 2, runtime: 40 },
      ],
    } as Awaited<ReturnType<typeof tmdbClient.getTVSeasonDetails>>);

    setResults([
      ...gate(),
      [episode(1), episode(2)],
      [], // statuses
      [], // titles
      [runtime(1, 50)], // episode 2 has never been asked about
      [], // season fetch records: none
      [], // runtime insert (the mock's insert chain is awaited as a read)
      [], // season fetch insert, likewise
      [runtime(1, 50), runtime(2, 40)], // runtimes, reloaded
      [], // collaborator list ids
      [], // collaborative title keys
      [], // cohort
    ]);

    const payload = await getOrGenerateSnapshot("viewer", period, afterPeriod);

    expect(getTVSeasonDetails).toHaveBeenCalledTimes(1);
    expect(getTVSeasonDetails).toHaveBeenCalledWith(1, 1);
    expect(payload?.headline.minutes).toBe(90);
    expect(payload?.headline.unknownRuntimeEpisodes).toBe(0);
  });
});

describe("getOrGenerateSnapshot", () => {
  const period = calendarYearPeriod(2026);
  const afterPeriod = new Date("2027-02-01T00:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    getMovieGenres.mockResolvedValue({ genres: [] });
    getTVGenres.mockResolvedValue({ genres: [] });
    clearGenreNameCache();
  });

  it("returns a stored snapshot without regenerating or checking availability", async () => {
    const base = emptyPayload();
    const stored = { ...base, headline: { ...base.headline, hours: 412 } };
    setResults([[{ payload: stored, schemaVersion: SERIES_FINALE_SCHEMA_VERSION }]]);

    // `now` falls inside the period: a stored snapshot is already a fact.
    const payload = await getOrGenerateSnapshot(
      "viewer",
      period,
      new Date("2026-06-01T00:00:00Z"),
    );

    expect(payload?.headline.hours).toBe(412);
    expect(db.insert).not.toHaveBeenCalled();
    // No crew and no compare, so no consent query either.
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("regenerates a snapshot written against an older schema version", async () => {
    setResults([
      [{ payload: { schemaVersion: 0 }, schemaVersion: 0 }],
      [{ timezone: "UTC" }],
      // first activity: episodes, statuses
      [{ first: new Date("2025-06-01T00:00:00Z") }],
      [{ first: null }],
      [], // episodes
      [], // statuses
      [], // collaborator list ids
      [], // collaborative title keys
      [], // cohort
    ]);

    const payload = await getOrGenerateSnapshot("viewer", period, afterPeriod);

    expect(payload?.schemaVersion).toBe(SERIES_FINALE_SCHEMA_VERSION);
    expect(db.insert).toHaveBeenCalled();
  });

  it("returns null without generating for a year before the user's first activity", async () => {
    setResults([
      [],
      [{ timezone: "UTC" }],
      [{ first: new Date("2027-01-05T00:00:00Z") }],
      [{ first: null }],
    ]);

    const payload = await getOrGenerateSnapshot(
      "viewer",
      period,
      new Date("2027-03-01T00:00:00Z"),
    );

    expect(payload).toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("floors an importer's recaps at the year their account was created", async () => {
    // Imported history dated by air date reaches back to 1994; the account is
    // from 2025. 2024 would be available on first activity alone.
    const importer = () => [
      [],
      [{ timezone: "UTC", createdAt: new Date("2025-05-01T00:00:00Z") }],
      [{ first: new Date("1994-09-22T00:00:00Z") }],
      [{ first: null }],
    ];
    const after = new Date("2027-03-01T00:00:00Z");

    setResults(importer());
    expect(
      await getOrGenerateSnapshot("viewer", calendarYearPeriod(2024), after),
    ).toBeNull();
    expect(db.insert).not.toHaveBeenCalled();

    setResults([
      ...importer(),
      [], // episodes
      [], // statuses
      [], // collaborator list ids
      [], // collaborative title keys
      [], // cohort
    ]);
    expect(
      await getOrGenerateSnapshot("viewer", calendarYearPeriod(2025), after),
    ).not.toBeNull();
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("starts at the first watch when the account is older than any activity", async () => {
    setResults([
      [],
      [{ timezone: "UTC", createdAt: new Date("2020-01-10T00:00:00Z") }],
      [{ first: new Date("2025-03-01T00:00:00Z") }],
      [{ first: null }],
    ]);

    expect(
      await getOrGenerateSnapshot(
        "viewer",
        calendarYearPeriod(2024),
        new Date("2027-03-01T00:00:00Z"),
      ),
    ).toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns null without generating for a user with no activity", async () => {
    setResults([[], [{ timezone: "UTC" }], [{ first: null }], [{ first: null }]]);

    const payload = await getOrGenerateSnapshot("viewer", period, afterPeriod);

    expect(payload).toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns null until the year has ended in the user's own zone", async () => {
    setResults([
      [],
      [{ timezone: "America/Los_Angeles" }],
      [{ first: new Date("2025-06-01T00:00:00Z") }],
      [{ first: null }],
    ]);

    // Past midnight in UTC, still New Year's Eve in Los Angeles.
    const payload = await getOrGenerateSnapshot(
      "viewer",
      period,
      new Date("2027-01-01T03:00:00Z"),
    );

    expect(payload).toBeNull();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("aggregates over the user's local window but keys the row by the canonical period", async () => {
    setResults([
      [],
      [{ timezone: "America/Los_Angeles" }],
      [{ first: new Date("2025-06-01T00:00:00Z") }],
      [{ first: null }],
      [], // episodes
      [], // statuses
      [], // collaborator list ids
      [], // collaborative title keys
      [], // cohort
    ]);

    const payload = await getOrGenerateSnapshot("viewer", period, afterPeriod);

    expect(payload?.period).toEqual({
      start: "2026-01-01T08:00:00.000Z",
      end: "2027-01-01T08:00:00.000Z",
      label: "2026",
    });

    expect(getInserted()).toEqual([
      expect.objectContaining({
        userId: "viewer",
        periodStart: new Date("2026-01-01T00:00:00.000Z"),
        periodEnd: new Date("2027-01-01T00:00:00.000Z"),
        periodLabel: "2026",
        schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
        payload,
      }),
    ]);

    // Rows are selected by the local window; the cohort by the canonical year.
    const queries = getQueries();
    const episodesQuery = queries[4];
    const cohortQuery = queries[queries.length - 1];
    expect(containsInstant(episodesQuery?.where, "2026-01-01T08:00:00.000Z")).toBe(true);
    expect(containsInstant(episodesQuery?.where, "2026-01-01T00:00:00.000Z")).toBe(false);
    expect(containsInstant(cohortQuery?.where, "2026-01-01T00:00:00.000Z")).toBe(true);
    expect(containsInstant(cohortQuery?.where, "2026-01-01T08:00:00.000Z")).toBe(false);
  });

  it("upserts on the row's unique key, replacing the payload, schema version and generation time", async () => {
    setResults([
      [],
      [{ timezone: "UTC" }],
      [{ first: new Date("2025-06-01T00:00:00Z") }],
      [{ first: null }],
      [], // episodes
      [], // statuses
      [], // collaborator list ids
      [], // collaborative title keys
      [], // cohort
    ]);

    const payload = await getOrGenerateSnapshot("viewer", period, afterPeriod);

    // Without `payload` or `schemaVersion` in `set`, a regeneration would be a
    // silent no-op, and the list route would regenerate every stale year on
    // every load forever.
    const conflicts = getConflicts() as Array<{ target: unknown[]; set: unknown }>;
    expect(conflicts).toHaveLength(1);
    const [upsert] = conflicts;
    expect(upsert?.target).toHaveLength(3);
    expect(upsert?.target[0]).toBe(seriesFinale.userId);
    expect(upsert?.target[1]).toBe(seriesFinale.periodStart);
    expect(upsert?.target[2]).toBe(seriesFinale.periodEnd);
    expect(upsert?.set).toEqual({
      periodLabel: "2026",
      payload,
      schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
      generatedAt: afterPeriod,
    });
  });

  it("drops withdrawn or deleted collaborators from a stored snapshot and returns the rest as frozen", async () => {
    const base = emptyPayload();
    const ana: CrewMemberTotals = { userId: "a", username: "ana", episodes: 40, hours: 30, topShowTmdbId: 1 };
    const bo: CrewMemberTotals = { userId: "b", username: "bo", episodes: 20, hours: 15, topShowTmdbId: 1 };
    const compareRow = (userId: string, username: string) => ({
      userId,
      username,
      onlyYou: 3,
      both: 2,
      onlyThem: 1,
      theyFinishedYouDropped: null,
      bothPlanningNeitherStarted: null,
    });
    const stored: SeriesFinalePayload = {
      ...base,
      headline: { ...base.headline, hours: 412, minutes: 24_720, episodes: 900 },
      topShow: {
        tmdbId: 1,
        title: "Severance",
        posterPath: null,
        episodes: 19,
        minutes: 950,
        finishedAt: "2026-03-21",
        alsoTopFor: ["ana", "bo"],
      },
      crew: [ana, bo],
      compare: [compareRow("a", "ana"), compareRow("b", "bo")],
    };

    setResults([
      [{ payload: stored, schemaVersion: SERIES_FINALE_SCHEMA_VERSION }],
      // consent: only "a" still exists and still shares
      [{ id: "a" }],
    ]);

    const payload = await getOrGenerateSnapshot("viewer", period, afterPeriod);

    expect(payload).toEqual({
      ...stored,
      topShow: { ...stored.topShow, alsoTopFor: ["ana"] },
      crew: [ana],
      compare: [compareRow("a", "ana")],
    });
    expect(stored.crew).toHaveLength(2);
    expect(db.insert).not.toHaveBeenCalled();

    const consent = getQueries()[1];
    expect(consent?.from).toBe(users);
    expect(references(consent?.where, users.shareStatsWithCollaborators)).toBe(true);
  });
});

describe("listSnapshots", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns each period's label, dates and headline", async () => {
    const { headline } = emptyPayload();
    const generatedAt = new Date("2027-01-02T00:00:00Z");
    setResults([
      [{ periodLabel: "2026", generatedAt, dismissedAt: null, headline }],
    ]);

    expect(await listSnapshots("viewer")).toEqual([
      { label: "2026", generatedAt, dismissedAt: null, headline },
    ]);
  });

  it("selects only the headline out of each payload, never the whole payload", async () => {
    setResults([[]]);

    await listSnapshots("viewer");

    const selection = vi.mocked(db.select).mock.calls[0]?.[0] as
      | Record<string, unknown>
      | undefined;
    expect(Object.values(selection ?? {})).not.toContain(seriesFinale.payload);
    expect(references(selection?.headline, seriesFinale.payload)).toBe(true);
    expect(containsText(selection?.headline, "->'headline'")).toBe(true);
  });
});

describe("listAvailableSnapshots", () => {
  const now = new Date("2026-06-01T00:00:00Z");

  beforeEach(() => {
    vi.clearAllMocks();
    getMovieGenres.mockResolvedValue({ genres: [] });
    getTVGenres.mockResolvedValue({ genres: [] });
    clearGenreNameCache();
  });

  it("generates nothing and returns the listing when the user has no first activity", async () => {
    setResults([
      [{ timezone: "UTC" }],
      [{ first: null }],
      [{ first: null }],
      [],
    ]);

    const result = await listAvailableSnapshots("viewer", now);

    expect(result).toEqual([]);
    expect(db.insert).not.toHaveBeenCalled();
    // Zone, first-activity (x2) and the final listing -- no stored-rows query,
    // since there is nothing to compare it against.
    expect(db.select).toHaveBeenCalledTimes(4);
  });

  it("generates exactly the missing year when one of two available years is already current", async () => {
    const period2025 = calendarYearPeriod(2025);

    setResults([
      [{ timezone: "UTC" }],
      [{ first: new Date("2024-03-01T00:00:00Z") }],
      [{ first: null }],
      // stored rows: only 2025, at the current schema version
      [
        {
          periodStart: period2025.start,
          periodEnd: period2025.end,
          schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
        },
      ],
      // generation of the missing 2024 period
      [], // episodes
      [], // statuses
      [], // collaborator list ids
      [], // collaborative title keys
      [], // cohort
      // the mock db's `insert(...).onConflictDoUpdate(...)` chain is itself
      // thenable and shifts the queue when awaited, even though nothing reads
      // its result -- account for that phantom read here.
      [],
      // final listing
      [
        { periodLabel: "2025", generatedAt: now, dismissedAt: null, headline: emptyPayload().headline },
        { periodLabel: "2024", generatedAt: now, dismissedAt: null, headline: emptyPayload().headline },
      ],
    ]);

    const result = await listAvailableSnapshots("viewer", now);

    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(getInserted()[0]).toMatchObject({ periodLabel: "2024" });
    expect(result.map((row) => row.label)).toEqual(["2025", "2024"]);
  });

  it("regenerates a stored snapshot below the current schema version", async () => {
    const period2025 = calendarYearPeriod(2025);

    setResults([
      [{ timezone: "UTC" }],
      [{ first: new Date("2025-03-01T00:00:00Z") }],
      [{ first: null }],
      [{ periodStart: period2025.start, periodEnd: period2025.end, schemaVersion: 0 }],
      [], // episodes
      [], // statuses
      [], // collaborator list ids
      [], // collaborative title keys
      [], // cohort
      [], // phantom read from the insert chain's thenable, see note above
      [{ periodLabel: "2025", generatedAt: now, dismissedAt: null, headline: emptyPayload().headline }],
    ]);

    await listAvailableSnapshots("viewer", now);

    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  describe("per-request bounds", () => {
    const later = new Date("2027-03-01T00:00:00Z");

    // Zone, first activity in 2024, and no stored rows: 2026, 2025 and 2024
    // are all missing.
    const threeMissing = () => [
      [{ timezone: "UTC" }],
      [{ first: new Date("2024-03-01T00:00:00Z") }],
      [{ first: null }],
      [],
    ];
    // One empty generation: episodes, statuses, collaborator list ids,
    // collaborative title keys, cohort, and the insert chain's phantom read.
    const generation = () => [[], [], [], [], [], []];
    const listing = [
      { periodLabel: "2026", generatedAt: later, dismissedAt: null, headline: emptyPayload().headline },
    ];

    it("always generates the newest missing year, and stops there once the budget is spent", async () => {
      setResults([...threeMissing(), ...generation(), listing]);
      // Starts at 0, then reads past the budget at every later check.
      const clock = vi
        .fn<() => number>()
        .mockReturnValueOnce(0)
        .mockReturnValue(LIST_GENERATION_BUDGET_MS + 1);

      const result = await listAvailableSnapshots("viewer", later, clock);

      expect(LIST_GENERATION_BUDGET_MS).toBe(5000);
      expect(getInserted().map((row) => (row as { periodLabel: string }).periodLabel)).toEqual([
        "2026",
      ]);
      expect(result.map((row) => row.label)).toEqual(["2026"]);
    });

    it("generates every missing year, newest first, while the budget lasts", async () => {
      setResults([
        ...threeMissing(),
        ...generation(),
        ...generation(),
        ...generation(),
        listing,
      ]);

      await listAvailableSnapshots("viewer", later, () => 0);

      expect(getInserted().map((row) => (row as { periodLabel: string }).periodLabel)).toEqual([
        "2026",
        "2025",
        "2024",
      ]);
    });

    it("shares one run between concurrent calls for the same user", async () => {
      setResults([
        [{ timezone: "UTC" }],
        [{ first: new Date("2026-03-01T00:00:00Z") }],
        [{ first: null }],
        [],
        ...generation(),
        listing,
      ]);

      const first = listAvailableSnapshots("viewer", later, () => 0);
      const second = listAvailableSnapshots("viewer", later, () => 0);

      expect(second).toBe(first);
      const [a, b] = await Promise.all([first, second]);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(a).toEqual(b);
      expect(a.map((row) => row.label)).toEqual(["2026"]);
    });

    it("does not hand a failed run to the next call", async () => {
      vi.mocked(db.select).mockImplementationOnce(() => {
        throw new Error("db down");
      });
      await expect(listAvailableSnapshots("viewer", later, () => 0)).rejects.toThrow(
        "db down",
      );

      setResults([
        [{ timezone: "UTC" }],
        [{ first: null }],
        [{ first: null }],
        listing,
      ]);
      const result = await listAvailableSnapshots("viewer", later, () => 0);

      expect(result.map((row) => row.label)).toEqual(["2026"]);
    });
  });

  it("lists an importer's years only from their account's creation onward", async () => {
    const period2025 = calendarYearPeriod(2025);
    const period2026 = calendarYearPeriod(2026);
    const current = (period: typeof period2025) => ({
      periodStart: period.start,
      periodEnd: period.end,
      schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
    });

    setResults([
      [{ timezone: "UTC", createdAt: new Date("2025-05-01T00:00:00Z") }],
      [{ first: new Date("1994-09-22T00:00:00Z") }],
      [{ first: null }],
      // Both years since the account was created are already current, so
      // nothing is missing -- unless 1994-2024 were offered too.
      [current(period2026), current(period2025)],
      [
        { periodLabel: "2026", generatedAt: now, dismissedAt: null, headline: emptyPayload().headline },
        { periodLabel: "2025", generatedAt: now, dismissedAt: null, headline: emptyPayload().headline },
      ],
    ]);

    const result = await listAvailableSnapshots(
      "viewer",
      new Date("2027-03-01T00:00:00Z"),
    );

    expect(db.insert).not.toHaveBeenCalled();
    expect(result.map((row) => row.label)).toEqual(["2026", "2025"]);
  });

  it("does not regenerate a stored snapshot already at the current schema version", async () => {
    const period2025 = calendarYearPeriod(2025);

    setResults([
      [{ timezone: "UTC" }],
      [{ first: new Date("2025-03-01T00:00:00Z") }],
      [{ first: null }],
      [
        {
          periodStart: period2025.start,
          periodEnd: period2025.end,
          schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
        },
      ],
      [{ periodLabel: "2025", generatedAt: now, dismissedAt: null, headline: emptyPayload().headline }],
    ]);

    await listAvailableSnapshots("viewer", now);

    expect(db.insert).not.toHaveBeenCalled();
  });
});
