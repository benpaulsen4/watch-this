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
): Promise<ImportResult | "parseError"> {
  // 1. Parse JSON to `JSONImportModel` (or return 'parseError')
  let importModel: JSONImportModel;
  try {
    importModel = JSON.parse(fileContent);
  } catch {
    return "parseError";
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

  // 2. Import lists from `JSONImportModel.lists` to the `lists` table (update existing lists)
  if (importModel.lists) {
    for (const list of importModel.lists) {
      try {
        await db
          .insert(lists)
          .values({
            id: list.id,
            ownerId: userId,
            name: list.name,
            description: list.description,
            listType: list.listType,
            isPublic: list.isPublic,
            isArchived: list.isArchived,
            syncWatchStatus: list.syncWatchStatus,
            createdAt: new Date(list.createdAt),
            updatedAt: new Date(list.updatedAt),
          })
          .onConflictDoUpdate({
            target: lists.id,
            set: {
              name: list.name,
              description: list.description,
              listType: list.listType,
              isPublic: list.isPublic,
              isArchived: list.isArchived,
              syncWatchStatus: list.syncWatchStatus,
              updatedAt: new Date(list.updatedAt),
            },
          });
        result.imported.lists++;

        // 3. Import list items from `JSONImportModel.listItems` to the `list_items` table (ignore existing items)
        if (list.items) {
          for (const item of list.items) {
            // 3a. Before adding the item to the list, first try adding it to the `tmdb_cache` table to ensure it exists
            try {
              await addToCache(item.tmdbId, item.contentType);
            } catch (e) {
              result.errors.push(
                `Failed to import list item ${item.tmdbId} for list ${list.id}: ${e}`
              );
              continue; // Skip this item if cache addition fails
            }
            // 3b. If cache addition is successful, insert the list item into the `list_items` table
            try {
              await db
                .insert(listItems)
                .values({
                  id: item.id,
                  listId: list.id, // Ensure it belongs to the imported list
                  tmdbId: item.tmdbId,
                  contentType: item.contentType,
                  createdAt: new Date(item.createdAt),
                })
                .onConflictDoNothing();
              result.imported.listItems++;
            } catch (e) {
              result.errors.push(
                `Failed to import list item ${item.tmdbId} for list ${list.id}: ${e}`
              );
            }
          }
        }
      } catch (e) {
        result.errors.push(`Failed to import list ${list.id}: ${e}`);
      }
    }
  }

  // 4. Import content status from `JSONImportModel.contentStatus` to the `user_content_status` table (update existing status)
  if (importModel.contentStatus) {
    for (const status of importModel.contentStatus) {
      try {
        await db
          .insert(userContentStatus)
          .values({
            id: status.id,
            userId: userId,
            tmdbId: status.tmdbId,
            contentType: status.contentType,
            status: status.status,
            createdAt: new Date(status.createdAt),
            updatedAt: new Date(status.updatedAt),
          })
          .onConflictDoUpdate({
            target: [
              userContentStatus.userId,
              userContentStatus.tmdbId,
              userContentStatus.contentType,
            ],
            set: {
              status: status.status,
              updatedAt: new Date(status.updatedAt),
            },
          });
        result.imported.contentStatus++;
      } catch (e) {
        result.errors.push(
          `Failed to import content status for ${status.tmdbId}: ${e}`
        );
      }
    }
  }

  // 5. Import episode status from `JSONImportModel.episodeStatus` to the `episode_watch_status` table (update existing status)
  if (importModel.episodeStatus) {
    for (const status of importModel.episodeStatus) {
      try {
        await db
          .insert(episodeWatchStatus)
          .values({
            id: status.id,
            userId: userId,
            tmdbId: status.tmdbId,
            seasonNumber: status.seasonNumber,
            episodeNumber: status.episodeNumber,
            watched: status.watched,
            watchedAt: status.watchedAt ? new Date(status.watchedAt) : null,
            createdAt: new Date(status.createdAt),
            updatedAt: new Date(status.updatedAt),
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
              watchedAt: status.watchedAt ? new Date(status.watchedAt) : null,
              updatedAt: new Date(status.updatedAt),
            },
          });
        result.imported.episodeStatus++;
      } catch (e) {
        result.errors.push(
          `Failed to import episode status for ${status.tmdbId} S${status.seasonNumber}E${status.episodeNumber}: ${e}`
        );
      }
    }
  }

  // 6. Import TV show schedules from `JSONImportModel.tvShowSchedules` to the `show_schedules` table (update existing schedules)
  if (importModel.tvShowSchedules) {
    for (const schedule of importModel.tvShowSchedules) {
      try {
        await db
          .insert(showSchedules)
          .values({
            id: schedule.id,
            userId: userId,
            tmdbId: schedule.tmdbId,
            dayOfWeek: schedule.dayOfWeek,
            createdAt: new Date(schedule.createdAt),
            updatedAt: new Date(schedule.updatedAt),
          })
          .onConflictDoUpdate({
            target: [
              showSchedules.userId,
              showSchedules.tmdbId,
              showSchedules.dayOfWeek,
            ],
            set: {
              updatedAt: new Date(schedule.updatedAt),
            },
          });
        result.imported.tvShowSchedules++;
      } catch (e) {
        result.errors.push(
          `Failed to import schedule for ${schedule.tmdbId}: ${e}`
        );
      }
    }
  }

  // 7. Write activity feed entry for successful import
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

  // 8. Return `ImportResult`, with error strings for individually failed items (which should not cause wholistic failure)
  return result;
}
