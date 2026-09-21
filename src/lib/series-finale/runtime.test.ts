import { describe, expect, it } from "vitest";

import {
  episodeKeyOf,
  summariseEpisodeRuntimes,
  type EpisodeKey,
  type RuntimeLookup,
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
