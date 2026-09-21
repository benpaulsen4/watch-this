import { describe, expect, it } from "vitest";

import {
  buildMonths,
  countDropped,
  countFinished,
  episodesPerDay,
} from "./aggregate";
import type { ContentStatusRow, WatchedEpisodeRow } from "./types";

const PERIOD = {
  start: new Date("2026-01-01T00:00:00Z"),
  end: new Date("2027-01-01T00:00:00Z"),
};

const episode = (iso: string, episodeNumber = 1): WatchedEpisodeRow => ({
  tmdbId: 1,
  seasonNumber: 1,
  episodeNumber,
  watchedAt: new Date(iso),
});

const status = (
  overrides: Partial<ContentStatusRow> & { tmdbId: number },
): ContentStatusRow => ({
  contentType: "tv",
  status: "completed",
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2026-04-04T00:00:00Z"),
  ...overrides,
});

describe("countFinished", () => {
  it("splits completed titles by content type", () => {
    const result = countFinished(
      [
        status({ tmdbId: 1, contentType: "movie" }),
        status({ tmdbId: 2, contentType: "movie" }),
        status({ tmdbId: 3, contentType: "tv" }),
      ],
      PERIOD,
    );

    expect(result).toEqual({ films: 2, shows: 1, total: 3 });
  });

  it("ignores titles completed outside the period", () => {
    const result = countFinished(
      [
        status({ tmdbId: 1, updatedAt: new Date("2025-06-01T00:00:00Z") }),
        status({ tmdbId: 2, updatedAt: new Date("2026-06-01T00:00:00Z") }),
      ],
      PERIOD,
    );

    expect(result.total).toBe(1);
  });

  it("ignores non-completed statuses", () => {
    const result = countFinished(
      [status({ tmdbId: 1, status: "watching" })],
      PERIOD,
    );

    expect(result.total).toBe(0);
  });

  it("treats period end as exclusive", () => {
    const result = countFinished(
      [status({ tmdbId: 1, updatedAt: new Date("2027-01-01T00:00:00Z") })],
      PERIOD,
    );

    expect(result.total).toBe(0);
  });
});

describe("countDropped", () => {
  it("counts only dropped titles inside the period", () => {
    expect(
      countDropped(
        [
          status({ tmdbId: 1, status: "dropped" }),
          status({
            tmdbId: 2,
            status: "dropped",
            updatedAt: new Date("2025-01-01T00:00:00Z"),
          }),
          status({ tmdbId: 3, status: "completed" }),
        ],
        PERIOD,
      ),
    ).toBe(1);
  });
});

describe("buildMonths", () => {
  it("returns twelve zero-filled buckets", () => {
    const result = buildMonths([], [], "UTC", 2026);

    expect(result).toHaveLength(12);
    expect(result.every((m) => m.episodes === 0)).toBe(true);
    expect(result.map((m) => m.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it("buckets episodes by the month observed in the user's timezone", () => {
    // 2026-04-01T00:30Z is still March in New York
    const result = buildMonths(
      [episode("2026-04-01T00:30:00Z")],
      [],
      "America/New_York",
      2026,
    );

    expect(result[2]?.episodes).toBe(1);
    expect(result[3]?.episodes).toBe(0);
  });

  it("includes completed films dated by updatedAt", () => {
    const result = buildMonths(
      [],
      [
        status({
          tmdbId: 1,
          contentType: "movie",
          updatedAt: new Date("2026-03-14T12:00:00Z"),
        }),
      ],
      "UTC",
      2026,
    );

    expect(result[2]?.episodes).toBe(1);
  });

  it("ignores rows from another year", () => {
    const result = buildMonths(
      [episode("2025-03-14T12:00:00Z")],
      [],
      "UTC",
      2026,
    );

    expect(result.every((m) => m.episodes === 0)).toBe(true);
  });
});

describe("episodesPerDay", () => {
  it("divides by the number of days in the period", () => {
    expect(episodesPerDay(365, PERIOD)).toBeCloseTo(1, 5);
  });

  it("returns 0 for a zero-length period rather than Infinity", () => {
    expect(episodesPerDay(10, { start: PERIOD.start, end: PERIOD.start })).toBe(
      0,
    );
  });
});
