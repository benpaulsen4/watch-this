import { describe, expect, it } from "vitest";

import type { TMDBEpisode } from "./client";

describe("TMDBEpisode", () => {
  it("admits a null runtime, which TMDB returns for some episodes", () => {
    const episode: TMDBEpisode = {
      air_date: "2026-03-14",
      episode_number: 1,
      name: "Pilot",
      overview: "",
      runtime: null,
    };

    expect(episode.runtime).toBeNull();
  });
});
