import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../db", () => {
  const resultsQueue: any[] = [];
  const setResults = (arr: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...arr);
  };
  const insertCalls: Array<{ table: any; payload: any }> = [];
  const chain: any = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(resultsQueue.shift()),
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
  (db as any).__resetInserts = () => {
    insertCalls.length = 0;
  };

  const episodeWatchStatus = {} as any;
  const activityFeed = {} as any;

  return { db, episodeWatchStatus, activityFeed };
});

vi.mock("./episodeUtils", () => {
  return {
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
        episodes: Array.from({ length: season === 1 ? 2 : 1 }),
      })),
      getTVEpisodeDetails: vi.fn(
        async (_id: number, _s: number, _e: number) => ({
          name: "Ep",
          air_date: "2024-01-01",
        })
      ),
    },
  };
});

import {
  listEpisodeStatuses,
  updateEpisodeStatus,
  batchUpdateEpisodeStatuses,
  markNextEpisodeWatched,
} from "./service";
import { db, episodeWatchStatus } from "../db";
import { tmdbClient } from "../tmdb/client";
import * as episodeUtils from "./episodeUtils";

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
      new Error("404")
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
      new Error("404")
    );
    const result = await markNextEpisodeWatched(userId, 7);
    expect(result).toBe("noNextEpisode");
  });
});
