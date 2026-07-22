import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addToCache } from "@/lib/tmdb/cache-utils";

import { exportUserData, importUserData } from "./service";

// Define mock DB using vi.hoisted to share between mock factory and tests
const { mockedDb } = vi.hoisted(() => ({
  mockedDb: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

// Mock schema
vi.mock("@/lib/db/schema", () => {
  const createMockTable = (name: string) =>
    new Proxy(
      {},
      {
        get: (_, prop) => {
          if (prop === "then") return undefined;
          return `${name}.${String(prop)}`;
        },
      }
    );

  return {
    lists: createMockTable("lists"),
    listItems: createMockTable("listItems"),
    userContentStatus: createMockTable("userContentStatus"),
    episodeWatchStatus: createMockTable("episodeWatchStatus"),
    showSchedules: createMockTable("showSchedules"),
    tmdbCache: createMockTable("tmdbCache"),
    activityFeed: createMockTable("activityFeed"),
    ListType: { MOVIE: "movies", TV: "tv", MIXED: "mixed" },
    ContentType: { MOVIE: "movie", TV: "tv" },
    WatchStatus: {
      PLANNING: "planning",
      WATCHING: "watching",
      PAUSED: "paused",
      COMPLETED: "completed",
      DROPPED: "dropped",
    },
    ActivityType: {
      PROFILE_IMPORT: "profile_import",
    },
  };
});

// Mock database
vi.mock("@/lib/db", () => ({
  db: mockedDb,
}));

// Mock addToCache
vi.mock("@/lib/tmdb/cache-utils", () => ({
  addToCache: vi.fn(),
}));

// Mock JSZip
vi.mock("jszip", () => {
  const mZip = {
    file: vi.fn(),
    generateAsync: vi.fn().mockResolvedValue("mock-zip-content"),
  };
  return {
    default: vi.fn(() => mZip),
  };
});

describe("Profile Data Service", () => {
  const userId = "user-123";
  const mockDate = new Date("2023-01-01T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(mockDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("exportUserData", () => {
    // Mock data
    const mockLists = [
      {
        id: "list-1",
        ownerId: userId,
        name: "My List",
        description: "Desc",
        listType: "mixed",
        isPublic: false,
        isArchived: true,
        syncWatchStatus: false,
        createdAt: mockDate,
        updatedAt: mockDate,
      },
    ];

    const mockListItems = [
      {
        id: "item-1",
        listId: "list-1",
        tmdbId: 123,
        contentType: "movie",
        createdAt: mockDate,
        title: "Movie Title",
        releaseDate: mockDate,
      },
    ];

    const mockContentStatus = [
      {
        id: "status-1",
        userId: userId,
        tmdbId: 456,
        contentType: "tv",
        status: "watching",
        createdAt: mockDate,
        updatedAt: mockDate,
      },
    ];

    const mockEpisodeStatus = [
      {
        id: "ep-1",
        userId: userId,
        tmdbId: 456,
        seasonNumber: 1,
        episodeNumber: 1,
        watched: true,
        watchedAt: mockDate,
        createdAt: mockDate,
        updatedAt: mockDate,
      },
    ];

    const mockSchedules = [
      {
        id: "sched-1",
        userId: userId,
        tmdbId: 456,
        dayOfWeek: 1,
        createdAt: mockDate,
        updatedAt: mockDate,
      },
    ];

    // Helper to mock db chain for export
    const setupExportMocks = () => {
      const fromMock = vi.fn();
      const whereMock = vi.fn();
      const leftJoinMock = vi.fn();

      // Chain for lists
      // db.select().from(lists).where(...)
      // Chain for listItems
      // db.select(...).from(listItems).leftJoin(...).where(...)
      // Chain for others
      // db.select().from(...).where(...)

      (mockedDb.select as any).mockImplementation((_selection: any) => {
        return {
          from: fromMock.mockImplementation((_table) => {
            return {
              where: whereMock,
              leftJoin: leftJoinMock.mockReturnValue({ where: whereMock }),
            };
          }),
        };
      });

      // We need to return specific data based on the table being queried or the structure of the query
      // Since `from` is called with the table object, we can't easily switch on it because it's an object reference.
      // However, we can mock the return values of `whereMock` sequentially if we know the order of execution.
      // Order in service: lists -> listItems -> contentStatus -> episodeStatus -> schedules

      whereMock
        .mockResolvedValueOnce(mockLists) // 1. lists
        .mockResolvedValueOnce(mockListItems) // 2. listItems
        .mockResolvedValueOnce(mockContentStatus) // 3. contentStatus
        .mockResolvedValueOnce(mockEpisodeStatus) // 4. episodeStatus
        .mockResolvedValueOnce(mockSchedules); // 5. schedules
    };

    it("should export data in JSON format", async () => {
      setupExportMocks();

      const result = await exportUserData(userId, "json");

      expect(result.mimetype).toBe("application/json");
      expect(result.filename).toContain(".json");

      const decodedData = JSON.parse(result.data);

      expect(decodedData.lists).toHaveLength(1);
      expect(decodedData.lists[0].isArchived).toBe(true);
      expect(decodedData.lists[0].items).toHaveLength(1);
      expect(decodedData.contentStatus).toHaveLength(1);
      expect(decodedData.episodeStatus).toHaveLength(1);
      expect(decodedData.tvShowSchedules).toHaveLength(1);
    });

    it("should export data in CSV format", async () => {
      setupExportMocks();

      const result = await exportUserData(userId, "csv");

      expect(result.mimetype).toBe("application/zip");
      expect(result.filename).toContain(".zip");
      expect(result.data).toBe("mock-zip-content");

      // Verify JSZip usage
      const zipInstance = new JSZip();
      expect(zipInstance.file).toHaveBeenCalledTimes(5);
      expect(zipInstance.file).toHaveBeenCalledWith(
        "lists.csv",
        expect.stringContaining("id,name,description")
      );
    });

    it("should handle empty lists correctly", async () => {
      // Mock empty return for lists
      const fromMock = vi.fn();
      const whereMock = vi.fn();
      const leftJoinMock = vi.fn();

      (mockedDb.select as any).mockImplementation(() => ({
        from: fromMock.mockImplementation(() => ({
          where: whereMock,
          leftJoin: leftJoinMock.mockReturnValue({ where: whereMock }),
        })),
      }));

      whereMock
        .mockResolvedValueOnce([]) // lists
        // listItems query is skipped if no lists
        .mockResolvedValueOnce([]) // contentStatus
        .mockResolvedValueOnce([]) // episodeStatus
        .mockResolvedValueOnce([]); // schedules

      const result = await exportUserData(userId, "json");
      const decodedData = JSON.parse(result.data);

      expect(decodedData.lists).toEqual([]);
      expect(decodedData.contentStatus).toEqual([]);
    });
  });

  describe("importUserData", () => {
    const importData = {
      lists: [
        {
          id: "list-1",
          name: "Imported List",
          description: "Desc",
          listType: "mixed",
          isPublic: false,
          syncWatchStatus: false,
          createdAt: mockDate.toISOString(),
          updatedAt: mockDate.toISOString(),
          items: [
            {
              id: "item-1",
              tmdbId: 101,
              contentType: "movie",
              createdAt: mockDate.toISOString(),
            },
          ],
        },
      ],
      contentStatus: [
        {
          id: "status-1",
          tmdbId: 202,
          contentType: "tv",
          status: "completed",
          createdAt: mockDate.toISOString(),
          updatedAt: mockDate.toISOString(),
        },
      ],
      episodeStatus: [
        {
          id: "ep-1",
          tmdbId: 202,
          seasonNumber: 1,
          episodeNumber: 1,
          watched: true,
          watchedAt: mockDate.toISOString(),
          createdAt: mockDate.toISOString(),
          updatedAt: mockDate.toISOString(),
        },
      ],
      tvShowSchedules: [
        {
          id: "sched-1",
          tmdbId: 202,
          dayOfWeek: 2,
          createdAt: mockDate.toISOString(),
          updatedAt: mockDate.toISOString(),
        },
      ],
    };

    const jsonData = JSON.stringify(importData);

    const setupImportMocks = () => {
      const valuesMock = vi.fn();
      const onConflictDoUpdateMock = vi.fn();
      const onConflictDoNothingMock = vi.fn();
      const returningMock = vi.fn();

      (mockedDb.insert as any).mockReturnValue({
        values: valuesMock.mockReturnValue({
          onConflictDoUpdate:
            onConflictDoUpdateMock.mockResolvedValue(undefined),
          onConflictDoNothing:
            onConflictDoNothingMock.mockResolvedValue(undefined),
          // Lists are inserted with a DB-generated id (API-01), so the insert
          // uses .returning() to recover the new id for nested list items.
          returning: returningMock.mockResolvedValue([{ id: "generated-list-1" }]),
        }),
      });

      return {
        valuesMock,
        onConflictDoUpdateMock,
        onConflictDoNothingMock,
        returningMock,
      };
    };

    it("should successfully import valid data", async () => {
      setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      const result = await importUserData(userId, jsonData);

      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;

      expect(result.success).toBe(true);
      expect(result.imported.lists).toBe(1);
      expect(result.imported.listItems).toBe(1);
      expect(result.imported.contentStatus).toBe(1);
      expect(result.imported.episodeStatus).toBe(1);
      expect(result.imported.tvShowSchedules).toBe(1);
      expect(result.errors).toHaveLength(0);

      // Verify db calls
      expect(mockedDb.insert).toHaveBeenCalledTimes(6);
      expect(addToCache).toHaveBeenCalledWith(101, "movie");
    });

    it("should return parseError for invalid JSON", async () => {
      const result = await importUserData(userId, "invalid-base64-content");
      expect(result).toBe("parseError");
    });

    it("should reject payloads with too many entries (API-03)", async () => {
      setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      const hugeContentStatus = Array.from({ length: 5001 }, (_, i) => ({
        id: `status-${i}`,
        tmdbId: i,
        contentType: "movie",
        status: "completed",
        createdAt: mockDate.toISOString(),
        updatedAt: mockDate.toISOString(),
      }));

      const result = await importUserData(
        userId,
        JSON.stringify({ contentStatus: hugeContentStatus })
      );

      expect(result).toBe("tooLarge");
      // Nothing should have been written when the payload is rejected.
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    it("should warm the cache only once per unique (tmdbId, contentType) (API-03)", async () => {
      setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      const dedupeData = {
        lists: [
          {
            id: "list-1",
            name: "Dupes",
            description: null,
            listType: "movies",
            isPublic: false,
            isArchived: false,
            syncWatchStatus: false,
            createdAt: mockDate.toISOString(),
            updatedAt: mockDate.toISOString(),
            items: [
              {
                id: "item-1",
                tmdbId: 555,
                contentType: "movie",
                createdAt: mockDate.toISOString(),
              },
              {
                id: "item-2",
                tmdbId: 555,
                contentType: "movie",
                createdAt: mockDate.toISOString(),
              },
            ],
          },
        ],
      };

      const result = await importUserData(userId, JSON.stringify(dedupeData));
      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;

      // Two duplicate items, but the cache is warmed only once.
      expect(addToCache).toHaveBeenCalledTimes(1);
      expect(addToCache).toHaveBeenCalledWith(555, "movie");
      // Both items are still inserted (dedupe happens at the DB layer).
      expect(result.imported.listItems).toBe(2);
    });

    it("should handle cache addition failure gracefully", async () => {
      setupImportMocks();
      (addToCache as any).mockRejectedValue(new Error("Cache failed"));

      const result = await importUserData(userId, jsonData);

      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;

      expect(result.imported.lists).toBe(1);
      expect(result.imported.listItems).toBe(0); // Should fail to import item
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Failed to import list item");
    });

    it("should handle db insert failure gracefully", async () => {
      const { valuesMock } = setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      // Mock failure for the first insert (list). Lists now insert with
      // .returning() (API-01), so reject there.
      valuesMock.mockReturnValueOnce({
        returning: vi.fn().mockRejectedValue(new Error("DB Error")),
      });

      const result = await importUserData(userId, jsonData);

      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;

      expect(result.imported.lists).toBe(0);
      // If list fails, items are inside the list loop, so they won't be processed or the error will catch the block
      // In the code: try { insert list ... if (list.items) { ... } } catch (e) ...
      // So if list insert fails, items are skipped.
      expect(result.imported.listItems).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Failed to import list");
    });

    it("returns static error messages that do not leak exception text (API-04)", async () => {
      const { valuesMock } = setupImportMocks();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      // Content status insert throws with a sensitive DB constraint message.
      valuesMock.mockReturnValueOnce({
        onConflictDoUpdate: vi
          .fn()
          .mockRejectedValue(
            new Error(
              'duplicate key value violates unique constraint "user_content_status_user_id_tmdb_id_content_type_key"'
            )
          ),
      });

      const result = await importUserData(
        userId,
        JSON.stringify({
          contentStatus: [
            {
              id: "s1",
              tmdbId: 1,
              contentType: "movie",
              status: "completed",
              createdAt: mockDate.toISOString(),
              updatedAt: mockDate.toISOString(),
            },
          ],
        })
      );

      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;

      expect(result.errors).toHaveLength(1);
      // Static, indexed message only. No DB internals leaked to the client.
      expect(result.errors[0]).toBe("Failed to import content status entry 1");
      expect(result.errors[0]).not.toContain("constraint");
      expect(result.errors[0]).not.toContain("duplicate key");
      // The real exception is still logged server-side.
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it("should import an archived list correctly", async () => {
      const archivedImportData = {
        lists: [
          {
            id: "list-archived",
            name: "Archived List",
            description: "Desc",
            listType: "mixed",
            isPublic: false,
            isArchived: true,
            syncWatchStatus: false,
            createdAt: mockDate.toISOString(),
            updatedAt: mockDate.toISOString(),
            items: [],
          },
        ],
      };

      const { valuesMock } = setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      await importUserData(userId, JSON.stringify(archivedImportData));

      // The list is inserted as a fresh row owned by the importer with a
      // DB-generated id; the client-supplied id is never honored (API-01).
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerId: userId,
          isArchived: true,
        })
      );
      expect(valuesMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ id: "list-archived" })
      );
    });

    it("does not trust client-supplied list ids (prevents overwriting another user's list)", async () => {
      const { valuesMock, onConflictDoUpdateMock } = setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      // A read-only viewer supplies another user's list id in the import file.
      const foreignImportData = {
        lists: [
          {
            id: "someone-elses-list-id",
            name: "Injected List",
            description: null,
            listType: "mixed",
            isPublic: false,
            isArchived: false,
            syncWatchStatus: false,
            createdAt: mockDate.toISOString(),
            updatedAt: mockDate.toISOString(),
            items: [],
          },
        ],
      };

      const result = await importUserData(
        userId,
        JSON.stringify(foreignImportData)
      );
      expect(result).not.toBe("parseError");

      // The list is created as a brand-new row owned by the importer, and the
      // supplied primary key is never used.
      expect(valuesMock).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: userId, name: "Injected List" })
      );
      const listInsertPayloads = valuesMock.mock.calls.map((c) => c[0]);
      expect(
        listInsertPayloads.some((p) => p.id === "someone-elses-list-id")
      ).toBe(false);

      // The list insert must never upsert onto an existing lists.id row.
      expect(onConflictDoUpdateMock).not.toHaveBeenCalledWith(
        expect.objectContaining({ target: "lists.id" })
      );
    });
  });
});
