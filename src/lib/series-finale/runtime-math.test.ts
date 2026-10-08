import { describe, expect, it } from "vitest";

// No `vi.mock("../db")` anywhere in this file, deliberately: these tests only
// pass if `./runtime-math` is importable without a database, which is the whole
// reason it is separate from `./runtime`.
import {
  type EpisodeKey,
  episodeKeyOf,
  type RuntimeLookup,
  summariseEpisodeRuntimes,
  summariseFilmRuntimes,
} from "./runtime-math";

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

  it("counts a cached zero as unknown, not as an episode that lasted no time", () => {
    const lookup: RuntimeLookup = new Map([
      ["1:1:1", 42],
      ["1:1:2", 0],
    ]);

    expect(summariseEpisodeRuntimes([ep(1, 1, 1), ep(1, 1, 2)], lookup)).toEqual(
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

describe("summariseFilmRuntimes", () => {
  it("sums known film runtimes", () => {
    const lookup = new Map<number, number | null>([
      [1, 164],
      [2, 120],
    ]);

    expect(summariseFilmRuntimes([1, 2], lookup)).toEqual({
      minutes: 284,
      unknownCount: 0,
    });
  });

  it("counts a null runtime as unknown", () => {
    const lookup = new Map<number, number | null>([
      [1, 164],
      [2, null],
    ]);

    expect(summariseFilmRuntimes([1, 2], lookup)).toEqual({
      minutes: 164,
      unknownCount: 1,
    });
  });

  it("counts an absent film as unknown", () => {
    expect(summariseFilmRuntimes([1], new Map())).toEqual({
      minutes: 0,
      unknownCount: 1,
    });
  });

  it("counts a stored zero as unknown, not as a film that lasted no time", () => {
    // Write sites normalise TMDB's 0 to null, but the column can still hold a
    // 0 written before that existed or by anything else that touches the
    // cache. A known zero is the silent understatement this module's whole
    // unknown-count contract exists to prevent.
    const lookup = new Map<number, number | null>([
      [1, 164],
      [2, 0],
    ]);

    expect(summariseFilmRuntimes([1, 2], lookup)).toEqual({
      minutes: 164,
      unknownCount: 1,
    });
  });
});
