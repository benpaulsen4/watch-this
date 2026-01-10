import { beforeEach, describe, expect, it, vi } from "vitest";

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

  const showSchedules = {} as any;
  const userContentStatus = {} as any;
  const ContentType = { MOVIE: "movie", TV: "tv" } as const;

  return {
    db,
    showSchedules,
    userContentStatus,
    ContentType,
  };
});

vi.mock("../tmdb/client", () => {
  return {
    tmdbClient: {
      getTVShowDetails: vi.fn(async (id: number) => {
        if (id === 999) throw new Error("tmdb error");
        return { id, name: `Show-${id}` };
      }),
    },
  };
});

// Mock cache-utils to avoid relying on tmdbCache table and complex DB chains
vi.mock("../tmdb/cache-utils", async () => {
  const { tmdbClient } = await import("../tmdb/client");
  return {
    getAllCachedContent: vi.fn(
      async (toFetch: Array<{ tmdbId: number }>, _userId: string) => {
        const results: any[] = [];
        for (const item of toFetch) {
          try {
            const details = await tmdbClient.getTVShowDetails(item.tmdbId);
            results.push({ tmdbId: item.tmdbId, title: details.name });
          } catch {
            results.push({ tmdbId: item.tmdbId, title: null });
          }
        }
        return results;
      }
    ),
    getCachedContent: vi.fn(async (tmdbId: number) => {
      try {
        const details = await tmdbClient.getTVShowDetails(tmdbId);
        return { tmdbId, title: details.name } as any;
      } catch {
        return { tmdbId, title: null } as any;
      }
    }),
  };
});

import { db } from "../db";
import { tmdbClient } from "../tmdb/client";
import { createSchedule, deleteSchedules,listSchedules } from "./service";

describe("schedules service", () => {
  const userId = "user-1";
  const now = new Date("2025-01-01T00:00:00Z");

  beforeEach(() => {
    (db as any).__setMockResults([]);
    (db as any).__resetInserts();
    vi.clearAllMocks();
  });

  it("listSchedules groups by day and resolves titles", async () => {
    const rows = [
      { id: "a", userId, tmdbId: 1, dayOfWeek: 1, createdAt: now },
      { id: "b", userId, tmdbId: 2, dayOfWeek: 1, createdAt: now },
      { id: "c", userId, tmdbId: 3, dayOfWeek: 2, createdAt: now },
      { id: "d", userId, tmdbId: 999, dayOfWeek: 2, createdAt: now },
    ];
    (db as any).__setMockResults([rows]);

    const res = await listSchedules(userId);
    expect(res.totalShows).toBe(4);
    expect(res.schedules[1].length).toBe(2);
    expect(res.schedules[2].length).toBe(2);
    expect(res.schedules[1][0].title).toBe("Show-1");
    expect(res.schedules[2][1].title).toBeNull();
  });

  it("createSchedule returns notFound when show not in library", async () => {
    const contentMissing: any[] = [];
    (db as any).__setMockResults([contentMissing]);
    const res = await createSchedule(userId, { tmdbId: 10, dayOfWeek: 3 });
    expect(res).toBe("notFound");
  });

  it("createSchedule enforces valid status", async () => {
    const contentStatus = [{ status: "completed" }];
    (db as any).__setMockResults([contentStatus]);
    const res = await createSchedule(userId, { tmdbId: 10, dayOfWeek: 3 });
    expect(res).toBe("invalidStatus");
  });

  it("createSchedule prevents duplicates", async () => {
    const contentStatus = [{ status: "watching" }];
    const existing = [{}];
    (db as any).__setMockResults([contentStatus, existing]);
    const res = await createSchedule(userId, { tmdbId: 10, dayOfWeek: 3 });
    expect(res).toBe("duplicate");
  });

  it("createSchedule inserts and returns ScheduleItem with title", async () => {
    const contentStatus = [{ status: "watching" }];
    const none: any[] = [];
    const inserted = [
      { id: "sch-1", userId, tmdbId: 10, dayOfWeek: 3, createdAt: now },
    ];
    (db as any).__setMockResults([contentStatus, none, inserted]);
    const res = await createSchedule(userId, { tmdbId: 10, dayOfWeek: 3 });
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.id).toBe("sch-1");
    expect(res.tmdbId).toBe(10);
    expect(typeof res.createdAt).toBe("string");
    expect(res.title).toBe("Show-10");
    expect((tmdbClient.getTVShowDetails as any).mock.calls.length).toBe(1);
  });

  it("deleteSchedules returns notFound when none deleted", async () => {
    const none: any[] = [];
    (db as any).__setMockResults([none]);
    const res = await deleteSchedules(userId, 10, 3);
    expect(res).toBe("notFound");
  });

  it("deleteSchedules returns message and deleted rows", async () => {
    const deleted = [
      { id: "x", userId, tmdbId: 10, dayOfWeek: 3, createdAt: now },
      { id: "y", userId, tmdbId: 10, dayOfWeek: 4, createdAt: now },
    ];
    (db as any).__setMockResults([deleted]);
    const res = await deleteSchedules(userId, 10);
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.message).toMatch(/Removed 2 schedule/);
    expect(res.deletedSchedules[0].id).toBe("x");
    expect(typeof res.deletedSchedules[0].createdAt).toBe("string");
  });
});
