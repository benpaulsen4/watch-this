import { describe, expect, it } from "vitest";

import { partitionSoloTicks } from "./solo-ticks";
import type { WatchedEpisodeRow } from "./types";

const row = (episodeNumber: number, iso: string): WatchedEpisodeRow => ({
  tmdbId: 1,
  seasonNumber: 1,
  episodeNumber,
  watchedAt: new Date(iso),
});

describe("partitionSoloTicks", () => {
  it("treats a lone row as a solo tick", () => {
    const result = partitionSoloTicks([row(1, "2026-03-14T20:00:00.000Z")]);

    expect(result.solo).toHaveLength(1);
    expect(result.batched).toHaveLength(0);
  });

  it("treats rows sharing an exact timestamp as a batch", () => {
    const result = partitionSoloTicks([
      row(1, "2026-03-14T20:00:00.000Z"),
      row(2, "2026-03-14T20:00:00.000Z"),
      row(3, "2026-03-14T20:00:00.000Z"),
    ]);

    expect(result.solo).toHaveLength(0);
    expect(result.batched).toHaveLength(3);
  });

  it("separates a batch from genuine solo ticks in the same set", () => {
    const result = partitionSoloTicks([
      row(1, "2026-03-14T20:00:00.000Z"),
      row(2, "2026-03-14T20:00:00.000Z"),
      row(3, "2026-03-15T21:30:00.000Z"),
    ]);

    expect(result.solo.map((r) => r.episodeNumber)).toEqual([3]);
    expect(result.batched.map((r) => r.episodeNumber)).toEqual([1, 2]);
  });

  it("does not merge timestamps that differ by a millisecond", () => {
    const result = partitionSoloTicks([
      row(1, "2026-03-14T20:00:00.000Z"),
      row(2, "2026-03-14T20:00:00.001Z"),
    ]);

    expect(result.solo).toHaveLength(2);
  });

  it("handles an empty input", () => {
    expect(partitionSoloTicks([])).toEqual({ solo: [], batched: [] });
  });
});
