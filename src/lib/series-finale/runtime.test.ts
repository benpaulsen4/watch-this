import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", async () => {
  const actual =
    await vi.importActual<typeof import("../db/schema")>("../db/schema");

  const resultsQueue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  // A vi.fn(), not a plain arrow function: `db.insert` alone being called says
  // nothing about *what* was inserted, and a test asserting on values passed to
  // `.values(...)` needs those calls recorded somewhere it can reach.
  const valuesMock = vi.fn((_values: unknown) => chain);
  // Recorded for the same reason as `values`: whether a refetched season's
  // `fetched_at` actually advances lives entirely in the conflict clause, and
  // a test that cannot see it can only assert that *an* insert happened.
  const conflictUpdateMock = vi.fn((_config: unknown) => chain);
  Object.assign(chain, {
    from: () => chain,
    where: () => chain,
    values: valuesMock,
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: conflictUpdateMock,
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(resultsQueue.shift() ?? []).then(resolve),
  });

  const db = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    __setResults: (rows: unknown[]) => {
      resultsQueue.length = 0;
      resultsQueue.push(...rows);
    },
    __valuesCalls: () => valuesMock.mock.calls,
    __conflictUpdateCalls: () => conflictUpdateMock.mock.calls,
  };

  // Real tables, not stubs: drizzle's operators need actual Column objects,
  // and later tests in this file import `tmdbCache` and `ContentType` too.
  return { ...actual, db };
});

const getTVSeasonDetails = vi.fn();
vi.mock("../tmdb/client", async () => {
  // Spread the real module rather than returning a bare stub: only the
  // network-touching client needs replacing, and `ensureSeasonsCached` decides
  // whether a failure is definitive with the real `isTMDBHttpError`. A
  // hand-written stand-in would let that logic drift from the client that
  // throws the errors it inspects.
  const actual =
    await vi.importActual<typeof import("../tmdb/client")>("../tmdb/client");

  return {
    ...actual,
    tmdbClient: {
      getTVSeasonDetails: (...args: unknown[]) => getTVSeasonDetails(...args),
    },
  };
});

import { db } from "../db";
import { type TMDBHttpError } from "../tmdb/client";
// The pure key-building and summation helpers are covered in
// `runtime-math.test.ts`, which mocks nothing; only the db- and TMDB-touching
// surface is exercised here.
import {
  ensureSeasonsCached,
  type EpisodeKey,
  loadEpisodeRuntimes,
  loadFilmRuntimes,
  SEASON_FETCH_GAP_MS,
  SEASON_FETCH_STALE_AFTER_MS,
} from "./runtime";

const ep = (
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): EpisodeKey => ({ tmdbId, seasonNumber, episodeNumber });

const mockDb = db as unknown as {
  __setResults: (rows: unknown[]) => void;
  __valuesCalls: () => unknown[][];
  __conflictUpdateCalls: () => unknown[][];
};

// `vi.clearAllMocks()` does NOT empty the mock db's shared results queue --
// only `__setResults` does, and a test that never calls it inherits whatever
// the previous test left behind. The hazard is worse than it looks: the queue
// is drained by the chain's `then`, which every awaited statement hits, so an
// awaited *insert* shifts it exactly like a select does. A function issuing
// two queries in one test would therefore silently feed the second one another
// test's leftovers. Reset it here instead of relying on the queue happening to
// have degraded to empty at the right moment.
beforeEach(() => {
  vi.clearAllMocks();
  mockDb.__setResults([]);
});

const httpError = (status: number): TMDBHttpError => {
  const error = new Error(`TMDB API error: ${status}`) as TMDBHttpError;
  error.status = status;
  return error;
};

const tmdbEpisode = (episodeNumber: number, runtime: number | null) => ({
  air_date: "2026-01-01",
  episode_number: episodeNumber,
  name: `Episode ${episodeNumber}`,
  overview: "",
  runtime,
});

describe("loadEpisodeRuntimes", () => {
  it("returns an empty lookup without querying when given no episodes", async () => {
    const lookup = await loadEpisodeRuntimes([]);

    expect(lookup.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("maps returned rows onto composite keys", async () => {
    mockDb.__setResults([
      [
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 1, runtime: 42 },
        { tmdbId: 1, seasonNumber: 1, episodeNumber: 2, runtime: null },
      ],
    ]);

    const lookup = await loadEpisodeRuntimes([ep(1, 1, 1), ep(1, 1, 2)]);

    expect(lookup.get("1:1:1")).toBe(42);
    expect(lookup.get("1:1:2")).toBeNull();
  });
});

describe("ensureSeasonsCached", () => {
  beforeEach(() => {
    getTVSeasonDetails.mockReset();
  });

  // The season-fetch insert is the *last* `.values(...)` of a run, so its
  // presence is what "this season was recorded as asked about" means.
  const seasonFetchRecords = () =>
    mockDb
      .__valuesCalls()
      .map((call) => call[0])
      .filter(
        (value): value is { tmdbId: number; seasonNumber: number } =>
          !Array.isArray(value) &&
          typeof value === "object" &&
          value !== null &&
          "seasonNumber" in value,
      );

  it("does not refetch a season already recorded in tmdb_season_fetch", async () => {
    mockDb.__setResults([
      [{ tmdbId: 1, seasonNumber: 1, fetchedAt: new Date() }],
    ]);

    const summary = await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(getTVSeasonDetails).not.toHaveBeenCalled();
    expect(summary).toEqual({ fetched: 0, skipped: 1, failed: 0 });
  });

  it("fetches an unrecorded season and persists every episode, nulls included", async () => {
    mockDb.__setResults([[]]);
    getTVSeasonDetails.mockResolvedValue({
      name: "Season 1",
      season_number: 1,
      episodes: [tmdbEpisode(1, 42), tmdbEpisode(2, null)],
    });

    const summary = await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(getTVSeasonDetails).toHaveBeenCalledWith(1, 1);
    // Not just "an insert happened" -- the episode insert is the first call to
    // `.values(...)` in this run (the season-fetch insert follows it), so its
    // first argument must be both episodes, nulls included, correctly mapped.
    const [firstValuesCall] = mockDb.__valuesCalls();
    expect(firstValuesCall?.[0]).toEqual([
      { tmdbId: 1, seasonNumber: 1, episodeNumber: 1, runtime: 42 },
      { tmdbId: 1, seasonNumber: 1, episodeNumber: 2, runtime: null },
    ]);
    expect(summary).toEqual({ fetched: 1, skipped: 0, failed: 0 });
  });

  it("deduplicates repeated episode numbers before inserting", async () => {
    mockDb.__setResults([[]]);
    // Season 0 (specials) is where TMDB's data is messiest, and a repeated
    // episode_number makes Postgres raise "ON CONFLICT DO UPDATE command
    // cannot affect row a second time" -- which used to be caught and
    // recorded as a permanently empty season.
    getTVSeasonDetails.mockResolvedValue({
      name: "Specials",
      season_number: 0,
      episodes: [tmdbEpisode(1, 42), tmdbEpisode(1, 45), tmdbEpisode(2, 30)],
    });

    await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 0 }]);

    const [firstValuesCall] = mockDb.__valuesCalls();
    expect(firstValuesCall?.[0]).toEqual([
      { tmdbId: 1, seasonNumber: 0, episodeNumber: 1, runtime: 45 },
      { tmdbId: 1, seasonNumber: 0, episodeNumber: 2, runtime: 30 },
    ]);
  });

  it("records the season fetch on a 404, which is TMDB answering that the season does not exist", async () => {
    mockDb.__setResults([[]]);
    getTVSeasonDetails.mockRejectedValue(httpError(404));

    const summary = await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(seasonFetchRecords()).toEqual([{ tmdbId: 1, seasonNumber: 1 }]);
    expect(summary).toEqual({ fetched: 0, skipped: 0, failed: 1 });
  });

  it.each([
    ["a rate limit", httpError(429)],
    ["a server error", httpError(500)],
    ["a network failure", new Error("fetch failed")],
  ])(
    "does not record the season fetch after %s, so the next run retries it",
    async (_label, error) => {
      mockDb.__setResults([[]]);
      getTVSeasonDetails.mockRejectedValue(error);

      const summary = await ensureSeasonsCached([
        { tmdbId: 1, seasonNumber: 1 },
      ]);

      // Recording a transient blip would freeze it into "asked, nothing
      // there" for every user, forever, with no retry path anywhere.
      expect(seasonFetchRecords()).toEqual([]);
      expect(summary).toEqual({ fetched: 0, skipped: 0, failed: 1 });
    },
  );

  it("skips a season fetched inside the staleness window", async () => {
    mockDb.__setResults([
      [
        {
          tmdbId: 1,
          seasonNumber: 1,
          fetchedAt: new Date(Date.now() - SEASON_FETCH_STALE_AFTER_MS / 2),
        },
      ],
    ]);

    const summary = await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(getTVSeasonDetails).not.toHaveBeenCalled();
    expect(summary).toEqual({ fetched: 0, skipped: 1, failed: 0 });
  });

  it("refetches a season whose record has gone stale, and advances fetched_at", async () => {
    // A currently-airing season fetched in January holds only the episodes
    // that had aired by then; without a refresh the rest never get runtimes
    // for anyone, which undercounts exactly the shows a heavy user watches.
    mockDb.__setResults([
      [
        {
          tmdbId: 1,
          seasonNumber: 1,
          fetchedAt: new Date(Date.now() - SEASON_FETCH_STALE_AFTER_MS - 1000),
        },
      ],
    ]);
    getTVSeasonDetails.mockResolvedValue({
      name: "Season 1",
      season_number: 1,
      episodes: [tmdbEpisode(1, 42)],
    });

    const summary = await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(getTVSeasonDetails).toHaveBeenCalledWith(1, 1);
    expect(summary).toEqual({ fetched: 1, skipped: 0, failed: 0 });
    // Leaving the original timestamp in place would keep the row stale
    // forever, refetching the same season on every single run.
    const conflictSets = mockDb
      .__conflictUpdateCalls()
      .map((call) => call[0] as { set?: Record<string, unknown> });
    const fetchedAtUpdate = conflictSets.find(
      (config) => config.set && "fetchedAt" in config.set,
    );
    expect(fetchedAtUpdate?.set?.fetchedAt).toBeInstanceOf(Date);
  });

  // Both throttle tests used to measure `Date.now()` deltas around the call
  // and assert the elapsed wall clock landed in a window. That failed about
  // two runs in three hundred under load -- a scheduler hiccup is
  // indistinguishable from a broken throttle when the only instrument is the
  // clock -- and a suite that goes red on its own trains people to retry
  // instead of read. The properties are unchanged; they are now read off the
  // throttle's own timer rather than off the machine.
  it("waits between fetches, but not before the first", async () => {
    vi.useFakeTimers();
    try {
      mockDb.__setResults([[]]);
      getTVSeasonDetails.mockResolvedValue({
        name: "Season 1",
        season_number: 1,
        episodes: [],
      });

      let settled = false;
      const run = ensureSeasonsCached([
        { tmdbId: 1, seasonNumber: 1 },
        { tmdbId: 2, seasonNumber: 1 },
      ]).then((summary) => {
        settled = true;
        return summary;
      });

      // One millisecond short of the gap. The first fetch has already gone out
      // -- nothing is waited before it -- and the second has not.
      await vi.advanceTimersByTimeAsync(SEASON_FETCH_GAP_MS - 1);
      expect(getTVSeasonDetails).toHaveBeenCalledTimes(1);
      expect(settled).toBe(false);

      // Two fetches means exactly one gap, and that last millisecond is what
      // releases it. Without this throttle, a generation run handing the whole
      // deduped array to this function would fire dozens of TMDB requests back
      // to back.
      await vi.advanceTimersByTimeAsync(1);
      expect(getTVSeasonDetails).toHaveBeenCalledTimes(2);
      expect(await run).toEqual({ fetched: 2, skipped: 0, failed: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not wait at all when every season is already cached", async () => {
    mockDb.__setResults([
      [
        { tmdbId: 1, seasonNumber: 1, fetchedAt: new Date() },
        { tmdbId: 2, seasonNumber: 1, fetchedAt: new Date() },
      ],
    ]);

    // Asserted as "no gap was ever scheduled" rather than as "the clock did not
    // move much": the sleep is the only `setTimeout` on this path, so its
    // absence is the property, and a busy machine cannot fake it either way.
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    // Restored in `finally` rather than left to the suite: this patches a
    // global, `restoreMocks` is not set in `vitest.config.ts`, and the
    // `clearAllMocks` in `beforeEach` clears call history without unpatching.
    // Harmless while the tests below are timer-free, but the next timer test
    // added under this one would silently inherit a patched `setTimeout`.
    try {
      const summary = await ensureSeasonsCached([
        { tmdbId: 1, seasonNumber: 1 },
        { tmdbId: 2, seasonNumber: 1 },
      ]);

      expect(setTimeoutSpy).not.toHaveBeenCalled();
      expect(summary).toEqual({ fetched: 0, skipped: 2, failed: 0 });
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("returns a zero summary for no pairs, without querying", async () => {
    const summary = await ensureSeasonsCached([]);

    expect(summary).toEqual({ fetched: 0, skipped: 0, failed: 0 });
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("loadFilmRuntimes", () => {
  it("returns an empty map without querying when given no ids", async () => {
    const lookup = await loadFilmRuntimes([]);

    expect(lookup.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });
});
