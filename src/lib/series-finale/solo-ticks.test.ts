import { describe, expect, it } from "vitest";

import { partitionSoloTicks } from "./solo-ticks";
import type { WatchedEpisodeRow } from "./types";

const row = (
  episodeNumber: number,
  iso: string,
  tmdbId = 1,
): WatchedEpisodeRow => ({
  tmdbId,
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

  it("treats a batch written one row at a time, milliseconds apart, as a batch", () => {
    // Before July 2026 a season mark wrote each episode with its own
    // `new Date()`, so a batch is a run of rows a few milliseconds apart.
    const result = partitionSoloTicks([
      row(1, "2025-09-20T09:41:02.104Z"),
      row(2, "2025-09-20T09:41:02.391Z"),
      row(3, "2025-09-20T09:41:02.655Z"),
    ]);

    expect(result.solo).toHaveLength(0);
    expect(result.batched).toHaveLength(3);
  });

  it("chains a long run by each gap, however long the run lasts overall", () => {
    const rows = Array.from({ length: 45 }, (_, i) =>
      row(i + 1, new Date(Date.UTC(2025, 8, 20, 9, 41) + i * 1_500).toISOString()),
    );

    expect(partitionSoloTicks(rows).solo).toHaveLength(0);
  });

  it("counts two ticks exactly the gap apart as a batch, and a second more as two solo ticks", () => {
    expect(
      partitionSoloTicks([
        row(1, "2026-03-14T20:00:00.000Z"),
        row(2, "2026-03-14T20:02:00.000Z"),
      ]).solo,
    ).toHaveLength(0);
    expect(
      partitionSoloTicks([
        row(1, "2026-03-14T20:00:00.000Z"),
        row(2, "2026-03-14T20:02:01.000Z"),
      ]).solo,
    ).toHaveLength(2);
  });

  it("judges each row by its neighbours in time, whatever order it arrives in", () => {
    const result = partitionSoloTicks([
      row(3, "2026-03-14T22:00:00.000Z"),
      row(1, "2026-03-14T20:00:00.000Z"),
      row(2, "2026-03-14T20:00:30.000Z"),
    ]);

    expect(result.solo.map((r) => r.episodeNumber)).toEqual([3]);
    expect(result.batched.map((r) => r.episodeNumber)).toEqual([1, 2]);
  });

  it("keeps ticks of different shows close together as solo ticks", () => {
    const result = partitionSoloTicks([
      row(1, "2026-03-14T20:00:00.000Z", 1),
      row(1, "2026-03-14T20:00:20.000Z", 2),
      row(1, "2026-03-14T20:00:40.000Z", 3),
    ]);

    expect(result.solo).toHaveLength(3);
  });

  it("chains a show's batch through another show's tick in the middle of it", () => {
    const result = partitionSoloTicks([
      row(1, "2025-09-20T09:41:02.104Z", 1),
      row(7, "2025-09-20T09:41:30.000Z", 2),
      row(2, "2025-09-20T09:42:10.000Z", 1),
    ]);

    expect(result.solo.map((r) => r.tmdbId)).toEqual([2]);
    expect(result.batched.map((r) => r.tmdbId)).toEqual([1, 1]);
  });

  it("treats rows of different shows sharing an exact timestamp as a batch, as an import writes them", () => {
    const result = partitionSoloTicks([
      row(1, "2019-05-03T00:00:00.000Z", 1),
      row(1, "2019-05-03T00:00:00.000Z", 2),
    ]);

    expect(result.solo).toHaveLength(0);
    expect(result.batched).toHaveLength(2);
  });

  it("handles an empty input", () => {
    expect(partitionSoloTicks([])).toEqual({ solo: [], batched: [] });
  });
});
