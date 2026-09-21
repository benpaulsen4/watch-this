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

import { db } from "../db";
import {
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
