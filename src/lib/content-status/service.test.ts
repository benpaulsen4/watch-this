import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const resultsQueue: any[] = [];
  const setResults = (arr: any[]) => {
    resultsQueue.length = 0;
    resultsQueue.push(...arr);
  };
  const insertCalls: Array<{ table: any; payload: any }> = [];
  // DATA-07(d): records every write and whether it ran inside a transaction.
  const opLog: Array<{ op: string; table: any; inTransaction: boolean }> = [];
  let inTransaction = false;
  let throwOnDelete = false;

  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => {
      if ((chain as any).__pendingOp === "delete" && throwOnDelete) {
        (chain as any).__pendingOp = undefined;
        return Promise.reject(new Error("delete failed"));
      }
      (chain as any).__pendingOp = undefined;
      return chain;
    },
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
      opLog.push({ op: "insert", table, inTransaction });
      return chain;
    }),
    update: vi.fn((table: any) => {
      opLog.push({ op: "update", table, inTransaction });
      return chain;
    }),
    delete: vi.fn((table: any) => {
      opLog.push({ op: "delete", table, inTransaction });
      (chain as any).__pendingOp = "delete";
      return chain;
    }),
  };
  db.transaction = vi.fn(async (fn: (tx: any) => Promise<unknown>) => {
    inTransaction = true;
    try {
      return await fn(db);
    } finally {
      inTransaction = false;
    }
  });

  (db as any).__setMockResults = setResults;
  (db as any).__getInsertCalls = () => insertCalls.slice();
  (db as any).__getOpLog = () => opLog.slice();
  (db as any).__setThrowOnDelete = (v: boolean) => {
    throwOnDelete = v;
  };
  (db as any).__resetInserts = () => {
    insertCalls.length = 0;
    opLog.length = 0;
    throwOnDelete = false;
    inTransaction = false;
    db.select.mockClear();
    db.insert.mockClear();
    db.update.mockClear();
    db.delete.mockClear();
    db.transaction.mockClear();
  };

  return { db };
});

vi.mock("@/lib/activity/activityUtils", () => {
  return {
    syncStatusToCollaborators: vi.fn(async () => ["c1", "c2"]),
  };
});

vi.mock("@/lib/tmdb/client", () => {
  return {
    tmdbClient: {
      getMovieDetails: vi.fn(async (id: number) => ({
        id,
        title: "M",
        poster_path: "/p.jpg",
      })),
      getTVShowDetails: vi.fn(async (id: number) => ({
        id,
        name: "S",
        poster_path: "/q.jpg",
      })),
    },
  };
});

vi.mock("@/lib/db/schema", () => {
  const userContentStatus = {} as any;
  const showSchedules = {} as any;
  const activityFeed = {} as any;
  const ContentType = { MOVIE: "movie", TV: "tv" } as const;
  const MovieWatchStatus = {
    PLANNING: "planning",
    COMPLETED: "completed",
  } as const;
  const TVWatchStatus = {
    PLANNING: "planning",
    WATCHING: "watching",
    PAUSED: "paused",
    COMPLETED: "completed",
    DROPPED: "dropped",
  } as const;
  return {
    userContentStatus,
    showSchedules,
    activityFeed,
    ContentType,
    MovieWatchStatus,
    TVWatchStatus,
  };
});

import { db } from "@/lib/db";
import { activityFeed, showSchedules, userContentStatus } from "@/lib/db/schema";
import { tmdbClient } from "@/lib/tmdb/client";

import {
  createOrUpdateContentStatus,
  deleteContentStatus,
  getContentStatus,
  updateContentStatus,
} from "./service";

describe("content-status service", () => {
  const userId = "u1";
  const now = new Date("2025-01-01T00:00:00Z");

  beforeEach(() => {
    (db as any).__setMockResults([]);
    (db as any).__resetInserts();
  });

  it("createOrUpdate inserts new status and logs activity", async () => {
    const inserted = [
      {
        id: "cs1",
        userId,
        tmdbId: 10,
        contentType: "movie",
        status: "completed",
        nextEpisodeDate: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    (db as any).__setMockResults([[], inserted]);
    const res = await createOrUpdateContentStatus(userId, {
      tmdbId: 10,
      contentType: "movie",
      status: "completed",
    } as any);
    if (res === "notFound") throw new Error("unexpected");
    expect(res.status.id).toBe("cs1");
    expect(typeof res.status.createdAt).toBe("string");
    const calls = (db.insert as any).mock.calls;
    const activityCall = calls.find((c: any[]) => c[0] === activityFeed);
    expect(activityCall).toBeTruthy();
  });

  it("createOrUpdate returns notFound for missing TMDB", async () => {
    (tmdbClient.getMovieDetails as any).mockRejectedValueOnce(new Error("404"));
    const result = await createOrUpdateContentStatus(userId, {
      tmdbId: 11,
      contentType: "movie",
      status: "completed",
    } as any);
    expect(result).toBe("notFound");
  });

  it("getContentStatus returns mapped row", async () => {
    const row = [
      {
        id: "cs2",
        userId,
        tmdbId: 20,
        contentType: "tv",
        status: "watching",
        nextEpisodeDate: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    (db as any).__setMockResults([row]);
    const res = await getContentStatus(userId, 20, "tv");
    expect(res.status?.id).toBe("cs2");
    expect(typeof res.status?.createdAt).toBe("string");
  });

  it("updateContentStatus returns notFound when missing", async () => {
    (db as any).__setMockResults([[]]);
    const result = await updateContentStatus(userId, {
      tmdbId: 30,
      contentType: "tv",
      status: "completed",
    } as any);
    expect(result).toBe("notFound");
  });

  it("updateContentStatus updates and logs activity for TV", async () => {
    const existing = [[{ id: "cs3" }]];
    const updated = [
      {
        id: "cs3",
        userId,
        tmdbId: 40,
        contentType: "tv",
        status: "completed",
        createdAt: now,
        updatedAt: now,
      },
    ];
    (db as any).__setMockResults([existing[0], updated]);
    const res = await updateContentStatus(userId, {
      tmdbId: 40,
      contentType: "tv",
      status: "completed",
    } as any);
    if (res === "notFound") throw new Error("unexpected");
    expect(res.status.id).toBe("cs3");
    const calls = (db.insert as any).mock.calls;
    const activityCall = calls.find((c: any[]) => c[0] === activityFeed);
    expect(activityCall).toBeTruthy();
  });

  // DATA-07(d): a TV show moving to completed/dropped must not be able to leave
  // its schedules behind. Before the fix the schedule delete ran in its own
  // swallowing try/catch *after* an already-committed status write.
  it("updateContentStatus clears schedules inside the same transaction (DATA-07d)", async () => {
    (db as any).__setMockResults([
      [{ id: "cs5" }],
      [
        {
          id: "cs5",
          userId,
          tmdbId: 41,
          contentType: "tv",
          status: "completed",
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]);

    await updateContentStatus(userId, {
      tmdbId: 41,
      contentType: "tv",
      status: "completed",
    } as any);

    const ops = (db as any).__getOpLog();
    const statusWrite = ops.find(
      (o: any) => o.op === "update" && o.table === userContentStatus
    );
    const scheduleDelete = ops.find(
      (o: any) => o.op === "delete" && o.table === showSchedules
    );

    expect(statusWrite?.inTransaction).toBe(true);
    expect(scheduleDelete?.inTransaction).toBe(true);
    expect((db as any).transaction).toHaveBeenCalledTimes(1);
  });

  it("updateContentStatus surfaces a failed schedule cleanup instead of swallowing it", async () => {
    (db as any).__setMockResults([
      [{ id: "cs6" }],
      [
        {
          id: "cs6",
          userId,
          tmdbId: 42,
          contentType: "tv",
          status: "completed",
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]);
    (db as any).__setThrowOnDelete(true);

    await expect(
      updateContentStatus(userId, {
        tmdbId: 42,
        contentType: "tv",
        status: "completed",
      } as any)
    ).rejects.toThrow(/delete failed/);
  });

  it("createOrUpdateContentStatus clears schedules inside the same transaction (DATA-07d)", async () => {
    (db as any).__setMockResults([
      [],
      [
        {
          id: "cs7",
          userId,
          tmdbId: 43,
          contentType: "tv",
          status: "dropped",
          createdAt: now,
          updatedAt: now,
        },
      ],
    ]);

    await createOrUpdateContentStatus(userId, {
      tmdbId: 43,
      contentType: "tv",
      status: "dropped",
    } as any);

    const ops = (db as any).__getOpLog();
    const statusWrite = ops.find(
      (o: any) => o.op === "insert" && o.table === userContentStatus
    );
    const scheduleDelete = ops.find(
      (o: any) => o.op === "delete" && o.table === showSchedules
    );

    expect(statusWrite?.inTransaction).toBe(true);
    expect(scheduleDelete?.inTransaction).toBe(true);
    // The activity entry is written after the transaction commits, not inside.
    const activityWrite = ops.find(
      (o: any) => o.op === "insert" && o.table === activityFeed
    );
    expect(activityWrite?.inTransaction).toBe(false);
  });

  it("deleteContentStatus returns notFound when missing", async () => {
    (db as any).__setMockResults([[]]);
    const res = await deleteContentStatus(userId, 50, "movie");
    expect(res).toBe("notFound");
  });

  it("deleteContentStatus returns success when existing", async () => {
    (db as any).__setMockResults([[{ id: "cs4" }], undefined]);
    const res = await deleteContentStatus(userId, 51, "movie");
    if (res === "notFound") throw new Error("unexpected");
    expect(res.message).toMatch(/removed/i);
  });
});
