import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => {
  const resultsQueue: any[] = [];
  const insertCalls: Array<{ table: any; payload: any }> = [];
  const updateCalls: Array<{ table: any; payload: any }> = [];
  const deleteCalls: Array<{ table: any }> = [];

  const chain: any = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    set: (payload: any) => {
      (chain as any).__currentSetPayload = payload;
      return chain;
    },
    values: (payload: any) => {
      insertCalls.push({ table: (chain as any).__currentInsertTable, payload });
      return chain;
    },
    where: () => {
      if ((chain as any).__currentUpdateTable) {
        updateCalls.push({
          table: (chain as any).__currentUpdateTable,
          payload: (chain as any).__currentSetPayload,
        });
        (chain as any).__currentUpdateTable = undefined;
        (chain as any).__currentSetPayload = undefined;
      }
      if ((chain as any).__currentDeleteTable) {
        deleteCalls.push({ table: (chain as any).__currentDeleteTable });
        (chain as any).__currentDeleteTable = undefined;
      }
      return chain;
    },
    limit: () => Promise.resolve(resultsQueue.shift()),
    then: (resolve: any) => Promise.resolve(resultsQueue.shift()).then(resolve),
  };

  const db: any = {
    select: vi.fn(() => chain),
    insert: vi.fn((table: any) => {
      (chain as any).__currentInsertTable = table;
      return chain;
    }),
    update: vi.fn((table: any) => {
      (chain as any).__currentUpdateTable = table;
      return chain;
    }),
    delete: vi.fn((table: any) => {
      (chain as any).__currentDeleteTable = table;
      return chain;
    }),
    __setMockResults(arr: any[]) {
      resultsQueue.length = 0;
      resultsQueue.push(...arr);
    },
    __resetCalls() {
      insertCalls.length = 0;
      updateCalls.length = 0;
      deleteCalls.length = 0;
    },
    __getInsertCalls: () => insertCalls.slice(),
    __getUpdateCalls: () => updateCalls.slice(),
    __getDeleteCalls: () => deleteCalls.slice(),
  };

  return { db };
});

vi.mock("@/lib/db/schema", () => {
  return {
    listCollaborators: {} as any,
    listItems: {} as any,
    lists: {} as any,
    showSchedules: {} as any,
    userContentStatus: {} as any,
  };
});

import { db } from "@/lib/db";
import { showSchedules, userContentStatus } from "@/lib/db/schema";

import { syncStatusToCollaborators } from "./activityUtils";

describe("syncStatusToCollaborators", () => {
  beforeEach(() => {
    (db as any).__setMockResults([]);
    (db as any).__resetCalls();
    vi.clearAllMocks();
  });

  it("updates/inserts collaborator statuses and returns unique collaborator IDs", async () => {
    const syncEnabledLists = [{ listId: "list-1", ownerId: "owner-1" }];
    const collaborators = [{ userId: "collab-1" }];
    const existingStatus = [{ id: "status-1" }];
    const missingStatus: any[] = [];

    (db as any).__setMockResults([
      syncEnabledLists,
      collaborators,
      existingStatus,
      undefined,
      missingStatus,
      undefined,
    ]);

    const result = await syncStatusToCollaborators(
      "user-1",
      10,
      "movie",
      "completed"
    );

    expect(result.slice().sort()).toEqual(["collab-1", "owner-1"].sort());

    const updateCalls = (db as any).__getUpdateCalls() as Array<{
      table: any;
      payload: any;
    }>;
    const insertCalls = (db as any).__getInsertCalls() as Array<{
      table: any;
      payload: any;
    }>;

    expect(updateCalls.length).toBe(1);
    expect(updateCalls[0].table).toBe(userContentStatus);
    expect(updateCalls[0].payload.status).toBe("completed");

    expect(
      insertCalls.some(
        (c) =>
          c.table === userContentStatus &&
          c.payload.userId === "owner-1" &&
          c.payload.tmdbId === 10 &&
          c.payload.contentType === "movie"
      )
    ).toBe(true);
  });

  it("deletes collaborator schedules when syncing TV show to completed/dropped", async () => {
    const syncEnabledLists = [{ listId: "list-1", ownerId: "owner-1" }];
    const collaborators = [{ userId: "collab-1" }];
    const existingStatus = [{ id: "status-1" }];
    const existingStatus2 = [{ id: "status-2" }];

    (db as any).__setMockResults([
      syncEnabledLists,
      collaborators,
      existingStatus,
      undefined,
      undefined,
      existingStatus2,
      undefined,
      undefined,
    ]);

    const result = await syncStatusToCollaborators(
      "user-1",
      10,
      "tv",
      "completed"
    );

    expect(result.slice().sort()).toEqual(["collab-1", "owner-1"].sort());

    const deleteCalls = (db as any).__getDeleteCalls() as Array<{ table: any }>;
    expect(deleteCalls.length).toBe(2);
    expect(deleteCalls.every((c) => c.table === showSchedules)).toBe(true);
  });

  it("excludes the initiating user from syncing", async () => {
    const syncEnabledLists = [{ listId: "list-1", ownerId: "owner-1" }];
    const collaborators = [{ userId: "collab-1" }];
    const existingStatus = [{ id: "status-1" }];

    (db as any).__setMockResults([
      syncEnabledLists,
      collaborators,
      existingStatus,
      undefined,
    ]);

    const result = await syncStatusToCollaborators(
      "owner-1",
      10,
      "movie",
      "watching"
    );

    expect(result).toEqual(["collab-1"]);
  });

  it("returns [] when an error occurs", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (db.select as any).mockImplementationOnce(() => {
      throw new Error("db error");
    });

    const result = await syncStatusToCollaborators(
      "user-1",
      10,
      "movie",
      "completed"
    );
    expect(result).toEqual([]);
    errorSpy.mockRestore();
  });
});
