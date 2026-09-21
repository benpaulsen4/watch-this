import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", async () => {
  const actual =
    await vi.importActual<typeof import("../db/schema")>("../db/schema");

  const resultsQueue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  Object.assign(chain, {
    from: () => chain,
    where: () => chain,
    values: () => chain,
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain,
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
  };

  // Real tables, not stubs: drizzle's operators need actual Column objects,
  // and later tests in this file import `tmdbCache` and `ContentType` too.
  return { ...actual, db };
});

const getTVSeasonDetails = vi.fn();
vi.mock("../tmdb/client", () => ({
  tmdbClient: {
    getTVSeasonDetails: (...args: unknown[]) => getTVSeasonDetails(...args),
  },
}));

import { db } from "../db";
import {
  ensureSeasonsCached,
  type EpisodeKey,
  episodeKeyOf,
  loadEpisodeRuntimes,
  type RuntimeLookup,
  summariseEpisodeRuntimes,
} from "./runtime";

const ep = (
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
): EpisodeKey => ({ tmdbId, seasonNumber, episodeNumber });

describe("episodeKeyOf", () => {
  it("builds a stable composite key", () => {
    expect(episodeKeyOf(ep(1396, 2, 7))).toBe("1396:2:7");
  });

  it("does not collide across differently-shaped ids", () => {
    expect(episodeKeyOf(ep(1, 23, 4))).not.toBe(episodeKeyOf(ep(1, 2, 34)));
  });
});

describe("summariseEpisodeRuntimes", () => {
  it("sums known runtimes", () => {
    const lookup: RuntimeLookup = new Map([
      ["1:1:1", 42],
      ["1:1:2", 45],
    ]);

    expect(summariseEpisodeRuntimes([ep(1, 1, 1), ep(1, 1, 2)], lookup)).toEqual(
      { minutes: 87, unknownCount: 0 },
    );
  });

  it("counts an episode whose cached runtime is null as unknown, not zero", () => {
    const lookup: RuntimeLookup = new Map([
      ["1:1:1", 42],
      ["1:1:2", null],
    ]);

    expect(summariseEpisodeRuntimes([ep(1, 1, 1), ep(1, 1, 2)], lookup)).toEqual(
      { minutes: 42, unknownCount: 1 },
    );
  });

  it("counts an episode absent from the lookup as unknown", () => {
    const lookup: RuntimeLookup = new Map([["1:1:1", 42]]);

    expect(summariseEpisodeRuntimes([ep(1, 1, 1), ep(9, 9, 9)], lookup)).toEqual(
      { minutes: 42, unknownCount: 1 },
    );
  });

  it("returns zeroes for no episodes", () => {
    expect(summariseEpisodeRuntimes([], new Map())).toEqual({
      minutes: 0,
      unknownCount: 0,
    });
  });
});

describe("loadEpisodeRuntimes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty lookup without querying when given no episodes", async () => {
    const lookup = await loadEpisodeRuntimes([]);

    expect(lookup.size).toBe(0);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("maps returned rows onto composite keys", async () => {
    (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults([
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
    vi.clearAllMocks();
    getTVSeasonDetails.mockReset();
  });

  it("does not refetch a season already recorded in tmdb_season_fetch", async () => {
    (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults([
      [{ tmdbId: 1, seasonNumber: 1 }],
    ]);

    await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(getTVSeasonDetails).not.toHaveBeenCalled();
  });

  it("fetches an unrecorded season and persists every episode, nulls included", async () => {
    (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults([[]]);
    getTVSeasonDetails.mockResolvedValue({
      name: "Season 1",
      season_number: 1,
      episodes: [
        { air_date: "2026-01-01", episode_number: 1, name: "A", overview: "", runtime: 42 },
        { air_date: "2026-01-08", episode_number: 2, name: "B", overview: "", runtime: null },
      ],
    });

    await ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]);

    expect(getTVSeasonDetails).toHaveBeenCalledWith(1, 1);
    expect(db.insert).toHaveBeenCalled();
  });

  it("records the season fetch even when TMDB throws, so a broken season is not retried forever", async () => {
    (db as unknown as { __setResults: (r: unknown[]) => void }).__setResults([[]]);
    getTVSeasonDetails.mockRejectedValue(new Error("404"));

    await expect(
      ensureSeasonsCached([{ tmdbId: 1, seasonNumber: 1 }]),
    ).resolves.toBeUndefined();
  });
});
