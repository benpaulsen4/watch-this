import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  lists,
  listItems,
  userContentStatus,
  episodeWatchStatus,
  activityFeed,
} from "@/lib/db/schema";

let listsJoinRows: any[] = [];
let contentStatusRows: any[] = [];
let episodeStatusRows: any[] = [];
let insertedLists: any[] = [];
let insertedItems: any[] = [];
let insertedContentStatuses: any[] = [];
let insertedEpisodeStatuses: any[] = [];
let insertedActivities: any[] = [];

vi.mock("@/lib/db", () => {
  return {
    db: {
      select: (sel?: any) => {
        const chain: any = {
          _table: undefined as any,
          from(table: any) {
            this._table = table;
            return this;
          },
          leftJoin() {
            return this;
          },
          where() {
            if (this._table === lists) return this;
            if (this._table === userContentStatus) return contentStatusRows;
            if (this._table === episodeWatchStatus) return episodeStatusRows;
            return listsJoinRows;
          },
          orderBy() {
            return listsJoinRows;
          },
        };
        return chain;
      },
      insert: (table: any) => {
        const chain: any = {
          values(vals: any) {
            if (table === lists) {
              insertedLists.push(vals);
              return {
                returning() {
                  return [{ id: "new-list-id" }];
                },
              };
            }
            if (table === listItems) {
              if (Array.isArray(vals)) {
                vals.forEach((v) => insertedItems.push(v));
              } else {
                insertedItems.push(vals);
              }
              return {} as any;
            }
            if (table === userContentStatus) {
              insertedContentStatuses.push(vals);
              return {
                onConflictDoUpdate() {
                  return {} as any;
                },
              };
            }
            if (table === episodeWatchStatus) {
              insertedEpisodeStatuses.push(vals);
              return {
                onConflictDoUpdate() {
                  return {} as any;
                },
              };
            }
            if (table === activityFeed) {
              insertedActivities.push(vals);
              return {} as any;
            }
            return {} as any;
          },
        };
        return chain;
      },
    },
  };
});

describe("data service", () => {
  beforeEach(() => {
    listsJoinRows = [];
    contentStatusRows = [];
    episodeStatusRows = [];
    insertedLists = [];
    insertedItems = [];
    insertedContentStatuses = [];
    insertedEpisodeStatuses = [];
    insertedActivities = [];
  });

  it("exports JSON", async () => {
    const now = new Date();
    listsJoinRows = [
      {
        listId: "l1",
        listName: "List",
        listDescription: null,
        listType: "mixed",
        isPublic: false,
        listCreatedAt: now,
        itemId: "i1",
        tmdbId: 10,
        contentType: "movie",
        title: "Title",
        posterPath: null,
        createdAt: now,
      },
    ];
    contentStatusRows = [
      {
        tmdbId: 10,
        contentType: "movie",
        status: "planning",
        nextEpisodeDate: null,
        updatedAt: now,
        createdAt: now,
      },
    ];
    episodeStatusRows = [
      {
        tmdbId: 20,
        seasonNumber: 1,
        episodeNumber: 1,
        watched: false,
        watchedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const svc = await import("./service");
    const res = await svc.exportUserData("u1", "user", "json");
    expect(typeof res).toBe("object");
    if (typeof res === "object" && "data" in res) {
      const parsed = JSON.parse(res.data as string);
      expect(parsed.user.username).toBe("user");
      expect(parsed.lists.length).toBe(1);
      expect(parsed.contentStatus.length).toBe(1);
      expect(parsed.episodeWatchStatus.length).toBe(1);
    }
  });

  it("exports ZIP CSV", async () => {
    listsJoinRows = [];
    contentStatusRows = [];
    episodeStatusRows = [];
    const svc = await import("./service");
    const res = await svc.exportUserData("u1", "user", "csv");
    expect(res !== "zipFailed").toBe(true);
    if (res !== "zipFailed") {
      expect(res.isZip).toBe(true);
      expect(res.filename.endsWith(".zip")).toBe(true);
      expect(typeof res.data).toBe("string");
      expect(res.data.length > 0).toBe(true);
    }
  });

  it("imports JSON", async () => {
    const json = {
      lists: [
        {
          name: "L",
          description: null,
          type: "mixed",
          isPublic: false,
          items: [
            {
              title: "T",
              tmdbId: 1,
              contentType: "movie",
            },
          ],
        },
      ],
      contentStatus: [
        {
          tmdbId: 2,
          contentType: "movie",
          status: "planning",
        },
      ],
      episodeWatchStatus: [
        {
          tmdbId: 3,
          seasonNumber: 1,
          episodeNumber: 1,
          watched: true,
        },
      ],
    };
    const svc = await import("./service");
    const res = await svc.importUserData("u1", JSON.stringify(json), "json");
    expect(typeof res).toBe("object");
    if (typeof res === "object") {
      expect(res.success).toBe(true);
      expect(res.imported.lists).toBe(1);
      expect(res.imported.contentStatus).toBe(1);
      expect(res.imported.episodeStatus).toBe(1);
      expect(insertedLists.length).toBe(1);
      expect(insertedItems.length).toBe(1);
      expect(insertedContentStatuses.length).toBe(1);
      expect(insertedEpisodeStatuses.length).toBe(1);
    }
  });

  it("handles parse error", async () => {
    const svc = await import("./service");
    const res = await svc.importUserData("u1", "{", "json");
    expect(res).toBe("parseError");
  });
});
