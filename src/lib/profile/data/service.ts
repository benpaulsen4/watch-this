import { db } from "@/lib/db";
import {
  lists,
  listItems,
  userContentStatus,
  episodeWatchStatus,
  activityFeed,
  ActivityType,
  type NewUserStreamingProvider,
} from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";
import JSZip from "jszip";
import type { ExportFormat, ExportResponse, ImportResult } from "./types";

export async function exportUserData(
  userId: string,
  username: string,
  format: ExportFormat
): Promise<ExportResponse | "zipFailed"> {
  const timestamp = new Date().toISOString().split("T")[0];

  const userLists = await db
    .select({
      listId: lists.id,
      listName: lists.name,
      listDescription: lists.description,
      listType: lists.listType,
      isPublic: lists.isPublic,
      listCreatedAt: lists.createdAt,
      itemId: listItems.id,
      tmdbId: listItems.tmdbId,
      contentType: listItems.contentType,
      title: listItems.title,
      posterPath: listItems.posterPath,
      createdAt: listItems.createdAt,
    })
    .from(lists)
    .leftJoin(listItems, eq(lists.id, listItems.listId))
    .where(eq(lists.ownerId, userId))
    .orderBy(asc(lists.createdAt));

  let contentStatuses: Array<{
    tmdbId: number;
    contentType: string;
    status: string;
    nextEpisodeDate: Date | null;
    updatedAt: Date | null;
    createdAt: Date | null;
  }> = [];
  try {
    contentStatuses = await db
      .select({
        tmdbId: userContentStatus.tmdbId,
        contentType: userContentStatus.contentType,
        status: userContentStatus.status,
        nextEpisodeDate: userContentStatus.nextEpisodeDate,
        updatedAt: userContentStatus.updatedAt,
        createdAt: userContentStatus.createdAt,
      })
      .from(userContentStatus)
      .where(eq(userContentStatus.userId, userId));
  } catch {}

  let episodeStatuses: Array<{
    tmdbId: number;
    seasonNumber: number;
    episodeNumber: number;
    watched: boolean;
    watchedAt: Date | null;
    createdAt: Date | null;
    updatedAt: Date | null;
  }> = [];
  try {
    episodeStatuses = await db
      .select({
        tmdbId: episodeWatchStatus.tmdbId,
        seasonNumber: episodeWatchStatus.seasonNumber,
        episodeNumber: episodeWatchStatus.episodeNumber,
        watched: episodeWatchStatus.watched,
        watchedAt: episodeWatchStatus.watchedAt,
        createdAt: episodeWatchStatus.createdAt,
        updatedAt: episodeWatchStatus.updatedAt,
      })
      .from(episodeWatchStatus)
      .where(eq(episodeWatchStatus.userId, userId));
  } catch {}

  const listsData = userLists.reduce(
    (acc, row) => {
      const listId = row.listId as unknown as string;
      if (!acc[listId]) {
        acc[listId] = {
          id: row.listId,
          name: row.listName,
          description: row.listDescription,
          type: row.listType,
          isPublic: row.isPublic,
          createdAt: row.listCreatedAt,
          items: [],
        };
      }
      if (row.itemId && row.contentType && row.title) {
        acc[listId].items.push({
          id: row.itemId,
          tmdbId: row.tmdbId,
          contentType: row.contentType,
          title: row.title,
          posterPath: row.posterPath,
          createdAt: row.createdAt,
        });
      }
      return acc;
    },
    {} as Record<
      string,
      {
        id: string;
        name: string;
        description: string | null;
        type: string;
        isPublic: boolean;
        createdAt: Date;
        items: {
          id: string;
          tmdbId: number | null;
          contentType: string;
          title: string;
          posterPath: string | null;
          createdAt: Date | null;
        }[];
      }
    >
  );

  const listsArray = Object.values(listsData);

  if (format === "json") {
    const jsonData = {
      exportedAt: new Date().toISOString(),
      user: { username },
      lists: listsArray.map((list) => ({
        id: list.id,
        name: list.name,
        description: list.description,
        type: list.type,
        isPublic: list.isPublic,
        createdAt: list.createdAt.toISOString(),
        items: list.items.map((item) => ({
          id: item.id,
          tmdbId: item.tmdbId,
          contentType: item.contentType,
          title: item.title,
          posterPath: item.posterPath,
          createdAt: item.createdAt ? item.createdAt.toISOString() : null,
        })),
      })),
      contentStatus: contentStatuses.map((status) => ({
        tmdbId: status.tmdbId,
        contentType: status.contentType,
        status: status.status,
        nextEpisodeDate: status.nextEpisodeDate?.toISOString() || null,
        updatedAt: status.updatedAt?.toISOString() || null,
        createdAt: status.createdAt?.toISOString() || null,
      })),
      episodeWatchStatus: episodeStatuses.map((episode) => ({
        tmdbId: episode.tmdbId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        watched: episode.watched,
        watchedAt: episode.watchedAt?.toISOString() || null,
        createdAt: episode.createdAt?.toISOString() || null,
        updatedAt: episode.updatedAt?.toISOString() || null,
      })),
    };
    return {
      data: JSON.stringify(jsonData, null, 2),
      filename: `watchthis-${username}-${timestamp}.json`,
    };
  }

  const zip = new JSZip();
  const arrayToCSV = (rows: (string | number | boolean)[][]) =>
    rows
      .map((row) =>
        row
          .map((field) => {
            const fieldStr = String(field);
            return fieldStr.includes(",") ||
              fieldStr.includes('"') ||
              fieldStr.includes("\n")
              ? `"${fieldStr.replace(/"/g, '""')}"`
              : fieldStr;
          })
          .join(",")
      )
      .join("\n");

  const listsRows: (string | number | boolean)[][] = [];
  listsRows.push([
    "List Name",
    "List Description",
    "List Type",
    "List Is Public",
    "List Created At",
    "Item Title",
    "Item TMDB ID",
    "Item Content Type",
    "Item Poster Path",
    "Item Notes",
    "Item Added At",
    "Item Sort Order",
  ]);

  for (const list of listsArray) {
    if (list.items.length === 0) {
      listsRows.push([
        list.name,
        list.description || "",
        list.type,
        list.isPublic.toString(),
        list.createdAt.toISOString(),
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
    } else {
      for (const item of list.items) {
        listsRows.push([
          list.name,
          list.description || "",
          list.type,
          list.isPublic.toString(),
          list.createdAt.toISOString(),
          item.title,
          item.tmdbId?.toString() || "",
          item.contentType,
          item.posterPath || "",
          item.createdAt?.toISOString() || "",
        ]);
      }
    }
  }

  const contentStatusRows: (string | number | boolean)[][] = [];
  contentStatusRows.push([
    "TMDB ID",
    "Content Type",
    "Status",
    "Next Episode Date",
    "Updated At",
    "Created At",
  ]);
  for (const status of contentStatuses) {
    contentStatusRows.push([
      status.tmdbId?.toString() || "",
      status.contentType,
      status.status,
      status.nextEpisodeDate?.toISOString() || "",
      status.updatedAt?.toISOString() || "",
      status.createdAt?.toISOString() || "",
    ]);
  }

  const episodeStatusRows: (string | number | boolean)[][] = [];
  episodeStatusRows.push([
    "TMDB ID",
    "Season Number",
    "Episode Number",
    "Watched",
    "Watched At",
    "Created At",
    "Updated At",
  ]);
  for (const episode of episodeStatuses) {
    episodeStatusRows.push([
      episode.tmdbId.toString(),
      episode.seasonNumber.toString(),
      episode.episodeNumber.toString(),
      episode.watched.toString(),
      episode.watchedAt?.toISOString() || "",
      episode.createdAt?.toISOString() || "",
      episode.updatedAt?.toISOString() || "",
    ]);
  }

  zip.file("lists_and_items.csv", arrayToCSV(listsRows));
  zip.file("content_status.csv", arrayToCSV(contentStatusRows));
  zip.file("episode_watch_status.csv", arrayToCSV(episodeStatusRows));

  try {
    const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
    const zipBase64 = Buffer.from(zipBuffer).toString("base64");
    return {
      data: zipBase64,
      filename: `watchthis-${username}-${timestamp}.zip`,
      isZip: true,
    };
  } catch {
    return "zipFailed";
  }
}

export async function importUserData(
  userId: string,
  fileContent: string,
  format: "json"
): Promise<ImportResult | "parseError"> {
  let importedListsCount = 0;
  let importedContentStatusCount = 0;
  let importedEpisodeStatusCount = 0;
  const errors: string[] = [];

  let data: any;
  try {
    data = JSON.parse(fileContent);
  } catch (e) {
    return "parseError";
  }

  if (data.lists && Array.isArray(data.lists)) {
    for (const listData of data.lists) {
      try {
        if (!listData.name || typeof listData.name !== "string") {
          errors.push(`Skipped list: name is required and must be a string`);
          continue;
        }
        const [newList] = await db
          .insert(lists)
          .values({
            ownerId: userId,
            name: listData.name,
            description: listData.description || null,
            listType: listData.type || "mixed",
            isPublic: listData.isPublic || false,
          })
          .returning();
        if (listData.items && Array.isArray(listData.items)) {
          for (const itemData of listData.items) {
            try {
              if (
                !itemData.title ||
                !itemData.tmdbId ||
                !itemData.contentType
              ) {
                errors.push(
                  `Skipped item in list '${listData.name}': title, tmdbId, and contentType are required`
                );
                continue;
              }
              await db.insert(listItems).values({
                listId: newList.id,
                tmdbId: itemData.tmdbId,
                contentType: itemData.contentType,
                title: itemData.title,
                posterPath: itemData.posterPath || null,
              });
            } catch (itemError) {
              errors.push(
                `Failed to import item '${itemData.title}' in list '${listData.name}': ${itemError}`
              );
            }
          }
        }
        importedListsCount++;
      } catch (listError) {
        errors.push(`Failed to import list '${listData.name}': ${listError}`);
      }
    }
  }

  if (data.contentStatus && Array.isArray(data.contentStatus)) {
    for (const statusData of data.contentStatus) {
      try {
        if (
          !statusData.tmdbId ||
          !statusData.contentType ||
          !statusData.status
        ) {
          errors.push(
            `Skipped content status: tmdbId, contentType, and status are required`
          );
          continue;
        }
        const validStatuses = [
          "planning",
          "watching",
          "completed",
          "paused",
          "dropped",
        ];
        if (!validStatuses.includes(statusData.status)) {
          errors.push(
            `Skipped content status for TMDB ID ${statusData.tmdbId}: invalid status '${statusData.status}'`
          );
          continue;
        }
        const validContentTypes = ["movie", "tv"];
        if (!validContentTypes.includes(statusData.contentType)) {
          errors.push(
            `Skipped content status for TMDB ID ${statusData.tmdbId}: invalid content type '${statusData.contentType}'`
          );
          continue;
        }
        try {
          await db
            .insert(userContentStatus)
            .values({
              userId: userId,
              tmdbId: statusData.tmdbId,
              contentType: statusData.contentType,
              status: statusData.status,
              nextEpisodeDate: statusData.nextEpisodeDate
                ? new Date(statusData.nextEpisodeDate)
                : null,
            })
            .onConflictDoUpdate({
              target: [
                userContentStatus.userId,
                userContentStatus.tmdbId,
                userContentStatus.contentType,
              ],
              set: {
                status: statusData.status,
                nextEpisodeDate: statusData.nextEpisodeDate
                  ? new Date(statusData.nextEpisodeDate)
                  : null,
                updatedAt: new Date(),
              },
            });
        } catch (error) {
          errors.push(
            `Failed to import content status for TMDB ID ${
              statusData.tmdbId
            }: ${error instanceof Error ? error.message : "Unknown error"}`
          );
          continue;
        }
        importedContentStatusCount++;
      } catch (statusError) {
        errors.push(
          `Failed to import content status for TMDB ID ${statusData.tmdbId}: ${statusError}`
        );
      }
    }
  }

  if (data.episodeWatchStatus && Array.isArray(data.episodeWatchStatus)) {
    for (const episodeData of data.episodeWatchStatus) {
      try {
        if (
          !episodeData.tmdbId ||
          episodeData.seasonNumber === undefined ||
          episodeData.episodeNumber === undefined
        ) {
          errors.push(
            `Skipped episode status: tmdbId, seasonNumber, and episodeNumber are required`
          );
          continue;
        }
        const seasonNum = parseInt(episodeData.seasonNumber);
        const episodeNum = parseInt(episodeData.episodeNumber);
        if (isNaN(seasonNum) || seasonNum < 0) {
          errors.push(
            `Skipped episode status for TMDB ID ${episodeData.tmdbId}: invalid season number '${episodeData.seasonNumber}'`
          );
          continue;
        }
        if (isNaN(episodeNum) || episodeNum < 1) {
          errors.push(
            `Skipped episode status for TMDB ID ${episodeData.tmdbId}: invalid episode number '${episodeData.episodeNumber}'`
          );
          continue;
        }
        try {
          await db
            .insert(episodeWatchStatus)
            .values({
              userId: userId,
              tmdbId: episodeData.tmdbId,
              seasonNumber: seasonNum,
              episodeNumber: episodeNum,
              watched: episodeData.watched ?? false,
              watchedAt: episodeData.watchedAt
                ? new Date(episodeData.watchedAt)
                : null,
            })
            .onConflictDoUpdate({
              target: [
                episodeWatchStatus.userId,
                episodeWatchStatus.tmdbId,
                episodeWatchStatus.seasonNumber,
                episodeWatchStatus.episodeNumber,
              ],
              set: {
                watched: episodeData.watched ?? false,
                watchedAt: episodeData.watchedAt
                  ? new Date(episodeData.watchedAt)
                  : null,
                updatedAt: new Date(),
              },
            });
        } catch (error) {
          errors.push(
            `Failed to import episode status for TMDB ID ${
              episodeData.tmdbId
            } S${seasonNum}E${episodeNum}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
          continue;
        }
        importedEpisodeStatusCount++;
      } catch (episodeError) {
        errors.push(
          `Failed to import episode status for TMDB ID ${episodeData.tmdbId} S${episodeData.seasonNumber}E${episodeData.episodeNumber}: ${episodeError}`
        );
      }
    }
  }

  const totalImported =
    importedListsCount +
    importedContentStatusCount +
    importedEpisodeStatusCount;
  if (totalImported > 0) {
    try {
      await db.insert(activityFeed).values({
        userId: userId,
        activityType: ActivityType.PROFILE_IMPORT,
        metadata: {
          lists: importedListsCount,
          contentStatus: importedContentStatusCount,
          episodeStatus: importedEpisodeStatusCount,
          errors: errors.length,
        },
      });
    } catch {}
  }

  const result: ImportResult = {
    success: true,
    imported: {
      lists: importedListsCount,
      contentStatus: importedContentStatusCount,
      episodeStatus: importedEpisodeStatusCount,
    },
    errors,
  };

  return result;
}
