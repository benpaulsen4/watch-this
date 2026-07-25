import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => {
  const resultsQueue: any[] = [];
  const updateCalls: Array<{
    table: any;
    payload: any;
    inTransaction: boolean;
  }> = [];
  const insertCalls: Array<{
    table: any;
    payload: any;
    inTransaction: boolean;
  }> = [];
  const deleteCalls: Array<{ table: any; inTransaction: boolean }> = [];
  const limitCalls: number[] = [];

  // Postgres semantics, because the bug this file guards against only exists
  // because of them: any failed statement aborts the whole transaction, every
  // later statement fails with 25P02, and COMMIT is silently converted to
  // ROLLBACK without raising anything to the client.
  let transactionDepth = 0;
  let transactionFailed = false;
  let rolledBackTransaction = false;

  const takeNextResult = () => {
    const value = resultsQueue.shift();
    if (value && typeof value === "object" && "__reject" in value) {
      if (transactionDepth > 0) transactionFailed = true;
      return Promise.reject((value as { __reject: unknown }).__reject);
    }
    return Promise.resolve(value);
  };

  const chain: any = {
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    orderBy: () => chain,
    onConflictDoUpdate: () => chain,
    limit: (value: number) => {
      limitCalls.push(value);
      return takeNextResult();
    },
    returning: () => takeNextResult(),
    set: (payload: any) => {
      updateCalls.push({
        table: chain.__currentUpdateTable,
        payload,
        inTransaction: transactionDepth > 0,
      });
      return chain;
    },
    values: (payload: any) => {
      insertCalls.push({
        table: chain.__currentInsertTable,
        payload,
        inTransaction: transactionDepth > 0,
      });
      return chain;
    },
    then: (resolve: any, reject?: any) => takeNextResult().then(resolve, reject),
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
      deleteCalls.push({ table, inTransaction: transactionDepth > 0 });
      return chain;
    }),
  };

  const discardTransactionWrites = () => {
    for (const calls of [insertCalls, updateCalls, deleteCalls] as Array<
      Array<{ inTransaction: boolean }>
    >) {
      for (let index = calls.length - 1; index >= 0; index -= 1) {
        if (calls[index].inTransaction) calls.splice(index, 1);
      }
    }
  };

  db.transaction = vi.fn(async (fn: any) => {
    transactionDepth += 1;
    transactionFailed = false;
    try {
      const result = await fn(db);
      if (transactionFailed) {
        // The callback returned normally (its failures were swallowed), so
        // drizzle issues COMMIT — which Postgres turns into ROLLBACK. Every
        // write staged inside the transaction is lost, silently.
        discardTransactionWrites();
        rolledBackTransaction = true;
      }
      return result;
    } finally {
      transactionDepth -= 1;
    }
  });

  (db as any).__setMockResults = (values: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...values);
  };
  (db as any).__getUpdateCalls = () => updateCalls.slice();
  (db as any).__getInsertCalls = () => insertCalls.slice();
  (db as any).__getDeleteCalls = () => deleteCalls.slice();
  (db as any).__getLimitCalls = () => limitCalls.slice();
  (db as any).__wasRolledBack = () => rolledBackTransaction;
  (db as any).__resetState = () => {
    resultsQueue.length = 0;
    updateCalls.length = 0;
    insertCalls.length = 0;
    deleteCalls.length = 0;
    limitCalls.length = 0;
    transactionDepth = 0;
    transactionFailed = false;
    rolledBackTransaction = false;
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
  const users = {} as any;
  const WatchStatus = {
    PLANNING: "planning",
    WATCHING: "watching",
    PAUSED: "paused",
    COMPLETED: "completed",
    DROPPED: "dropped",
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
    users,
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

import { syncStatusToCollaborators } from "../activity/activityUtils";
import { db, WatchStatus } from "../db";
import { tmdbClient } from "../tmdb/client";
import {
  batchUpdateEpisodes,
  getAirDateKey,
  hasAired,
  syncEpisodeStatusesToCollaborators,
  updateTVShowStatus,
} from "./episodeUtils";

// Every `updateTVShowStatus` call that is not handed a timezone resolves the
// user's zone — after the content-status lookup, which can short-circuit the
// whole call without needing a calendar at all.
const TIMEZONE_ROW = [{ timezone: "UTC" }];

describe("episodeUtils date helpers", () => {
  it("treats missing and unparseable air dates as not aired (LOGIC-11)", () => {
    const now = new Date("2026-07-21T05:00:00Z");

    expect(getAirDateKey(null)).toBeNull();
    expect(getAirDateKey("")).toBeNull();
    expect(getAirDateKey("   ")).toBeNull();
    expect(getAirDateKey("not-a-date")).toBeNull();

    expect(hasAired(null, now, "UTC")).toBe(false);
    expect(hasAired("", now, "UTC")).toBe(false);
    expect(hasAired("not-a-date", now, "UTC")).toBe(false);
  });

  it("compares bare air dates against the viewer's calendar day (LOGIC-15)", () => {
    // 2026-07-20 22:00Z is already 2026-07-21 10:00 in Auckland (UTC+12).
    const beforeUtcMidnight = new Date("2026-07-20T22:00:00Z");
    expect(hasAired("2026-07-21", beforeUtcMidnight, "Pacific/Auckland")).toBe(
      true,
    );
    expect(hasAired("2026-07-21", beforeUtcMidnight, "UTC")).toBe(false);

    // 2026-07-21 05:00Z is still 2026-07-20 19:00 in Honolulu (UTC-10).
    const afterUtcMidnight = new Date("2026-07-21T05:00:00Z");
    expect(hasAired("2026-07-21", afterUtcMidnight, "Pacific/Honolulu")).toBe(
      false,
    );
    expect(hasAired("2026-07-21", afterUtcMidnight, "UTC")).toBe(true);
  });

  // LOGIC-15: an air date that carries a time is an instant, and resolving it
  // in UTC while comparing it against a key built from the viewer's zone puts
  // two calendars in one comparison.
  it("resolves a timestamped air date in the requested timezone", () => {
    const instant = "2026-07-20T22:00:00Z";

    expect(getAirDateKey(instant, "Pacific/Auckland")).toBe("2026-07-21");
    expect(getAirDateKey(instant, "Pacific/Honolulu")).toBe("2026-07-20");
    expect(getAirDateKey(instant, "UTC")).toBe("2026-07-20");
    // No zone given: UTC, as before.
    expect(getAirDateKey(instant)).toBe("2026-07-20");
  });

  it("does not count a timestamped air date that is still in the viewer's future", () => {
    // 2026-07-20 13:00Z is 2026-07-21 01:00 in Auckland, and the viewer is
    // only at 2026-07-20 18:00 local — the episode has not aired for them.
    expect(
      hasAired(
        "2026-07-20T13:00:00Z",
        new Date("2026-07-20T06:00:00Z"),
        "Pacific/Auckland",
      ),
    ).toBe(false);
    // Same instant, a viewer far enough into their day to have seen it.
    expect(
      hasAired(
        "2026-07-20T13:00:00Z",
        new Date("2026-07-21T06:00:00Z"),
        "Pacific/Auckland",
      ),
    ).toBe(true);
  });
});

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
      TIMEZONE_ROW,
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
      TIMEZONE_ROW,
      [{ seasonNumber: 1, episodeNumber: 2 }],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: 1,
        episode_number: 2,
      },
      next_episode_to_air: null,
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
      TIMEZONE_ROW,
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

  // LOGIC-01
  it("does not complete a season-0 show whose specials are unwatched", async () => {
    (db as any).__setMockResults([
      [{ status: "planning", nextEpisodeDate: null }],
      TIMEZONE_ROW,
      // nothing watched at all
      [],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      // TMDB files previews and pilot specials under season 0.
      last_episode_to_air: {
        season_number: 0,
        episode_number: 2,
      },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await updateTVShowStatus("u1", 100, 0, 1, true);

    // Before the fix the season list was empty, `[].every()` was vacuously
    // true, and the show was completed with zero episodes watched — taking
    // all of its schedules with it.
    expect(result).toBe(WatchStatus.WATCHING);
    expect((db as any).__getDeleteCalls()).toHaveLength(0);
    expect((tmdbClient.getTVSeasonDetails as any).mock.calls).toEqual([
      [100, 0],
    ]);
  });

  // LOGIC-01
  it("clamps a negative last-aired season number instead of fetching it verbatim", async () => {
    (db as any).__setMockResults([
      [{ status: "planning", nextEpisodeDate: null }],
      TIMEZONE_ROW,
      [],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: -1,
        episode_number: 1,
      },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [{ episode_number: 1, air_date: "2024-01-01" }],
    });

    await updateTVShowStatus("u1", 100, 1, 1, true);

    // `Math.max(season_number, 0)` guarded the generated range but the fallback
    // pushed the raw value, so a negative season number still went to TMDB.
    expect((tmdbClient.getTVSeasonDetails as any).mock.calls).toEqual([
      [100, 0],
    ]);
  });

  // LOGIC-01
  it("does not complete a show when TMDB returns no episodes for its seasons", async () => {
    (db as any).__setMockResults([
      [{ status: "planning", nextEpisodeDate: null }],
      TIMEZONE_ROW,
      [],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: 1,
        episode_number: 1,
      },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({ episodes: [] });

    const result = await updateTVShowStatus("u1", 100, 1, 1, true);

    expect(result).toBe(WatchStatus.WATCHING);
    expect((db as any).__getDeleteCalls()).toHaveLength(0);
  });

  // LOGIC-02
  it("downgrades a completed show back to watching when an episode is un-marked", async () => {
    (db as any).__setMockResults([
      [{ status: WatchStatus.COMPLETED, nextEpisodeDate: null }],
      TIMEZONE_ROW,
      // The finale was just un-marked, so only episode 1 remains watched.
      [{ seasonNumber: 1, episodeNumber: 1 }],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: 1,
        episode_number: 2,
      },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await updateTVShowStatus("u1", 100, 1, 2, false);

    // Before the fix this returned null immediately and the show stayed
    // `completed` forever.
    expect(result).toBe(WatchStatus.WATCHING);
    expect((db as any).__getUpdateCalls()).toHaveLength(1);
    expect((db as any).__getUpdateCalls()[0].payload).toMatchObject({
      status: WatchStatus.WATCHING,
    });
    expect((db as any).__getDeleteCalls()).toHaveLength(0);
  });

  // LOGIC-02: the downgrade is for `completed` only.
  it.each([[WatchStatus.DROPPED], [WatchStatus.PAUSED], [WatchStatus.PLANNING]])(
    "leaves a %s show alone when an episode is un-marked",
    async (status) => {
      (db as any).__setMockResults([
        [{ status, nextEpisodeDate: null }],
        TIMEZONE_ROW,
        [{ seasonNumber: 1, episodeNumber: 1 }],
        undefined,
      ]);

      (tmdbClient.getTVShowDetails as any).mockResolvedValue({
        last_episode_to_air: {
          season_number: 1,
          episode_number: 2,
        },
        next_episode_to_air: null,
      });
      (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
        episodes: [
          { episode_number: 1, air_date: "2024-01-01" },
          { episode_number: 2, air_date: "2024-01-08" },
        ],
      });

      const result = await updateTVShowStatus("u1", 100, 1, 2, false);

      // `status !== WATCHING` is also true for planning/paused/dropped, so
      // un-ticking an episode of a show the user deliberately dropped re-opened
      // it as `watching` — and pushed that out to every collaborator.
      expect(result).toBeNull();
      expect((db as any).__getUpdateCalls()).toHaveLength(0);
      expect((db as any).__getDeleteCalls()).toHaveLength(0);
      expect(syncStatusToCollaborators as any).not.toHaveBeenCalled();
    },
  );

  // LOGIC-02: only the status is pinned; the schedule hint still refreshes.
  it("still refreshes nextEpisodeDate for a dropped show without re-opening it", async () => {
    const staleNextEpisodeDate = new Date("2026-01-01T00:00:00Z");

    (db as any).__setMockResults([
      [{ status: WatchStatus.DROPPED, nextEpisodeDate: staleNextEpisodeDate }],
      TIMEZONE_ROW,
      [{ seasonNumber: 1, episodeNumber: 1 }],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: 1,
        episode_number: 2,
      },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await updateTVShowStatus("u1", 100, 1, 2, false);

    expect(result).toBeNull();
    expect((db as any).__getUpdateCalls()).toHaveLength(1);
    expect((db as any).__getUpdateCalls()[0].payload).toEqual({
      nextEpisodeDate: null,
    });
    expect(syncStatusToCollaborators as any).not.toHaveBeenCalled();
  });

  // Pre-existing behaviour: actually watching something resumes a dropped show.
  it("resumes a dropped show when an episode is marked watched", async () => {
    (db as any).__setMockResults([
      [{ status: WatchStatus.DROPPED, nextEpisodeDate: null }],
      TIMEZONE_ROW,
      [{ seasonNumber: 1, episodeNumber: 1 }],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      last_episode_to_air: {
        season_number: 1,
        episode_number: 2,
      },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await updateTVShowStatus("u1", 100, 1, 1, true);

    expect(result).toBe(WatchStatus.WATCHING);
    expect((db as any).__getUpdateCalls()[0].payload).toMatchObject({
      status: WatchStatus.WATCHING,
    });
    expect(syncStatusToCollaborators as any).toHaveBeenCalledTimes(1);
  });

  it("does not start tracking a show when un-marking an episode it has no status for", async () => {
    (db as any).__setMockResults([[]]);

    const result = await updateTVShowStatus("u1", 100, 1, 2, false);

    expect(result).toBeNull();
    expect((db as any).__getInsertCalls()).toHaveLength(0);
    expect(tmdbClient.getTVShowDetails as any).not.toHaveBeenCalled();
    // The no-op path costs exactly one query: the content-status probe. The
    // timezone lookup used to run before the guard, for nothing.
    expect((db.select as any).mock.calls).toHaveLength(1);
  });

  // LOGIC-15 / DATA-10
  it("counts an episode that has aired in the user's timezone but not in UTC", async () => {
    vi.useFakeTimers();
    // 2026-07-20 22:00Z is 2026-07-21 10:00 in Auckland.
    vi.setSystemTime(new Date("2026-07-20T22:00:00Z"));

    try {
      (db as any).__setMockResults([
        [{ status: WatchStatus.WATCHING, nextEpisodeDate: null }],
        [{ timezone: "Pacific/Auckland" }],
        // only the first episode is watched
        [{ seasonNumber: 1, episodeNumber: 1 }],
        undefined,
      ]);

      (tmdbClient.getTVShowDetails as any).mockResolvedValue({
        last_episode_to_air: {
          season_number: 1,
          episode_number: 2,
        },
        next_episode_to_air: null,
      });
      (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
        episodes: [
          { episode_number: 1, air_date: "2024-01-01" },
          { episode_number: 2, air_date: "2026-07-21" },
        ],
      });

      const result = await updateTVShowStatus("u1", 100, 1, 1, true);

      // Parsing "2026-07-21" as UTC midnight made episode 2 look unaired, so
      // the show was completed while the user still had an aired episode to
      // watch — and lost its schedules.
      expect(result).toBeNull();
      expect((db as any).__getDeleteCalls()).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("episodeUtils.syncEpisodeStatusesToCollaborators", () => {
  beforeEach(() => {
    (db as any).__resetState();
    vi.restoreAllMocks();
  });

  // DATA-05
  it("does not repeat work when the collaborator join fans a list out", async () => {
    (db as any).__setMockResults([
      // the join emits one row per collaborator for the same list
      [
        { listId: "l1", ownerId: "o1" },
        { listId: "l1", ownerId: "o1" },
        { listId: "l1", ownerId: "o1" },
      ],
      [{ userId: "c1" }],
      undefined,
      undefined,
    ]);

    const result = await syncEpisodeStatusesToCollaborators("u1", 100, [
      { seasonNumber: 1, episodeNumber: 1, watched: true },
    ]);

    expect(result.slice().sort()).toEqual(["c1", "o1"]);
    // One collaborator lookup for the list, not one per duplicated row.
    expect((db.select as any).mock.calls).toHaveLength(2);
    // One upsert per distinct collaborator.
    expect((db as any).__getInsertCalls()).toHaveLength(2);
  });

  it("writes every episode of a batch in a single upsert per collaborator", async () => {
    (db as any).__setMockResults([
      [{ listId: "l1", ownerId: "o1" }],
      [],
      undefined,
    ]);

    const result = await syncEpisodeStatusesToCollaborators("u1", 100, [
      { seasonNumber: 1, episodeNumber: 1, watched: true },
      { seasonNumber: 1, episodeNumber: 2, watched: true },
      { seasonNumber: 1, episodeNumber: 3, watched: true },
    ]);

    expect(result).toEqual(["o1"]);
    const insertCalls = (db as any).__getInsertCalls();
    expect(insertCalls).toHaveLength(1);
    expect(insertCalls[0].payload).toHaveLength(3);
  });
});

describe("episodeUtils.batchUpdateEpisodes", () => {
  beforeEach(() => {
    (db as any).__resetState();
    vi.restoreAllMocks();
  });

  const activityInsertsOf = (insertCalls: any[]) =>
    insertCalls.filter(
      (call: any) =>
        !Array.isArray(call.payload) &&
        call.payload?.activityType === "episode_progress",
    );

  // DATA-04
  it("fetches the show once, upserts in bulk and emits a single activity row", async () => {
    const upserted = [
      { id: "ep-1", seasonNumber: 1, episodeNumber: 1, watched: true },
      { id: "ep-2", seasonNumber: 1, episodeNumber: 2, watched: true },
      { id: "ep-3", seasonNumber: 1, episodeNumber: 3, watched: true },
    ];

    (db as any).__setMockResults([
      TIMEZONE_ROW,
      // bulk upsert .returning()
      upserted,
      // collaborator sync: no sync-enabled lists
      [],
      // activity insert
      undefined,
      // updateTVShowStatus: content status lookup
      [{ status: WatchStatus.WATCHING, nextEpisodeDate: null }],
      // progress state: watched episodes
      [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
        { seasonNumber: 1, episodeNumber: 3 },
      ],
      undefined,
      [],
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      name: "Test Show",
      poster_path: null,
      last_episode_to_air: { season_number: 1, episode_number: 3 },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
        { episode_number: 3, air_date: "2024-01-15" },
      ],
    });

    const result = await batchUpdateEpisodes("u1", 100, [
      { seasonNumber: 1, episodeNumber: 1, watched: true },
      { seasonNumber: 1, episodeNumber: 2, watched: true },
      { seasonNumber: 1, episodeNumber: 3, watched: true },
    ]);

    expect(result.episodes).toHaveLength(3);
    expect(result.newStatus).toBe(WatchStatus.COMPLETED);

    // One TMDB round trip for the whole batch instead of one per episode.
    expect((tmdbClient.getTVShowDetails as any).mock.calls).toHaveLength(1);
    // The bulk upsert is a single statement, so it is already atomic; the two
    // best-effort writes that follow it must not be able to roll it back.
    expect((db as any).transaction).not.toHaveBeenCalled();

    const insertCalls = (db as any).__getInsertCalls();
    // One bulk episode upsert carrying all three rows...
    const bulkInsert = insertCalls.find((call: any) =>
      Array.isArray(call.payload),
    );
    expect(bulkInsert.payload).toHaveLength(3);
    // ...and exactly one activity row for the whole batch.
    const activityInserts = activityInsertsOf(insertCalls);
    expect(activityInserts).toHaveLength(1);
    expect(activityInserts[0].payload.metadata).toMatchObject({
      episodeCount: 3,
      watched: true,
    });
  });

  // LOGIC-02
  it("recomputes the show status for an all-unwatch batch", async () => {
    (db as any).__setMockResults([
      TIMEZONE_ROW,
      [
        { id: "ep-1", seasonNumber: 1, episodeNumber: 1, watched: false },
        { id: "ep-2", seasonNumber: 1, episodeNumber: 2, watched: false },
      ],
      [],
      undefined,
      // updateTVShowStatus: the show is currently completed
      [{ status: WatchStatus.COMPLETED, nextEpisodeDate: null }],
      // nothing is watched any more
      [],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      name: "Test Show",
      poster_path: null,
      last_episode_to_air: { season_number: 1, episode_number: 2 },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await batchUpdateEpisodes("u1", 100, [
      { seasonNumber: 1, episodeNumber: 1, watched: false },
      { seasonNumber: 1, episodeNumber: 2, watched: false },
    ]);

    // Before the fix a "reset season" batch found no watched episode and
    // skipped the recompute entirely, leaving the show on `completed`.
    expect(result.newStatus).toBe(WatchStatus.WATCHING);
    expect((db as any).__getUpdateCalls()[0].payload).toMatchObject({
      status: WatchStatus.WATCHING,
    });
  });

  it("recomputes batch status from the watched episodes even when the last payload item is unwatched", async () => {
    (db as any).__setMockResults([
      TIMEZONE_ROW,
      [
        { id: "ep-1", seasonNumber: 1, episodeNumber: 2, watched: true },
        { id: "ep-2", seasonNumber: 1, episodeNumber: 1, watched: false },
      ],
      [],
      // a mixed batch emits one summary row per direction
      undefined,
      undefined,
      [{ status: WatchStatus.WATCHING, nextEpisodeDate: null }],
      [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
      ],
      undefined,
      [],
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      name: "Test Show",
      poster_path: null,
      last_episode_to_air: { season_number: 1, episode_number: 2 },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
      ],
    });

    const result = await batchUpdateEpisodes("u1", 100, [
      { seasonNumber: 1, episodeNumber: 2, watched: true },
      { seasonNumber: 1, episodeNumber: 1, watched: false },
    ]);

    expect(result.newStatus).toBe(WatchStatus.COMPLETED);
    expect((db as any).__getDeleteCalls()).toHaveLength(1);
  });

  // DATA-04 / mixed batches
  it("reports a mixed batch as two accurate summary rows", async () => {
    (db as any).__setMockResults([
      TIMEZONE_ROW,
      [
        { id: "ep-1", seasonNumber: 1, episodeNumber: 1, watched: true },
        { id: "ep-2", seasonNumber: 1, episodeNumber: 2, watched: true },
        { id: "ep-3", seasonNumber: 1, episodeNumber: 3, watched: false },
      ],
      [],
      undefined,
      undefined,
      [{ status: WatchStatus.WATCHING, nextEpisodeDate: null }],
      [
        { seasonNumber: 1, episodeNumber: 1 },
        { seasonNumber: 1, episodeNumber: 2 },
      ],
      undefined,
    ]);

    (tmdbClient.getTVShowDetails as any).mockResolvedValue({
      name: "Test Show",
      poster_path: null,
      last_episode_to_air: { season_number: 1, episode_number: 3 },
      next_episode_to_air: null,
    });
    (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
      episodes: [
        { episode_number: 1, air_date: "2024-01-01" },
        { episode_number: 2, air_date: "2024-01-08" },
        { episode_number: 3, air_date: "2024-01-15" },
      ],
    });

    await batchUpdateEpisodes("u1", 100, [
      { seasonNumber: 1, episodeNumber: 1, watched: true },
      { seasonNumber: 1, episodeNumber: 2, watched: true },
      { seasonNumber: 1, episodeNumber: 3, watched: false },
    ]);

    const activityInserts = activityInsertsOf((db as any).__getInsertCalls());

    // `anyWatched` collapsed this into a single `watched: true` row with
    // `episodeCount: 3`, so the feed claimed three episodes had been watched
    // when one of them had just been un-watched.
    expect(activityInserts).toHaveLength(2);
    expect(activityInserts[0].payload.metadata).toMatchObject({
      watched: true,
      episodeCount: 2,
      seasonNumber: 1,
      episodeNumber: 2,
    });
    expect(activityInserts[1].payload.metadata).toMatchObject({
      watched: false,
      seasonNumber: 1,
      episodeNumber: 3,
    });
    // A single un-marked episode is not a "count" worth reporting.
    expect(activityInserts[1].payload.metadata.episodeCount).toBeUndefined();
  });

  // The collaborator sync and the activity insert are best-effort writes.
  it.each([
    ["collaborator sync", 2],
    ["activity insert", 3],
  ])(
    "keeps the episode writes when the %s fails",
    async (_label, failureIndex) => {
      const upserted = [
        { id: "ep-1", seasonNumber: 1, episodeNumber: 1, watched: true },
        { id: "ep-2", seasonNumber: 1, episodeNumber: 2, watched: true },
        { id: "ep-3", seasonNumber: 1, episodeNumber: 3, watched: true },
      ];

      const queue: any[] = [
        TIMEZONE_ROW,
        upserted,
        // collaborator sync: sync-enabled list lookup
        [],
        // activity insert
        undefined,
        // updateTVShowStatus: content status lookup
        [{ status: WatchStatus.WATCHING, nextEpisodeDate: null }],
        // progress state: only one episode is actually watched, so nothing
        // else about the show changes
        [{ seasonNumber: 1, episodeNumber: 1 }],
      ];
      queue[failureIndex] = { __reject: new Error("boom") };
      (db as any).__setMockResults(queue);

      (tmdbClient.getTVShowDetails as any).mockResolvedValue({
        name: "Test Show",
        poster_path: null,
        last_episode_to_air: { season_number: 1, episode_number: 3 },
        next_episode_to_air: null,
      });
      (tmdbClient.getTVSeasonDetails as any).mockResolvedValue({
        episodes: [
          { episode_number: 1, air_date: "2024-01-01" },
          { episode_number: 2, air_date: "2024-01-08" },
          { episode_number: 3, air_date: "2024-01-15" },
        ],
      });

      const result = await batchUpdateEpisodes("u1", 100, [
        { seasonNumber: 1, episodeNumber: 1, watched: true },
        { seasonNumber: 1, episodeNumber: 2, watched: true },
        { seasonNumber: 1, episodeNumber: 3, watched: true },
      ]);

      // These two writes swallow their own errors. Inside a transaction that
      // is fatal: Postgres aborts the transaction on the failed statement and
      // silently converts the COMMIT into a ROLLBACK, so the episode rows this
      // function claims to have written were never persisted and the route
      // still answered 200 with them.
      expect((db as any).__wasRolledBack()).toBe(false);
      const bulkInsert = (db as any)
        .__getInsertCalls()
        .find((call: any) => Array.isArray(call.payload));
      expect(bulkInsert?.payload).toHaveLength(3);
      expect(result.episodes).toEqual(upserted);
      expect(result.syncedCollaboratorIds).toEqual([]);
    },
  );

  it("is a no-op for an empty batch", async () => {
    const result = await batchUpdateEpisodes("u1", 100, []);

    expect(result).toEqual({
      episodes: [],
      newStatus: null,
      syncedCollaboratorIds: [],
    });
    expect((db as any).__getInsertCalls()).toHaveLength(0);
    expect(db.transaction as any).not.toHaveBeenCalled();
  });
});
