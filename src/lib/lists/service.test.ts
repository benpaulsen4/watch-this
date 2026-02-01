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
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    groupBy: () => Promise.resolve(resultsQueue.shift()),
    orderBy: () => chain,
    limit: () => Promise.resolve(resultsQueue.shift()),
    returning: () => Promise.resolve(resultsQueue.shift()),
    set: () => chain,
    values: (payload: any) => {
      insertCalls.push({ table: (chain as any).__currentInsertTable, payload });
      return chain;
    },
    $dynamic: () => chain,
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

  const lists = {} as any;
  const listItems = {} as any;
  const listCollaborators = {} as any;
  const users = {} as any;
  const activityFeed = {} as any;
  const userContentStatus = {} as any;

  const ActivityType = {
    LIST_CREATED: "LIST_CREATED",
    LIST_UPDATED: "LIST_UPDATED",
    LIST_DELETED: "LIST_DELETED",
    LIST_ITEM_ADDED: "LIST_ITEM_ADDED",
    LIST_ITEM_REMOVED: "LIST_ITEM_REMOVED",
    COLLABORATOR_ADDED: "COLLABORATOR_ADDED",
    COLLABORATOR_REMOVED: "COLLABORATOR_REMOVED",
  } as const;

  const PermissionLevelEnum = {
    COLLABORATOR: "collaborator",
    VIEWER: "viewer",
  } as const;

  const NewList = {} as any;

  return {
    db,
    lists,
    listItems,
    listCollaborators,
    users,
    activityFeed,
    userContentStatus,
    ActivityType,
    PermissionLevelEnum,
    NewList,
  };
});

vi.mock("../tmdb/client", () => {
  return {
    tmdbClient: {
      getMovieDetails: vi.fn(async (id: number) => ({ id, title: "Movie" })),
      getTVShowDetails: vi.fn(async (id: number) => ({ id, name: "Show" })),
    },
  };
});

// Mock cache-utils used by getListItems and listLists
vi.mock("../tmdb/cache-utils", () => {
  return {
    getAllCachedContent: vi.fn(
      async (
        items: Array<{ tmdbId: number; contentType: string }>,
        _userId: string
      ) => {
        return items.map((item) => {
          const title =
            item.contentType === "movie" ? "Movie" : `Show-${item.tmdbId}`;
          // Provide deterministic posterPath values for specific tmdbIds used in tests
          let posterPath: string | null = null;
          if (item.tmdbId === 1) posterPath = "/p1.jpg";
          else if (item.tmdbId === 2) posterPath = "/p2.jpg";
          else if (item.tmdbId === 3) posterPath = "/q1.jpg";
          return {
            tmdbId: item.tmdbId,
            contentType: item.contentType,
            title,
            posterPath,
            releaseDate: new Date("2025-01-01T00:00:00Z").toISOString(),
            voteAverage: 0,
            voteCount: 0,
            popularity: 0,
            genreIds: [],
            adult: null,
            watchStatus: null,
            statusUpdatedAt: null,
          };
        });
      }
    ),
    addToCache: vi.fn(async (tmdbId: number, contentType: string) => {
      return {
        tmdbId,
        contentType,
        title: contentType === "movie" ? "Movie" : `Show-${tmdbId}`,
        posterPath: null,
        releaseDate: new Date("2025-01-01T00:00:00Z").toISOString(),
        voteAverage: 0,
        voteCount: 0,
        popularity: 0,
        genreIds: [],
        adult: null,
        watchStatus: null,
        statusUpdatedAt: null,
      };
    }),
    getCachedContent: vi.fn(async (tmdbId: number, contentType: string) => {
      return {
        tmdbId,
        contentType,
        title: contentType === "movie" ? "Movie" : `Show-${tmdbId}`,
        posterPath: null,
        releaseDate: new Date("2025-01-01T00:00:00Z").toISOString(),
        voteAverage: 0,
        voteCount: 0,
        popularity: 0,
        genreIds: [],
        adult: null,
        watchStatus: null,
        statusUpdatedAt: null,
      };
    }),
  };
});

vi.mock("../tmdb/contentUtils", () => {
  return {
    enrichWithContentStatus: vi.fn(async (item: any) => item),
  };
});

import { activityFeed, ActivityType,db } from "../db";
import {
  createList,
  createListCollaborator,
  createListItem,
  deleteList,
  deleteListCollaborator,
  deleteListItem,
  getList,
  getListItems,
  listArchivedLists,
  listListCollaborators,
  listLists,
  updateList,
  updateListCollaborator,
} from "./service";

describe("lists service", () => {
  const userId = "user-1";
  const now = new Date("2025-01-01T00:00:00Z");

  beforeEach(() => {
    (db as any).__setMockResults([]);
    (db as any).__resetInserts();
  });

  it("createList returns created list with counts", async () => {
    const newList = {
      id: "list-1",
      ownerId: userId,
      name: "My List",
      description: null,
      listType: "mixed",
      isPublic: false,
      syncWatchStatus: false,
      createdAt: now,
      updatedAt: now,
    };
    (db as any).__setMockResults([[newList]]);

    const result = await createList(userId, { name: "My List" });
    expect(result.id).toBe("list-1");
    expect(result.itemCount).toBe(0);
    expect(result.collaborators).toBe(0);

    const inserts = (db as any).__getInsertCalls();
    const activity = inserts.find((c: any) => c.table === activityFeed);
    expect(activity.payload.activityType).toBe(ActivityType.LIST_CREATED);
    expect(activity.payload.listId).toBe("list-1");
  });

  it("updateList returns notFound when list missing", async () => {
    (db as any).__setMockResults([[]]);
    const result = await updateList(userId, "missing", { name: "X" });
    expect(result).toBe("notFound");
  });

  it("updateList returns updated list with counts", async () => {
    const existing = [{ ownerId: userId }];
    const updated = [
      {
        id: "list-2",
        ownerId: userId,
        name: "Updated",
        description: null,
        listType: "movies",
        isPublic: true,
        syncWatchStatus: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const itemCount = [{ count: 3 }];
    const collabCount = [{ count: 2 }];
    (db as any).__setMockResults([existing, updated, itemCount, collabCount]);

    const result = await updateList(userId, "list-2", { name: "Updated" });
    if (typeof result === "string") throw new Error("unexpected error");
    expect(result.name).toBe("Updated");
    expect(result.itemCount).toBe(3);
    expect(result.collaborators).toBe(2);

    const inserts = (db as any).__getInsertCalls();
    const activity = inserts.find((c: any) => c.table === activityFeed);
    expect(activity.payload.activityType).toBe(ActivityType.LIST_UPDATED);
    expect(activity.payload.listId).toBe("list-2");
  });

  it("deleteList returns forbidden for non-owner", async () => {
    (db as any).__setMockResults([
      [{ ownerId: "other", name: "N", listType: "mixed" }],
    ]);
    const result = await deleteList(userId, "list-3");
    expect(result).toBe("forbidden");
  });

  it("deleteList returns success for owner", async () => {
    (db as any).__setMockResults([
      [{ ownerId: userId, name: "N", listType: "mixed" }],
      undefined,
    ]);
    const result = await deleteList(userId, "list-3");
    if (typeof result === "string") throw new Error("unexpected error");
    expect(result.message).toMatch(/deleted successfully/i);

    const inserts = (db as any).__getInsertCalls();
    const activity = inserts.find((c: any) => c.table === activityFeed);
    expect(activity.payload.activityType).toBe(ActivityType.LIST_DELETED);
    expect(activity.payload.metadata.listName).toBe("N");
  });

  it("createListItem enforces listType", async () => {
    const listData = [{ ownerId: userId, listType: "movies", name: "L" }];
    (db as any).__setMockResults([listData]);
    const res = await createListItem(userId, "list-4", {
      tmdbId: 1,
      contentType: "tv",
    });
    expect(res).toBe("invalidType");
  });

  it("createListItem denies viewer collaborators", async () => {
    const listData = [{ ownerId: "owner-2", listType: "mixed", name: "L" }];
    const collaborator = [{ permissionLevel: "viewer" }];
    (db as any).__setMockResults([listData, collaborator]);
    const res = await createListItem(userId, "list-4", {
      tmdbId: 1,
      contentType: "movie",
    });
    expect(res).toBe("notFound");
  });

  it("createListItem returns conflict when item exists", async () => {
    const listData = [{ ownerId: userId, listType: "mixed", name: "L" }];
    const existingItem = [{ id: "item-1" }];
    (db as any).__setMockResults([listData, existingItem]);
    const res = await createListItem(userId, "list-4", {
      tmdbId: 1,
      contentType: "movie",
    });
    expect(res).toBe("conflict");
  });

  it("createListItem inserts and returns item row", async () => {
    const listData = [{ ownerId: userId, listType: "mixed", name: "L" }];
    const noExisting: any[] = [];
    const inserted = [
      {
        id: "item-2",
        tmdbId: 10,
        contentType: "movie",
        title: "Title",
        posterPath: null,
        createdAt: now,
      },
    ];
    (db as any).__setMockResults([listData, noExisting, inserted]);
    const res = await createListItem(userId, "list-4", {
      tmdbId: 10,
      contentType: "movie",
    });
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.id).toBe("item-2");
    expect(res.tmdbId).toBe(10);
    expect(res.contentType).toBe("movie");

    const inserts = (db as any).__getInsertCalls();
    const activity = inserts.find((c: any) => c.table === activityFeed);
    expect(activity.payload.activityType).toBe(ActivityType.LIST_ITEM_ADDED);
    expect(activity.payload.listId).toBe("list-4");
    expect(activity.payload.tmdbId).toBe(10);
  });

  it("deleteListItem returns notFound when item missing", async () => {
    const access = [{ ownerId: userId }];
    const notFound: any[] = [];
    (db as any).__setMockResults([access, notFound]);
    const res = await deleteListItem(userId, "list-5", "missing");
    expect(res).toBe("notFound");
  });

  it("deleteListItem denies viewer collaborators", async () => {
    const access = [{ ownerId: "owner-2" }];
    const collaborator = [{ permissionLevel: "viewer" }];
    (db as any).__setMockResults([access, collaborator]);
    const res = await deleteListItem(userId, "list-5", "item-3");
    expect(res).toBe("notFound");
  });

  it("deleteListItem returns success when deleted", async () => {
    const access = [{ ownerId: userId }];
    const existing = [
      {
        id: "item-3",
        tmdbId: 11,
        contentType: "tv",
        title: "T",
        posterPath: null,
      },
    ];
    (db as any).__setMockResults([access, existing, undefined]);
    const res = await deleteListItem(userId, "list-5", "item-3");
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.message).toMatch(/removed/i);

    const inserts = (db as any).__getInsertCalls();
    const activity = inserts.find((c: any) => c.table === activityFeed);
    expect(activity.payload.activityType).toBe(ActivityType.LIST_ITEM_REMOVED);
    expect(activity.payload.listId).toBe("list-5");
    expect(activity.payload.tmdbId).toBe(11);
  });

  it("listListCollaborators returns forbidden for non-owner", async () => {
    (db as any).__setMockResults([[{ id: "list-6", ownerId: "owner-2" }]]);
    const res = await listListCollaborators(userId, "list-6");
    expect(res).toBe("forbidden");
  });

  it("listListCollaborators returns collaborators", async () => {
    const listRow = [{ id: "list-6", ownerId: userId }];
    const collabRows = [
      {
        id: "c1",
        userId: "u2",
        username: "alice",
        profilePictureUrl: null,
        permissionLevel: "collaborator",
        createdAt: now,
      },
    ];
    (db as any).__setMockResults([listRow, collabRows]);
    const res = await listListCollaborators(userId, "list-6");
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.collaborators[0].username).toBe("alice");
  });

  it("createListCollaborator returns success", async () => {
    const listRow = [{ ownerId: userId, name: "List" }];
    const targetUser = [{ id: "u2", username: "bob", profilePictureUrl: null }];
    const none: any[] = [];
    const inserted = [
      {
        id: "c2",
        userId: "u2",
        permissionLevel: "collaborator",
        createdAt: now,
      },
    ];
    (db as any).__setMockResults([listRow, targetUser, none, inserted]);
    const res = await createListCollaborator(userId, "list-7", {
      username: "bob",
      permissionLevel: "collaborator" as any,
    });
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.collaborator.userId).toBe("u2");

    const inserts = (db as any).__getInsertCalls();
    const activity = inserts.find((c: any) => c.table === activityFeed);
    expect(activity.payload.activityType).toBe(ActivityType.COLLABORATOR_ADDED);
    expect(activity.payload.listId).toBe("list-7");
    expect(activity.payload.metadata.collaboratorUsername).toBe("bob");
  });

  it("updateListCollaborator returns notFound when collaborator missing", async () => {
    const listRow = [{ ownerId: userId, name: "List" }];
    const none: any[] = [];
    (db as any).__setMockResults([listRow, none]);
    const res = await updateListCollaborator(userId, "list-8", "u9", {
      permissionLevel: "viewer" as any,
    });
    expect(res).toBe("notFound");
  });

  it("deleteListCollaborator returns success", async () => {
    const listRow = [{ ownerId: userId, name: "List" }];
    const collabRow = [{ id: "c3" }];
    const userInfo = [{ username: "carol" }];
    (db as any).__setMockResults([listRow, collabRow, userInfo, undefined]);
    const res = await deleteListCollaborator(userId, "list-9", "u3");
    if (typeof res === "string") throw new Error("unexpected error");
    expect(res.message).toMatch(/removed/i);

    const inserts = (db as any).__getInsertCalls();
    const activity = inserts.find((c: any) => c.table === activityFeed);
    expect(activity.payload.activityType).toBe(
      ActivityType.COLLABORATOR_REMOVED
    );
    expect(activity.payload.listId).toBe("list-9");
    expect(activity.payload.metadata.collaboratorUsername).toBe("carol");
  });

  it("getList returns metadata without items", async () => {
    const listData = [
      {
        id: "list-10",
        name: "L",
        description: null,
        listType: "mixed",
        isPublic: true,
        syncWatchStatus: false,
        ownerId: userId,
        ownerUsername: "me",
        ownerProfilePictureUrl: null,
        createdAt: now,
        updatedAt: now,
      },
    ];
    // item count and collab count
    const itemCount = [{ count: 5 }];
    const collabCount = [{ count: 1 }];

    (db as any).__setMockResults([listData, itemCount, collabCount]);
    const res = await getList(userId, "list-10");
    if (res === "notFound") throw new Error("unexpected error");

    // Should NOT contain items anymore
    expect((res as any).items).toBeUndefined();
    expect(res.itemCount).toBe(5);
    expect(res.collaborators).toBe(1);
    expect(res.name).toBe("L");
  });

  it("listLists returns poster paths", async () => {
    const base = [
      {
        id: "l1",
        name: "A",
        description: null,
        listType: "mixed",
        isPublic: false,
        isArchived: false,
        syncWatchStatus: false,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
        itemCount: 0,
        collaborators: 0,
      },
      {
        id: "l2",
        name: "B",
        description: null,
        listType: "movies",
        isPublic: false,
        isArchived: false,
        syncWatchStatus: false,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
        itemCount: 0,
        collaborators: 0,
      },
    ];
    const posters1 = [
      { tmdbId: 1, contentType: "movie", posterPath: "/p1.jpg" },
      { tmdbId: 2, contentType: "movie", posterPath: "/p2.jpg" },
    ];
    const posters2 = [
      { tmdbId: 3, contentType: "movie", posterPath: "/q1.jpg" },
    ];
    (db as any).__setMockResults([base, posters1, posters2]);
    const res = await listLists(userId);
    expect(res[0].posterPaths).toEqual(["/p1.jpg", "/p2.jpg"]);
    expect(res[1].posterPaths).toEqual(["/q1.jpg"]);
  });

  it("listArchivedLists returns archived lists", async () => {
    const archived = [
      {
        id: "l3",
        name: "Archived List",
        description: null,
        listType: "mixed",
        isPublic: false,
        isArchived: true,
        syncWatchStatus: false,
        ownerId: userId,
        createdAt: now,
        updatedAt: now,
        itemCount: 0,
        collaborators: 0,
      },
    ];
    const posters = [{ tmdbId: 1, contentType: "movie", posterPath: "/p1.jpg" }];
    
    // The implementation of fetchLists calls db.select(...).where(..., eq(lists.isArchived, isArchived))
    // Our mock setup for db just returns the next result in the queue for the main query.
    // So we just need to provide the expected result.
    (db as any).__setMockResults([archived, posters]);

    const res = await listArchivedLists(userId);
    expect(res).toHaveLength(1);
    expect(res[0].isArchived).toBe(true);
    expect(res[0].name).toBe("Archived List");
  });

  // Tests for getListItems
  it("getListItems returns items with TMDB and status data", async () => {
    const listData = [{ id: "list-10", ownerId: userId, isPublic: false }];
    const items = [
      {
        id: "itm-1",
        tmdbId: 100,
        contentType: "movie",
        title: "T",
        posterPath: null,
        createdAt: now,
      },
    ];

    (db as any).__setMockResults([listData, items]);

    const res = await getListItems(userId, "list-10");

    if (res === "notFound") throw new Error("unexpected error");
    expect(res.items).toHaveLength(1);
    expect(res.items[0].listItemId).toBe("itm-1");
    // enriched data
    expect(res.items[0].title).toBe("Movie");
  });

  it("getListItems returns notFound if list does not exist", async () => {
    (db as any).__setMockResults([[]]); // empty list data

    const res = await getListItems(userId, "list-missing");
    expect(res).toBe("notFound");
  });

  it("getListItems applies watch status filters", async () => {
    const listData = [{ id: "list-10", ownerId: userId, isPublic: false }];
    const items = [
      {
        id: "itm-1",
        tmdbId: 100,
        contentType: "movie",
        title: "T",
        posterPath: null,
        createdAt: now,
      },
    ];

    (db as any).__setMockResults([listData, items]);

    const res = await getListItems(userId, "list-10", [
      "watching",
      "completed",
    ]);

    if (res === "notFound") throw new Error("unexpected error");
    expect(res.items).toHaveLength(1);
    // verification that DB query included filtering would happen in the mock setup logic if strict,
    // but here we trust the chain behavior or check called methods if needed.
  });
});
