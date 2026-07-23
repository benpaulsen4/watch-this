import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => {
  const resultsQueue: any[] = [];
  const setResults = (arr: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...arr);
  };
  const insertCalls: Array<{ table: any; payload: any }> = [];
  const limitCalls: number[] = [];
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    onConflictDoUpdate: () => chain,
    limit: (value: number) => {
      limitCalls.push(value);
      return Promise.resolve(resultsQueue.shift());
    },
    returning: () => Promise.resolve(resultsQueue.shift()),
    set: () => chain,
    values: (payload: any) => {
      insertCalls.push({ table: (chain as any).__currentInsertTable, payload });
      return chain;
    },
    then: (resolve: any) => Promise.resolve(resultsQueue.shift()).then(resolve),
  };
  const db: any = {
    select: vi.fn(() => chain),
    insert: vi.fn((table: any) => {
      (chain as any).__currentInsertTable = table;
      return chain;
    }),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
  };
  (db as any).__setMockResults = setResults;
  (db as any).__getInsertCalls = () => insertCalls.slice();
  (db as any).__getLimitCalls = () => limitCalls.slice();
  (db as any).__resetInserts = () => {
    insertCalls.length = 0;
    limitCalls.length = 0;
  };

  const episodeWatchStatus = {} as any;
  const activityFeed = {} as any;

  return { db, episodeWatchStatus, activityFeed };
});

// `hasAired`/`getAirDateKey` are pure helpers — keep the real implementations
// so the air-date guards below exercise production logic.
vi.mock("./episodeUtils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./episodeUtils")>();
  return {
    ...actual,
    getUserTimeZone: vi.fn(async () => "UTC"),
    completeEpisodeUpdate: vi.fn(async () => ({
      episode: {
        id: "e1",
        userId: "u1",
        tmdbId: 1,
        seasonNumber: 1,
        episodeNumber: 2,
        watched: true,
        watchedAt: new Date("2025-01-01T00:00:00Z"),
      },
      newStatus: "watching",
      syncedCollaboratorIds: ["c1"],
    })),
    batchUpdateEpisodes: vi.fn(async () => ({
      episodes: [
        {
          id: "e2",
          userId: "u1",
          tmdbId: 2,
          seasonNumber: 1,
          episodeNumber: 1,
          watched: true,
          watchedAt: new Date("2025-01-02T00:00:00Z"),
        },
      ],
      newStatus: "watching",
      syncedCollaboratorIds: ["c2"],
    })),
    syncEpisodeStatusToCollaborators: vi.fn(async () => ["c1", "c2"]),
    createEpisodeActivityEntry: vi.fn(async () => undefined),
    updateTVShowStatus: vi.fn(async () => "watching"),
  };
});

vi.mock("../tmdb/client", () => {
  return {
    tmdbClient: {
      getTVShowDetails: vi.fn(async (id: number) => ({ id, name: "S" })),
      getTVSeasonDetails: vi.fn(async (_id: number, season: number) => ({
        episodes: Array.from(
          { length: season === 1 ? 2 : 1 },
          (_, index) => ({ episode_number: index + 1 }),
        ),
      })),
      getTVEpisodeDetails: vi.fn(
        async (_id: number, _s: number, _e: number) => ({
          name: "Ep",
          air_date: "2024-01-01",
        }),
      ),
    },
  };
});

import { db } from "../db";
import { tmdbClient } from "../tmdb/client";
import { getUserTimeZone } from "./episodeUtils";
import {
  batchUpdateEpisodeStatuses,
  listEpisodeStatuses,
  markNextEpisodeWatched,
  updateEpisodeStatus,
} from "./service";

describe("episodes service", () => {
  const userId = "u1";
  const now = new Date("2025-01-01T00:00:00Z");

  beforeEach(() => {
    (db as any).__setMockResults([]);
    (db as any).__resetInserts();
    vi.restoreAllMocks();
  });

  it("listEpisodeStatuses returns mapped rows", async () => {
    const rows = [
      {
        id: "e10",
        userId,
        tmdbId: 100,
        seasonNumber: 1,
        episodeNumber: 1,
        watched: true,
        watchedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ];
    (db as any).__setMockResults([rows]);
    const res = await listEpisodeStatuses(userId, 100);
    expect(res.episodes[0].id).toBe("e10");
    expect(typeof res.episodes[0].watchedAt).toBe("string");
  });

  it("updateEpisodeStatus uses completeEpisodeUpdate and maps result", async () => {
    const res = await updateEpisodeStatus(userId, {
      tmdbId: 1,
      seasonNumber: 1,
      episodeNumber: 2,
      watched: true,
    } as any);
    expect(res.episode.id).toBe("e1");
    expect(res.newStatus).toBe("watching");
  });

  it("batchUpdateEpisodeStatuses returns mapped episodes", async () => {
    const res = await batchUpdateEpisodeStatuses(userId, 2, [
      { seasonNumber: 1, episodeNumber: 1, watched: true },
    ]);
    expect(res.episodes[0].id).toBe("e2");
    expect(res.syncedCollaboratorIds).toEqual(["c2"]);
  });

  it("markNextEpisodeWatched inserts when no existing status", async () => {
    (db as any).__setMockResults([
      [],
      [],
      [
        {
          id: "e3",
          userId,
          tmdbId: 5,
          seasonNumber: 1,
          episodeNumber: 1,
          watched: true,
          watchedAt: now,
        },
      ],
    ]);
    const result = await markNextEpisodeWatched(userId, 5);
    if (typeof result === "string") throw new Error("unexpected");
    expect(result.episode.id).toBe("e3");
    expect(result.episodeDetails.name).toBe("Ep");
  });

  it("markNextEpisodeWatched returns notFound when show missing", async () => {
    (tmdbClient.getTVShowDetails as any).mockRejectedValueOnce(
      new Error("404"),
    );
    const result = await markNextEpisodeWatched(userId, 50);
    expect(result).toBe("notFound");
  });

  it("markNextEpisodeWatched returns notAired when episode is in future", async () => {
    (db as any).__setMockResults([[]]);
    (tmdbClient.getTVEpisodeDetails as any).mockResolvedValueOnce({
      name: "Ep",
      air_date: "2999-01-01",
    });
    const result = await markNextEpisodeWatched(userId, 6);
    expect(result).toBe("notAired");
  });

  it("markNextEpisodeWatched returns noNextEpisode when episode details missing", async () => {
    (db as any).__setMockResults([[]]);
    (tmdbClient.getTVEpisodeDetails as any).mockRejectedValueOnce(
      new Error("404"),
    );
    const result = await markNextEpisodeWatched(userId, 7);
    expect(result).toBe("noNextEpisode");
  });

  // LOGIC-10
  it("markNextEpisodeWatched advances to the next season when the season contains an episode 0", async () => {
    // A season returning 11 entries numbered 0-10: `episodes.length` (11) is
    // one higher than the highest episode number (10), so the old code asked
    // TMDB for the non-existent S1E11 and dead-ended on 404.
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValueOnce({
      episodes: Array.from({ length: 11 }, (_, index) => ({
        episode_number: index,
      })),
    });
    (db as any).__setMockResults([
      [{ seasonNumber: 1, episodeNumber: 10, watched: true }],
      [],
      [
        {
          id: "e4",
          userId,
          tmdbId: 8,
          seasonNumber: 2,
          episodeNumber: 1,
          watched: true,
          watchedAt: now,
        },
      ],
    ]);

    const result = await markNextEpisodeWatched(userId, 8);

    if (typeof result === "string") throw new Error(`unexpected: ${result}`);
    expect(result.episodeDetails.seasonNumber).toBe(2);
    expect(result.episodeDetails.episodeNumber).toBe(1);
    expect((tmdbClient.getTVEpisodeDetails as any).mock.calls[0]).toEqual([
      8, 2, 1,
    ]);
  });

  // LOGIC-10
  it("markNextEpisodeWatched skips numbering gaps within a season", async () => {
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValueOnce({
      episodes: [
        { episode_number: 0 },
        { episode_number: 1 },
        { episode_number: 2 },
        { episode_number: 5 },
      ],
    });
    (db as any).__setMockResults([
      [{ seasonNumber: 1, episodeNumber: 2, watched: true }],
      [],
      [{ id: "e5", userId, tmdbId: 9, seasonNumber: 1, episodeNumber: 5 }],
    ]);

    const result = await markNextEpisodeWatched(userId, 9);

    if (typeof result === "string") throw new Error(`unexpected: ${result}`);
    expect(result.episodeDetails.seasonNumber).toBe(1);
    expect(result.episodeDetails.episodeNumber).toBe(5);
  });

  // LOGIC-11
  it.each([[""], [null], ["not-a-date"]])(
    "markNextEpisodeWatched refuses to mark an episode whose air date is %p",
    async (airDate) => {
      (db as any).__setMockResults([[]]);
      (tmdbClient.getTVEpisodeDetails as any).mockResolvedValueOnce({
        name: "Ep",
        air_date: airDate,
      });

      const result = await markNextEpisodeWatched(userId, 11);

      // `new Date(null)` is the epoch and `new Date("")` is an Invalid Date,
      // whose comparisons are all false — so the old guard fell through and
      // the episode was marked watched and published to the activity feed.
      expect(result).toBe("notAired");
      expect((db as any).__getInsertCalls()).toHaveLength(0);
    },
  );

  // LOGIC-15 / DATA-10
  it("markNextEpisodeWatched allows an episode that has aired in the user's timezone", async () => {
    vi.useFakeTimers();
    // 2026-07-20 22:00Z is already 2026-07-21 10:00 in Auckland.
    vi.setSystemTime(new Date("2026-07-20T22:00:00Z"));

    try {
      (getUserTimeZone as any).mockResolvedValueOnce("Pacific/Auckland");
      (tmdbClient.getTVEpisodeDetails as any).mockResolvedValueOnce({
        name: "Ep",
        air_date: "2026-07-21",
      });
      (db as any).__setMockResults([
        [],
        [],
        [{ id: "e6", userId, tmdbId: 12, seasonNumber: 1, episodeNumber: 1 }],
      ]);

      const result = await markNextEpisodeWatched(userId, 12);

      // "2026-07-21" parsed as UTC midnight is in the future relative to
      // 22:00Z on the 20th, so the old code blocked the user for ~12 hours
      // after the episode had aired where they live.
      expect(result).not.toBe("notAired");
    } finally {
      vi.useRealTimers();
    }
  });

  // LOGIC-15 / DATA-10
  it("markNextEpisodeWatched blocks an episode that has not aired in the user's timezone", async () => {
    vi.useFakeTimers();
    // 2026-07-21 05:00Z is still 2026-07-20 19:00 in Honolulu.
    vi.setSystemTime(new Date("2026-07-21T05:00:00Z"));

    try {
      (getUserTimeZone as any).mockResolvedValueOnce("Pacific/Honolulu");
      (tmdbClient.getTVEpisodeDetails as any).mockResolvedValueOnce({
        name: "Ep",
        air_date: "2026-07-21",
      });
      (db as any).__setMockResults([[]]);

      const result = await markNextEpisodeWatched(userId, 13);

      expect(result).toBe("notAired");
    } finally {
      vi.useRealTimers();
    }
  });

  // DATA-08b
  it("markNextEpisodeWatched asks the database for a single last-watched row", async () => {
    (db as any).__setMockResults([
      [],
      [],
      [{ id: "e7", userId, tmdbId: 14, seasonNumber: 1, episodeNumber: 1 }],
    ]);

    await markNextEpisodeWatched(userId, 14);

    // Two bounded lookups: the ordered watched-episode scan (previously
    // unbounded — it pulled every watched episode into JS to read `[0]`) and
    // the existing-status probe.
    expect((db as any).__getLimitCalls()).toEqual([1, 1]);
  });
});
