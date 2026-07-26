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

    // LOGIC-04: rows must never be inserted with an explicit `id` from the
    // file. `onConflictDoUpdate` targets the unique constraint, not the primary
    // key, and Postgres only handles the conflict named in the target -- so a
    // collision on `id` raises an uncovered duplicate-key error and every row
    // of a cross-user import fails while the result still reports success.
    // This behaviour was already correct when this batch was picked up; the
    // test locks it in.
    it("never carries a client-supplied id into any insert (LOGIC-04)", async () => {
      const { valuesMock, onConflictDoUpdateMock } = setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      const result = await importUserData(userId, jsonData);
      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;

      // Every row imported cleanly.
      expect(result.errors).toEqual([]);
      expect(result.imported.contentStatus).toBe(1);
      expect(result.imported.episodeStatus).toBe(1);
      expect(result.imported.tvShowSchedules).toBe(1);

      // Not one insert payload carries an id, for any table.
      const payloads = valuesMock.mock.calls.map((c) => c[0]);
      expect(payloads.length).toBeGreaterThan(0);
      for (const payload of payloads) {
        expect(payload).not.toHaveProperty("id");
      }

      // And every upsert targets the natural unique key, never the PK, so the
      // conflict Postgres is told about is the one that can actually happen.
      for (const call of onConflictDoUpdateMock.mock.calls) {
        const target = call[0].target as string[];
        expect(Array.isArray(target)).toBe(true);
        expect(target.length).toBeGreaterThan(1);
        expect(target).not.toContain("userContentStatus.id");
        expect(target).not.toContain("episodeWatchStatus.id");
        expect(target).not.toContain("showSchedules.id");
      }
    });

    // LOGIC-05
    it("rejects out-of-range dayOfWeek rather than writing them (LOGIC-05)", async () => {
      const { valuesMock } = setupImportMocks();

      const result = await importUserData(
        userId,
        JSON.stringify({
          tvShowSchedules: [
            {
              tmdbId: 1,
              dayOfWeek: 9,
              createdAt: mockDate.toISOString(),
              updatedAt: mockDate.toISOString(),
            },
            {
              tmdbId: 2,
              dayOfWeek: -1,
              createdAt: mockDate.toISOString(),
              updatedAt: mockDate.toISOString(),
            },
            {
              tmdbId: 3,
              dayOfWeek: 1.5,
              createdAt: mockDate.toISOString(),
              updatedAt: mockDate.toISOString(),
            },
            {
              tmdbId: 4,
              dayOfWeek: "3",
              createdAt: mockDate.toISOString(),
              updatedAt: mockDate.toISOString(),
            },
            {
              tmdbId: 5,
              dayOfWeek: 3,
              createdAt: mockDate.toISOString(),
              updatedAt: mockDate.toISOString(),
            },
          ],
        })
      );

      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;

      // Only the valid row is written.
      expect(result.imported.tvShowSchedules).toBe(1);
      expect(result.errors).toHaveLength(4);
      for (const error of result.errors) {
        expect(error).toMatch(/dayOfWeek must be an integer between 0 and 6/);
      }

      const scheduleWrites = valuesMock.mock.calls
        .map((c) => c[0])
        .filter((p) => p.dayOfWeek !== undefined);
      expect(scheduleWrites).toHaveLength(1);
      expect(scheduleWrites[0].dayOfWeek).toBe(3);
    });

    it("accepts both boundary days", async () => {
      setupImportMocks();
      const result = await importUserData(
        userId,
        JSON.stringify({
          tvShowSchedules: [0, 6].map((dayOfWeek, i) => ({
            tmdbId: i,
            dayOfWeek,
            createdAt: mockDate.toISOString(),
            updatedAt: mockDate.toISOString(),
          })),
        })
      );
      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;
      expect(result.imported.tvShowSchedules).toBe(2);
      expect(result.errors).toEqual([]);
    });

    // The size check is O(1) per section, so it runs before anything walks the
    // arrays. An oversized payload is refused outright rather than validated
    // element by element first.
    it("refuses an oversized payload before validating its elements", async () => {
      setupImportMocks();

      const tooManyLists: unknown[] = Array.from(
        { length: 5001 },
        (_, i) => ({
          name: `List ${i}`,
          description: null,
          listType: "mixed",
          isPublic: false,
          isArchived: false,
          syncWatchStatus: false,
          items: [],
        })
      );
      // A malformed element buried in the array. Validating first would report
      // this as a parseError, having already walked 5000 good entries.
      tooManyLists[5000] = null;

      const result = await importUserData(
        userId,
        JSON.stringify({ lists: tooManyLists })
      );

      expect(result).toBe("tooLarge");
      expect(mockedDb.insert).not.toHaveBeenCalled();
    });

    // LOGIC-03 (consumer side): fixing the exporter did not help third-party or
    // hand-edited files that omit timestamps -- `new Date(undefined)` is an
    // Invalid Date, which Postgres rejects, so the row was silently downgraded
    // to a per-row error and lost. Never hand the driver an Invalid Date.
    it("substitutes the import time for missing or unparseable timestamps (LOGIC-03)", async () => {
      const { valuesMock } = setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      const result = await importUserData(
        userId,
        JSON.stringify({
          lists: [
            {
              name: "No timestamps",
              description: null,
              listType: "mixed",
              isPublic: false,
              isArchived: false,
              syncWatchStatus: false,
              items: [{ tmdbId: 101, contentType: "movie" }],
            },
          ],
          contentStatus: [
            { tmdbId: 202, contentType: "tv", status: "completed" },
          ],
          episodeStatus: [
            {
              tmdbId: 202,
              seasonNumber: 1,
              episodeNumber: 1,
              watched: true,
              createdAt: "not a date",
              updatedAt: null,
            },
          ],
          tvShowSchedules: [{ tmdbId: 202, dayOfWeek: 3 }],
        })
      );

      expect(result).not.toBe("parseError");
      if (typeof result === "string") return;

      // Every section imported rather than erroring out per row.
      expect(result.errors).toEqual([]);
      expect(result.imported.lists).toBe(1);
      expect(result.imported.listItems).toBe(1);
      expect(result.imported.contentStatus).toBe(1);
      expect(result.imported.episodeStatus).toBe(1);
      expect(result.imported.tvShowSchedules).toBe(1);

      // Not one Invalid Date reaches the driver, on any table.
      const payloads = valuesMock.mock.calls.map((c) => c[0]);
      expect(payloads.length).toBeGreaterThan(0);
      let dateFields = 0;
      for (const payload of payloads) {
        for (const value of Object.values(payload)) {
          if (value instanceof Date) {
            dateFields++;
            expect(Number.isNaN(value.getTime())).toBe(false);
            expect(value).toEqual(mockDate);
          }
        }
      }
      expect(dateFields).toBeGreaterThan(0);

      // An absent watchedAt still means null, not a fabricated timestamp.
      const episodePayload = payloads.find(
        (p) => p.seasonNumber !== undefined
      );
      expect(episodePayload.watchedAt).toBeNull();
    });

    it("still honours timestamps that are present and valid", async () => {
      const { valuesMock } = setupImportMocks();
      (addToCache as any).mockResolvedValue({});

      const earlier = new Date("2020-05-05T10:00:00.000Z");
      const result = await importUserData(
        userId,
        JSON.stringify({
          contentStatus: [
            {
              tmdbId: 1,
              contentType: "movie",
              status: "completed",
              createdAt: earlier.toISOString(),
              updatedAt: earlier.toISOString(),
            },
          ],
        })
      );
      expect(result).not.toBe("parseError");

      const payload = valuesMock.mock.calls
        .map((c) => c[0])
        .find((p) => p.status === "completed");
      expect(payload.createdAt).toEqual(earlier);
      expect(payload.updatedAt).toEqual(earlier);
    });

    // LOGIC-07: each section's try sits INSIDE its loop, so a truthy
    // non-iterable value threw from the for...of itself, outside any handler.
    describe("malformed structure returns parseError, not a 500 (LOGIC-07)", () => {
      const cases: Array<[string, unknown]> = [
        ["lists is a number", { lists: 5 }],
        ["lists is an object", { lists: { a: 1 } }],
        ["lists is a string", { lists: "nope" }],
        ["contentStatus is a number", { contentStatus: 5 }],
        ["episodeStatus is a number", { episodeStatus: 5 }],
        ["tvShowSchedules is a number", { tvShowSchedules: 5 }],
        [
          "list.items is a number",
          { lists: [{ name: "L", items: 3 }] },
        ],
        ["payload is null", null],
        ["payload is a number", 7],
      ];

      for (const [name, payload] of cases) {
        it(name, async () => {
          setupImportMocks();
          const result = await importUserData(userId, JSON.stringify(payload));
          expect(result).toBe("parseError");
          // Nothing may be written for a payload we refuse to parse.
          expect(mockedDb.insert).not.toHaveBeenCalled();
        });
      }
    });

    it("still returns a result when the closing activity write fails (LOGIC-07)", async () => {
      const { valuesMock } = setupImportMocks();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      (addToCache as any).mockResolvedValue({});

      // Everything imports, then the final activity insert blows up. Before the
      // fix that threw *after* all data was committed, so the caller saw a 500
      // despite a fully successful import. Only the activity write fails; every
      // data row is committed first.
      const defaultValues = valuesMock.getMockImplementation();
      valuesMock.mockImplementation((payload: any) => {
        if (payload && "activityType" in payload) {
          throw new Error("activity insert failed");
        }
        return defaultValues?.(payload);
      });

      const result = await importUserData(
        userId,
        JSON.stringify({
          contentStatus: [
            {
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
      expect(result.success).toBe(true);
      // The data itself was imported; only the audit write was lost.
      expect(result.imported.contentStatus).toBe(1);
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  // The two halves of the export/import boundary are written independently, so
  // a field dropped on either side is invisible to tests that only exercise one
  // of them. These feed a real `exportUserData` document straight back into
  // `importUserData` and assert on the values that come out the far end.
  describe("export → import round trip", () => {
    // Deliberately not `mockDate`: `importUserData` substitutes the import time
    // (which *is* `mockDate` here) for any timestamp it cannot use, so
    // asserting against `mockDate` would pass even if the real values were
    // dropped. Distinct historical dates make the substitution detectable.
    const listCreatedAt = new Date("2021-03-04T05:06:07.000Z");
    const listUpdatedAt = new Date("2021-05-06T07:08:09.000Z");
    const itemCreatedAt = new Date("2021-07-08T09:10:11.000Z");
    const statusCreatedAt = new Date("2021-09-10T11:12:13.000Z");
    const statusUpdatedAt = new Date("2021-11-12T13:14:15.000Z");
    const episodeWatchedAt = new Date("2022-01-02T03:04:05.000Z");
    const scheduleCreatedAt = new Date("2022-03-04T05:06:07.000Z");
    const scheduleUpdatedAt = new Date("2022-05-06T07:08:09.000Z");

    const dbLists = [
      {
        id: "list-active",
        ownerId: userId,
        name: "Active List",
        description: "Still watching these",
        listType: "mixed",
        isPublic: true,
        isArchived: false,
        syncWatchStatus: true,
        createdAt: listCreatedAt,
        updatedAt: listUpdatedAt,
      },
      {
        id: "list-archived",
        ownerId: userId,
        name: "Archived List",
        description: null,
        listType: "movies",
        isPublic: false,
        isArchived: true,
        syncWatchStatus: false,
        createdAt: listCreatedAt,
        updatedAt: listUpdatedAt,
      },
    ];

    const dbListItems = [
      {
        id: "item-1",
        listId: "list-active",
        tmdbId: 11,
        contentType: "movie",
        createdAt: itemCreatedAt,
        title: "A Movie",
        releaseDate: itemCreatedAt,
      },
      {
        id: "item-2",
        listId: "list-active",
        tmdbId: 22,
        contentType: "tv",
        createdAt: itemCreatedAt,
        title: "A Show",
        releaseDate: itemCreatedAt,
      },
      {
        id: "item-3",
        listId: "list-archived",
        tmdbId: 33,
        contentType: "movie",
        createdAt: itemCreatedAt,
        title: "An Old Movie",
        releaseDate: null,
      },
    ];

    const dbContentStatus = [
      {
        id: "cs-1",
        userId,
        tmdbId: 22,
        contentType: "tv",
        status: "watching",
        nextEpisodeDate: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: statusCreatedAt,
        updatedAt: statusUpdatedAt,
      },
      {
        id: "cs-2",
        userId,
        tmdbId: 33,
        contentType: "movie",
        status: "completed",
        nextEpisodeDate: null,
        createdAt: statusCreatedAt,
        updatedAt: statusUpdatedAt,
      },
    ];

    const dbEpisodeStatus = [
      {
        id: "ep-1",
        userId,
        tmdbId: 22,
        seasonNumber: 2,
        episodeNumber: 7,
        watched: true,
        watchedAt: episodeWatchedAt,
        createdAt: statusCreatedAt,
        updatedAt: statusUpdatedAt,
      },
      {
        // An explicitly *unwatched* row: `watched: false` and a null
        // `watchedAt` both have to survive, not be coerced.
        id: "ep-2",
        userId,
        tmdbId: 22,
        seasonNumber: 2,
        episodeNumber: 8,
        watched: false,
        watchedAt: null,
        createdAt: statusCreatedAt,
        updatedAt: statusUpdatedAt,
      },
    ];

    const dbSchedules = [
      {
        id: "sched-1",
        userId,
        tmdbId: 22,
        dayOfWeek: 0, // Sunday — the falsy boundary
        createdAt: scheduleCreatedAt,
        updatedAt: scheduleUpdatedAt,
      },
      {
        id: "sched-2",
        userId,
        tmdbId: 22,
        dayOfWeek: 6,
        createdAt: scheduleCreatedAt,
        updatedAt: scheduleUpdatedAt,
      },
    ];

    // Order in exportUserData: lists -> listItems -> contentStatus ->
    // episodeStatus -> schedules.
    const mockExportReads = () => {
      const whereMock = vi.fn();
      const leftJoinMock = vi.fn();
      (mockedDb.select as any).mockImplementation(() => ({
        from: vi.fn().mockImplementation(() => ({
          where: whereMock,
          leftJoin: leftJoinMock.mockReturnValue({ where: whereMock }),
        })),
      }));

      whereMock
        .mockResolvedValueOnce(dbLists)
        .mockResolvedValueOnce(dbListItems)
        .mockResolvedValueOnce(dbContentStatus)
        .mockResolvedValueOnce(dbEpisodeStatus)
        .mockResolvedValueOnce(dbSchedules);
    };

    // Captures every insert payload so the round-tripped values can be
    // asserted on, and hands each list a distinct DB-generated id so nested
    // items can be checked against the correct parent.
    const mockImportWrites = () => {
      const payloads: any[] = [];
      let generatedListCount = 0;

      (mockedDb.insert as any).mockReturnValue({
        values: vi.fn().mockImplementation((payload: any) => {
          payloads.push(payload);
          return {
            onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
            onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
            returning: vi.fn().mockImplementation(() => {
              generatedListCount++;
              return Promise.resolve([
                { id: `generated-list-${generatedListCount}` },
              ]);
            }),
          };
        }),
      });

      return {
        payloads,
        // Payload shapes are disjoint enough to attribute by field presence.
        byTable: () => ({
          lists: payloads.filter((p) => p.ownerId !== undefined),
          listItems: payloads.filter((p) => p.listId !== undefined),
          contentStatus: payloads.filter((p) => p.status !== undefined),
          episodeStatus: payloads.filter((p) => p.seasonNumber !== undefined),
          schedules: payloads.filter((p) => p.dayOfWeek !== undefined),
          activity: payloads.filter((p) => p.activityType !== undefined),
        }),
      };
    };

    const roundTrip = async () => {
      mockExportReads();
      const exported = await exportUserData(userId, "json");

      const writes = mockImportWrites();
      (addToCache as any).mockResolvedValue({});
      // The exporter's output, verbatim — no hand-built payload in between.
      const result = await importUserData(userId, exported.data);
      // Assert here rather than in each test. Eight of the tests below opened
      // with `if (typeof result === "string") return;`, which turns a failed
      // import into a silent pass -- exactly the regression a round-trip test
      // exists to catch. Throwing narrows `result` for every caller too.
      if (typeof result === "string") {
        throw new Error(`round trip failed at import: ${result}`);
      }

      return { exported, result, writes };
    };

    it("preserves every section through export and back in", async () => {
      const { result } = await roundTrip();

      expect(result).not.toBe("parseError");
      expect(result).not.toBe("tooLarge");

      expect(result.errors).toEqual([]);
      expect(result.imported).toEqual({
        lists: 2,
        listItems: 3,
        contentStatus: 2,
        episodeStatus: 2,
        tvShowSchedules: 2,
      });
    });

    it("preserves list fields, including the archived flag", async () => {
      const { writes } = await roundTrip();

      const { lists: listWrites } = writes.byTable();
      expect(listWrites).toHaveLength(2);

      expect(listWrites[0]).toEqual({
        ownerId: userId,
        name: "Active List",
        description: "Still watching these",
        listType: "mixed",
        isPublic: true,
        isArchived: false,
        syncWatchStatus: true,
        createdAt: listCreatedAt,
        updatedAt: listUpdatedAt,
      });

      // The archived flag is the one most easily lost: it is a non-default
      // boolean that no other code path sets on insert.
      expect(listWrites[1]).toEqual({
        ownerId: userId,
        name: "Archived List",
        description: null,
        listType: "movies",
        isPublic: false,
        isArchived: true,
        syncWatchStatus: false,
        createdAt: listCreatedAt,
        updatedAt: listUpdatedAt,
      });

      // Real timestamps survived rather than being replaced by the import time.
      expect(listWrites[0].createdAt).not.toEqual(mockDate);
    });

    it("reattaches list items to the correct newly-created list", async () => {
      const { writes } = await roundTrip();

      const { listItems: itemWrites } = writes.byTable();
      expect(itemWrites).toEqual([
        {
          listId: "generated-list-1",
          tmdbId: 11,
          contentType: "movie",
          createdAt: itemCreatedAt,
        },
        {
          listId: "generated-list-1",
          tmdbId: 22,
          contentType: "tv",
          createdAt: itemCreatedAt,
        },
        {
          // The archived list's item lands on the archived list, not the first.
          listId: "generated-list-2",
          tmdbId: 33,
          contentType: "movie",
          createdAt: itemCreatedAt,
        },
      ]);

      // One cache warm per unique (tmdbId, contentType) in the export.
      expect(addToCache).toHaveBeenCalledTimes(3);
    });

    it("preserves content statuses", async () => {
      const { writes } = await roundTrip();

      const { contentStatus: statusWrites } = writes.byTable();
      expect(statusWrites).toEqual([
        {
          userId,
          tmdbId: 22,
          contentType: "tv",
          status: "watching",
          createdAt: statusCreatedAt,
          updatedAt: statusUpdatedAt,
        },
        {
          userId,
          tmdbId: 33,
          contentType: "movie",
          status: "completed",
          createdAt: statusCreatedAt,
          updatedAt: statusUpdatedAt,
        },
      ]);
    });

    it("preserves episode statuses, including an unwatched row", async () => {
      const { writes } = await roundTrip();

      const { episodeStatus: episodeWrites } = writes.byTable();
      expect(episodeWrites).toEqual([
        {
          userId,
          tmdbId: 22,
          seasonNumber: 2,
          episodeNumber: 7,
          watched: true,
          watchedAt: episodeWatchedAt,
          createdAt: statusCreatedAt,
          updatedAt: statusUpdatedAt,
        },
        {
          userId,
          tmdbId: 22,
          seasonNumber: 2,
          episodeNumber: 8,
          watched: false,
          // A null `watchedAt` must stay null, not become the import time.
          watchedAt: null,
          createdAt: statusCreatedAt,
          updatedAt: statusUpdatedAt,
        },
      ]);
    });

    it("preserves schedules, including dayOfWeek 0", async () => {
      const { writes } = await roundTrip();

      const { schedules: scheduleWrites } = writes.byTable();
      expect(scheduleWrites).toEqual([
        {
          userId,
          tmdbId: 22,
          // Sunday is 0; a falsy-check anywhere on this path would drop it and
          // the row would be rejected by the LOGIC-05 range guard.
          dayOfWeek: 0,
          createdAt: scheduleCreatedAt,
          updatedAt: scheduleUpdatedAt,
        },
        {
          userId,
          tmdbId: 22,
          dayOfWeek: 6,
          createdAt: scheduleCreatedAt,
          updatedAt: scheduleUpdatedAt,
        },
      ]);
    });

    it("does not carry any exported primary key into the re-import", async () => {
      const { writes } = await roundTrip();

      // The export includes every row's `id`; the import must ignore all of
      // them (API-01 / LOGIC-04). This is the one field the round trip is
      // *meant* to lose.
      const exportedIds = [
        "list-active",
        "list-archived",
        "item-1",
        "cs-1",
        "ep-1",
        "sched-1",
      ];
      for (const payload of writes.payloads) {
        expect(payload).not.toHaveProperty("id");
        for (const value of Object.values(payload)) {
          expect(exportedIds).not.toContain(value);
        }
      }
    });

    // Documents current behaviour, not desired behaviour: these fields exist
    // in the database but are absent from the export model
    // (src/lib/profile/data/types.ts), so a round trip cannot restore them.
    it("does not round-trip nextEpisodeDate or the tmdb_cache join fields", async () => {
      const { exported, writes } = await roundTrip();

      const parsed = JSON.parse(exported.data);

      // `user_content_status.nextEpisodeDate` is populated in the source row
      // but never exported, so it cannot be re-imported. It is recomputed from
      // TMDB on the next episode write.
      expect(dbContentStatus[0]!.nextEpisodeDate).not.toBeNull();
      expect(parsed.contentStatus[0]).not.toHaveProperty("nextEpisodeDate");
      for (const payload of writes.byTable().contentStatus) {
        expect(payload).not.toHaveProperty("nextEpisodeDate");
      }

      // `title`/`releaseDate` are exported for human readability but are
      // joined from `tmdb_cache`, not owned by `list_items`, so the importer
      // drops them and re-warms the cache instead.
      expect(parsed.lists[0].items[0]).toMatchObject({
        title: "A Movie",
        releaseDate: itemCreatedAt.toISOString(),
      });
      for (const payload of writes.byTable().listItems) {
        expect(payload).not.toHaveProperty("title");
        expect(payload).not.toHaveProperty("releaseDate");
      }
    });

    it("records the round trip in the activity feed", async () => {
      const { writes } = await roundTrip();

      const { activity } = writes.byTable();
      expect(activity).toHaveLength(1);
      expect(activity[0]).toMatchObject({
        activityType: "profile_import",
        userId,
        metadata: {
          lists: 2,
          listItems: 3,
          contentStatus: 2,
          episodeStatus: 2,
          tvShowSchedules: 2,
          errors: 0,
        },
      });
    });
  });

});
