import { and, eq, inArray } from "drizzle-orm";
import JSZip from "jszip";

import { db } from "@/lib/db";
import {
  activityFeed,
  ActivityType,
  ContentTypeEnum,
  episodeWatchStatus,
  listItems,
  lists,
  ListTypeEnum,
  showSchedules,
  tmdbCache,
  userContentStatus,
  WatchStatusEnum,
} from "@/lib/db/schema";
import { addToCache } from "@/lib/tmdb/cache-utils";

// API-03: import hardening limits.
// Maximum entries permitted in any single import array before we refuse to
// process the payload (defends against resource-exhaustion / huge fan-out).
const MAX_IMPORT_ENTRIES = 5000;
// Maximum number of concurrent TMDB cache-warm requests during an import.
const CACHE_WARM_CONCURRENCY = 5;

import type {
  ContentStatusExportRow,
  CSVExportModel,
  EpisodeStatusExportRow,
  ExportFormat,
  ExportResponse,
  ImportResult,
  JSONExportModel,
  JSONImportModel,
  ListExportRow,
  ListItemExportRow,
  TVShowSchedules,
} from "./types";

// LOGIC-05: `show_schedules.day_of_week` is 0 (Sunday) to 6 (Saturday). This
// mirrors the CHECK constraint added in migration 0010; imports are the only
// path that ever wrote outside the range.
function isValidDayOfWeek(value: unknown): value is number {
  return (
    Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6
  );
}

// LOGIC-03 (consumer side): a bare `new Date(row.createdAt)` yields an Invalid
// Date for any third-party or hand-edited JSON that omits a timestamp, and
// Postgres rejects it -- downgraded by the per-row try/catch to a per-row error,
// but still a row silently lost. Fixing the exporter only closed the producer
// side. Same shape as `toReleaseDate` in src/lib/tmdb/cache-utils.ts: parse,
// then fall back rather than hand an Invalid Date to the driver. Returns null so
// callers pick their own fallback -- a missing `watchedAt` stays null, while a
// missing `createdAt`/`updatedAt` becomes the import time.
function toImportDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function exportUserData(
  userId: string,
  format: ExportFormat
): Promise<ExportResponse> {
  // 1. Map user lists to `ListExportRow`
  const userLists = await db
    .select()
    .from(lists)
    .where(eq(lists.ownerId, userId));

  const listRows: ListExportRow[] = userLists.map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    listType: l.listType as ListTypeEnum,
    isPublic: l.isPublic,
    isArchived: l.isArchived,
    syncWatchStatus: l.syncWatchStatus,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  }));

  // 2. Map user list items to `ListItemExportRow` (with `title` and `releaseDate` joined from the `tmdb_cache` table (if available))
  // We fetch items for all user lists
  const userListIds = userLists.map((l) => l.id);
  let listItemRows: ListItemExportRow[] = [];

  if (userListIds.length > 0) {
    const items = await db
      .select({
        id: listItems.id,
        listId: listItems.listId,
        tmdbId: listItems.tmdbId,
        contentType: listItems.contentType,
        createdAt: listItems.createdAt,
        title: tmdbCache.title,
        releaseDate: tmdbCache.releaseDate,
      })
      .from(listItems)
      .leftJoin(
        tmdbCache,
        and(
          eq(listItems.tmdbId, tmdbCache.tmdbId),
          eq(listItems.contentType, tmdbCache.contentType)
        )
      )
      .where(inArray(listItems.listId, userListIds));

    listItemRows = items.map((i) => ({
      id: i.id,
      listId: i.listId,
      tmdbId: i.tmdbId,
      contentType: i.contentType as ContentTypeEnum,
      title: i.title ?? "Unknown Title",
      releaseDate: i.releaseDate ? i.releaseDate.toISOString() : "",
      createdAt: i.createdAt.toISOString(),
    }));
  }

  // 3. Map user content status to `ContentStatusExportRow`
  const contentStatus = await db
    .select()
    .from(userContentStatus)
    .where(eq(userContentStatus.userId, userId));

  const contentStatusRows: ContentStatusExportRow[] = contentStatus.map(
    (cs) => ({
      id: cs.id,
      tmdbId: cs.tmdbId,
      contentType: cs.contentType as ContentTypeEnum,
      status: cs.status as WatchStatusEnum,
      createdAt: cs.createdAt.toISOString(),
      updatedAt: cs.updatedAt.toISOString(),
    })
  );

  // 4. Map user episode status to `EpisodeStatusExportRow`
  const episodeStatus = await db
    .select()
    .from(episodeWatchStatus)
    .where(eq(episodeWatchStatus.userId, userId));

  const episodeStatusRows: EpisodeStatusExportRow[] = episodeStatus.map(
    (es) => ({
      id: es.id,
      tmdbId: es.tmdbId,
      seasonNumber: es.seasonNumber,
      episodeNumber: es.episodeNumber,
      watched: es.watched,
      watchedAt: es.watchedAt?.toISOString() ?? null,
      createdAt: es.createdAt.toISOString(),
      updatedAt: es.updatedAt.toISOString(),
    })
  );

  // 5. Map user TV show schedules to `TVShowSchedulesExportRow`
  const schedules = await db
    .select()
    .from(showSchedules)
    .where(eq(showSchedules.userId, userId));

  const scheduleRows: TVShowSchedules[] = schedules.map((s) => ({
    id: s.id,
    tmdbId: s.tmdbId,
    dayOfWeek: s.dayOfWeek,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  }));

  // 6a. For JSON format, compile data into `JSONExportModel` and stringify it
  if (format === "json") {
    const exportModel: JSONExportModel = {
      lists: listRows.map((l) => ({
        ...l,
        items: listItemRows.filter((i) => i.listId === l.id),
      })),
      contentStatus: contentStatusRows,
      episodeStatus: episodeStatusRows,
      tvShowSchedules: scheduleRows,
    };

    const jsonString = JSON.stringify(exportModel, null, 2);

    return {
      data: jsonString,
      filename: `watch-this-export-${
        new Date().toISOString().split("T")[0]
      }.json`,
      mimetype: "application/json",
    };
  }

  // 6b. For CSV format, compile data into `CSVExportModel`, write to individual CSV tables, and return base64 encoded ZIP containing all CSV files
  const csvModel: CSVExportModel = {
    lists: listRows,
    listItems: listItemRows,
    contentStatus: contentStatusRows,
    episodeStatus: episodeStatusRows,
    tvShowSchedules: scheduleRows,
  };

  const zip = new JSZip();

  // Helper to convert array of objects to CSV
  const toCSV = (data: any[]) => {
    if (data.length === 0) return "";
    const headers = Object.keys(data[0]);
    const csvRows = [
      headers.join(","),
      ...data.map((row) =>
        headers
          .map((fieldName) => {
            const val =
              row[fieldName] === null || row[fieldName] === undefined
                ? ""
                : row[fieldName];
            return JSON.stringify(val); // Handles escaping quotes and commas
          })
          .join(",")
      ),
    ];
    return csvRows.join("\n");
  };

  zip.file("lists.csv", toCSV(csvModel.lists));
  zip.file("list_items.csv", toCSV(csvModel.listItems));
  zip.file("content_status.csv", toCSV(csvModel.contentStatus));
  zip.file("episode_status.csv", toCSV(csvModel.episodeStatus));
  zip.file("tv_show_schedules.csv", toCSV(csvModel.tvShowSchedules));

  const zipContent = await zip.generateAsync({ type: "base64" });

  return {
    data: zipContent,
    filename: `watch-this-export-${new Date().toISOString().split("T")[0]}.zip`,
    mimetype: "application/zip",
  };
}

export async function importUserData(
  userId: string,
  fileContent: string
): Promise<ImportResult | "parseError" | "tooLarge"> {
  // 1. Parse JSON to `JSONImportModel` (or return 'parseError')
  let importModel: JSONImportModel;
  try {
    importModel = JSON.parse(fileContent);
  } catch {
    return "parseError";
  }

  // 1a. LOGIC-07: validate the *structure* before touching any of it. Each
  //     section's per-row try/catch sits inside its loop, so a truthy
  //     non-iterable value (e.g. `{"lists": 5}`) used to throw from the
  //     `for...of` itself -- outside any handler -- and surface as a 500 rather
  //     than the intended "parseError".
  if (typeof importModel !== "object" || importModel === null) {
    return "parseError";
  }
  for (const section of [
    "lists",
    "contentStatus",
    "episodeStatus",
    "tvShowSchedules",
  ] as const) {
    const value = importModel[section];
    if (value !== undefined && value !== null && !Array.isArray(value)) {
      return "parseError";
    }
  }
  // 1b. Reject oversized payloads before doing any per-row work (API-03). Each
  //     import array is bounded independently so a single huge section cannot
  //     cause excessive DB work / TMDB fan-out. These are O(1) length reads, so
  //     they come before anything that walks the arrays.
  if (
    (importModel.lists?.length ?? 0) > MAX_IMPORT_ENTRIES ||
    (importModel.contentStatus?.length ?? 0) > MAX_IMPORT_ENTRIES ||
    (importModel.episodeStatus?.length ?? 0) > MAX_IMPORT_ENTRIES ||
    (importModel.tvShowSchedules?.length ?? 0) > MAX_IMPORT_ENTRIES
  ) {
    return "tooLarge";
  }
  // The nested item total needs one pass; still ahead of the per-list structure
  // check below, so an oversized payload is refused before it is validated.
  // Element-safe: `lists` is known to be an array here but its members are not
  // yet known to be objects.
  const totalListItems = (importModel.lists ?? []).reduce(
    (sum, list) => sum + (list?.items?.length ?? 0),
    0
  );
  if (totalListItems > MAX_IMPORT_ENTRIES) {
    return "tooLarge";
  }

  // 1c. Only now walk the lists to validate each element's shape.
  for (const list of importModel.lists ?? []) {
    if (typeof list !== "object" || list === null) return "parseError";
    if (
      list.items !== undefined &&
      list.items !== null &&
      !Array.isArray(list.items)
    ) {
      return "parseError";
    }
  }

  const result: ImportResult = {
    success: true,
    imported: {
      lists: 0,
      listItems: 0,
      contentStatus: 0,
      episodeStatus: 0,
      tvShowSchedules: 0,
    },
    errors: [],
  };

  // 1d. Pre-warm the TMDB cache once per unique (tmdbId, contentType) with
  //     bounded concurrency (API-03), rather than issuing a live addToCache
  //     call for every list item sequentially. Items whose content could not
  //     be cached are skipped later with a per-item error.
  const uniqueContent = new Map<
    string,
    { tmdbId: number; contentType: ContentTypeEnum }
  >();
  for (const list of importModel.lists ?? []) {
    for (const item of list.items ?? []) {
      uniqueContent.set(`${item.contentType}:${item.tmdbId}`, {
        tmdbId: item.tmdbId,
        contentType: item.contentType,
      });
    }
  }
  const cachedContentKeys = new Set<string>();
  const uniquePairs = Array.from(uniqueContent.values());
  for (let i = 0; i < uniquePairs.length; i += CACHE_WARM_CONCURRENCY) {
    const chunk = uniquePairs.slice(i, i + CACHE_WARM_CONCURRENCY);
    const settled = await Promise.allSettled(
      chunk.map((pair) => addToCache(pair.tmdbId, pair.contentType))
    );
    settled.forEach((outcome, idx) => {
      const pair = chunk[idx];
      if (outcome.status === "fulfilled") {
        cachedContentKeys.add(`${pair.contentType}:${pair.tmdbId}`);
      } else {
        console.error(
          `Failed to warm TMDB cache for ${pair.contentType} ${pair.tmdbId}:`,
          outcome.reason
        );
      }
    });
  }

  // 2. Import lists from `JSONImportModel.lists` to the `lists` table.
  //    Never trust the client-supplied primary key: always create a fresh
  //    list owned by the importing user (the DB generates the id). Otherwise a
  //    read-only viewer could supply another user's list id and rewrite it via
  //    an id-keyed upsert. We map the old id -> new id so nested list items
  //    still attach to the correct newly-created list.
  // Running item counter used only for static, non-leaky error messages
  // (API-04). We never interpolate DB exception text into the response.
  let listItemNumber = 0;
  // Fallback for any timestamp the file omits or that will not parse.
  const importedAt = new Date();
  if (importModel.lists) {
    for (const [listIndex, list] of importModel.lists.entries()) {
      const listNumber = listIndex + 1;
      try {
        const [insertedList] = await db
          .insert(lists)
          .values({
            ownerId: userId,
            name: list.name,
            description: list.description,
            listType: list.listType,
            isPublic: list.isPublic,
            isArchived: list.isArchived,
            syncWatchStatus: list.syncWatchStatus,
            createdAt: toImportDate(list.createdAt) ?? importedAt,
            updatedAt: toImportDate(list.updatedAt) ?? importedAt,
          })
          .returning({ id: lists.id });
        const newListId = insertedList.id;
        result.imported.lists++;

        // 3. Import list items into the `list_items` table (ignore existing
        //    items). Items attach to the freshly-generated list id, and the DB
        //    generates their own primary keys.
        if (list.items) {
          for (const item of list.items) {
            listItemNumber++;
            // 3a. The item's content must have been successfully cached during
            //     the pre-warm phase; if not, skip it.
            if (!cachedContentKeys.has(`${item.contentType}:${item.tmdbId}`)) {
              result.errors.push(
                `Failed to import list item ${listItemNumber}`
              );
              continue; // Skip this item if cache addition failed
            }
            // 3b. If cache addition is successful, insert the list item into the `list_items` table
            try {
              await db
                .insert(listItems)
                .values({
                  listId: newListId, // Attach to the newly-created list
                  tmdbId: item.tmdbId,
                  contentType: item.contentType,
                  createdAt: toImportDate(item.createdAt) ?? importedAt,
                })
                .onConflictDoNothing();
              result.imported.listItems++;
            } catch (e) {
              console.error(
                `Import: failed to insert list item ${listItemNumber}:`,
                e
              );
              result.errors.push(
                `Failed to import list item ${listItemNumber}`
              );
            }
          }
        }
      } catch (e) {
        console.error(`Import: failed to insert list ${listNumber}:`, e);
        result.errors.push(`Failed to import list ${listNumber}`);
      }
    }
  }

  // 4. Import content status from `JSONImportModel.contentStatus` to the `user_content_status` table (update existing status)
  if (importModel.contentStatus) {
    for (const [index, status] of importModel.contentStatus.entries()) {
      try {
        await db
          .insert(userContentStatus)
          .values({
            userId: userId,
            tmdbId: status.tmdbId,
            contentType: status.contentType,
            status: status.status,
            createdAt: toImportDate(status.createdAt) ?? importedAt,
            updatedAt: toImportDate(status.updatedAt) ?? importedAt,
          })
          .onConflictDoUpdate({
            target: [
              userContentStatus.userId,
              userContentStatus.tmdbId,
              userContentStatus.contentType,
            ],
            set: {
              status: status.status,
              updatedAt: toImportDate(status.updatedAt) ?? importedAt,
            },
          });
        result.imported.contentStatus++;
      } catch (e) {
        console.error(
          `Import: failed to insert content status entry ${index + 1}:`,
          e
        );
        result.errors.push(
          `Failed to import content status entry ${index + 1}`
        );
      }
    }
  }

  // 5. Import episode status from `JSONImportModel.episodeStatus` to the `episode_watch_status` table (update existing status)
  if (importModel.episodeStatus) {
    for (const [index, status] of importModel.episodeStatus.entries()) {
      try {
        await db
          .insert(episodeWatchStatus)
          .values({
            userId: userId,
            tmdbId: status.tmdbId,
            seasonNumber: status.seasonNumber,
            episodeNumber: status.episodeNumber,
            watched: status.watched,
            watchedAt: toImportDate(status.watchedAt),
            createdAt: toImportDate(status.createdAt) ?? importedAt,
            updatedAt: toImportDate(status.updatedAt) ?? importedAt,
          })
          .onConflictDoUpdate({
            target: [
              episodeWatchStatus.userId,
              episodeWatchStatus.tmdbId,
              episodeWatchStatus.seasonNumber,
              episodeWatchStatus.episodeNumber,
            ],
            set: {
              watched: status.watched,
              watchedAt: toImportDate(status.watchedAt),
              updatedAt: toImportDate(status.updatedAt) ?? importedAt,
            },
          });
        result.imported.episodeStatus++;
      } catch (e) {
        console.error(
          `Import: failed to insert episode status entry ${index + 1}:`,
          e
        );
        result.errors.push(
          `Failed to import episode status entry ${index + 1}`
        );
      }
    }
  }

  // 6. Import TV show schedules from `JSONImportModel.tvShowSchedules` to the `show_schedules` table (update existing schedules)
  if (importModel.tvShowSchedules) {
    for (const [index, schedule] of importModel.tvShowSchedules.entries()) {
      try {
        // LOGIC-05: reject out-of-range days. `listSchedules` buckets rows into
        // keys 0-6, so a row with e.g. dayOfWeek 9 used to break every
        // subsequent GET /api/schedules for the importing user, with no in-app
        // way to remove it because the deleting UI could not render.
        if (!isValidDayOfWeek(schedule?.dayOfWeek)) {
          result.errors.push(
            `Failed to import schedule entry ${index + 1}: dayOfWeek must be an integer between 0 and 6`
          );
          continue;
        }

        await db
          .insert(showSchedules)
          .values({
            userId: userId,
            tmdbId: schedule.tmdbId,
            dayOfWeek: schedule.dayOfWeek,
            createdAt: toImportDate(schedule.createdAt) ?? importedAt,
            updatedAt: toImportDate(schedule.updatedAt) ?? importedAt,
          })
          .onConflictDoUpdate({
            target: [
              showSchedules.userId,
              showSchedules.tmdbId,
              showSchedules.dayOfWeek,
            ],
            set: {
              updatedAt: toImportDate(schedule.updatedAt) ?? importedAt,
            },
          });
        result.imported.tvShowSchedules++;
      } catch (e) {
        console.error(
          `Import: failed to insert schedule entry ${index + 1}:`,
          e
        );
        result.errors.push(`Failed to import schedule entry ${index + 1}`);
      }
    }
  }

  // 7. Write activity feed entry for successful import.
  //    LOGIC-07: this was the only activity write in the codebase not wrapped
  //    in try/catch. It runs *after* every row has been committed, so a failure
  //    here threw and the caller saw a 500 despite a successful import. Match
  //    the surrounding convention: log it and carry on.
  try {
    await db.insert(activityFeed).values({
      activityType: ActivityType.PROFILE_IMPORT,
      userId: userId,
      metadata: {
        lists: result.imported.lists,
        listItems: result.imported.listItems,
        contentStatus: result.imported.contentStatus,
        episodeStatus: result.imported.episodeStatus,
        tvShowSchedules: result.imported.tvShowSchedules,
        errors: result.errors.length,
      },
    });
  } catch (e) {
    console.error("Import: failed to write the profile_import activity:", e);
  }

  // 8. Return `ImportResult`, with error strings for individually failed items (which should not cause wholistic failure)
  return result;
}
