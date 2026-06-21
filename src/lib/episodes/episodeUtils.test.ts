import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => {
  const resultsQueue: any[] = [];
  const updateCalls: Array<{ table: any; payload: any }> = [];
  const insertCalls: Array<{ table: any; payload: any }> = [];
  const deleteCalls: Array<{ table: any }> = [];

  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve(resultsQueue.shift()),
    returning: () => Promise.resolve(resultsQueue.shift()),
    set: (payload: any) => {
      updateCalls.push({ table: chain.__currentUpdateTable, payload });
      return chain;
    },
    values: (payload: any) => {
      insertCalls.push({ table: chain.__currentInsertTable, payload });
      return chain;
    },
    then: (resolve: any) => Promise.resolve(resultsQueue.shift()).then(resolve),
  };

  const db: any = {
    select: vi.fn(() => chain),
    insert: vi.fn((table: any) => {
      chain.__currentInsertTable = table;
      return chain;
    }),
    update: vi.fn((table: any) => {
      chain.__currentUpdateTable = table;
      return chain;
    }),
    delete: vi.fn((table: any) => {
      deleteCalls.push({ table });
      return chain;
    }),
  };

  (db as any).__setMockResults = (values: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...values);
  };
  (db as any).__getUpdateCalls = () => updateCalls.slice();
  (db as any).__getInsertCalls = () => insertCalls.slice();
  (db as any).__getDeleteCalls = () => deleteCalls.slice();
  (db as any).__resetState = () => {
    resultsQueue.length = 0;
    updateCalls.length = 0;
    insertCalls.length = 0;
    deleteCalls.length = 0;
  };

  const activityFeed = {} as any;
  const ActivityType = { EPISODE_PROGRESS: "episode_progress" } as any;
  const ContentType = { TV: "tv" } as any;
  const episodeWatchStatus = {
    userId: "userId",
    tmdbId: "tmdbId",
    seasonNumber: "seasonNumber",
    episodeNumber: "episodeNumber",
    watched: "watched",
  } as any;
  const listCollaborators = {} as any;
  const listItems = {} as any;
  const lists = {} as any;
  const showSchedules = {} as any;
  const userContentStatus = {
    userId: "userId",
    tmdbId: "tmdbId",
    contentType: "contentType",
    status: "status",
    nextEpisodeDate: "nextEpisodeDate",
  } as any;
  const WatchStatus = {
    WATCHING: "watching",
    COMPLETED: "completed",
  } as any;

  return {
    activityFeed,
    ActivityType,
    ContentType,
    db,
    episodeWatchStatus,
    listCollaborators,
    listItems,
    lists,
    showSchedules,
    userContentStatus,
    WatchStatus,
  };
});

vi.mock("../tmdb/client", () => ({
  tmdbClient: {
    getTVShowDetails: vi.fn(),
    getTVSeasonDetails: vi.fn(),
  },
}));

vi.mock("../activity/activityUtils", () => ({
  syncStatusToCollaborators: vi.fn(async () => undefined),
}));

import { db, WatchStatus } from "../db";
import { tmdbClient } from "../tmdb/client";
import { updateTVShowStatus } from "./episodeUtils";

describe("episodeUtils.updateTVShowStatus", () => {
  beforeEach(() => {
    (db as any).__resetState();
    vi.restoreAllMocks();
  });

  it("keeps a show as watching when the next known episode airs within a month", async () => {
    const nextEpisodeDate = new Date();
    nextEpisodeDate.setDate(nextEpisodeDate.getDate() + 7);

    (db as any).__setMockResults([
      [{ status: WatchStatus.WATCHING, nextEpisodeDate: null }],
      [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
      ],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: 1,
        episode_number: 2,
      },
      next_episode_to_air: {
        air_date: nextEpisodeDate.toISOString(),
      },
      seasons: [{ season_number: 1 }],
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await updateTVShowStatus("u1", 100, 1, 2, true);

    expect(result).toBeNull();
    expect((db as any).__getDeleteCalls()).toHaveLength(0);
    expect((db as any).__getUpdateCalls()).toHaveLength(1);
    expect((db as any).__getUpdateCalls()[0].payload).toEqual({
      nextEpisodeDate,
    });
  });

  it("does not mark a show completed when earlier aired episodes are still unwatched", async () => {
    const existingNextEpisodeDate = new Date();
    existingNextEpisodeDate.setDate(existingNextEpisodeDate.getDate() + 5);

    (db as any).__setMockResults([
      [
        {
          status: WatchStatus.WATCHING,
          nextEpisodeDate: existingNextEpisodeDate,
        },
      ],
      [{ seasonNumber: 1, episodeNumber: 2 }],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: 1,
        episode_number: 2,
      },
      next_episode_to_air: null,
      seasons: [{ season_number: 1 }],
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await updateTVShowStatus("u1", 100, 1, 2, true);

    expect(result).toBeNull();
    expect((db as any).__getDeleteCalls()).toHaveLength(0);
    expect((db as any).__getUpdateCalls()).toHaveLength(1);
    expect((db as any).__getUpdateCalls()[0].payload).toEqual({
      nextEpisodeDate: null,
    });
  });

  it("marks a show completed only when all aired episodes are watched and no near-term episode is known", async () => {
    (db as any).__setMockResults([
      [{ status: WatchStatus.WATCHING, nextEpisodeDate: null }],
      [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
      ],
      undefined,
      [],
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: 1,
        episode_number: 2,
      },
      next_episode_to_air: null,
      seasons: [{ season_number: 1 }],
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await updateTVShowStatus("u1", 100, 1, 2, true);

    expect(result).toBe(WatchStatus.COMPLETED);
    expect((db as any).__getDeleteCalls()).toHaveLength(1);
    expect((db as any).__getUpdateCalls()).toHaveLength(1);
    expect((db as any).__getUpdateCalls()[0].payload).toMatchObject({
      status: WatchStatus.COMPLETED,
      nextEpisodeDate: null,
    });
  });
});
