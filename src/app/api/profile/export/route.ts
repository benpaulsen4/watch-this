import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import {
  lists,
  listItems,
  userContentStatus,
  episodeWatchStatus,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import JSZip from "jszip";

// GET /api/profile/export?format=csv|json - Export user's lists data
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const url = new URL(request.url);
    const format = url.searchParams.get("format");

    if (!format || !["csv", "json"].includes(format)) {
      return NextResponse.json(
        { error: "Format parameter is required and must be 'csv' or 'json'" },
        { status: 400 },
      );
    }

    // Get all user's lists with their items
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

    // Get user's content status with error handling
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
    } catch (error) {
      console.error("Failed to fetch content status:", error);
      // Continue with empty array - don't fail the entire export
    }

    // Get user's episode watch status with error handling
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
    } catch (error) {
      console.error("Failed to fetch episode status:", error);
      // Continue with empty array - don't fail the entire export
    }

    // Group data by lists
    const listsData = userLists.reduce(
      (acc, row) => {
        const listId = row.listId;

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
      >,
    );

    const listsArray = Object.values(listsData) as Array<{
      id: string;
      name: string;
      description: string | null;
      type: string;
      isPublic: boolean;
      createdAt: Date;
      items: Array<{
        id: string;
        tmdbId: number | null;
        contentType: string;
        title: string;
        posterPath: string | null;
        createdAt: Date | null;
      }>;
    }>;
    const timestamp = new Date().toISOString().split("T")[0];
    const username = request.user.username;

    if (format === "json") {
      const jsonData = {
        exportedAt: new Date().toISOString(),
        user: {
          username: request.user.username,
        },
        lists: listsArray,
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

      return NextResponse.json({
        data: JSON.stringify(jsonData, null, 2),
        filename: `watchthis-${username}-${timestamp}.json`,
      });
    }

    if (format === "csv") {
      const zip = new JSZip();

      // Helper function to convert array to CSV
      const arrayToCSV = (rows: (string | number | boolean)[][]) => {
        return rows
          .map((row) =>
            row
              .map((field) => {
                const fieldStr = String(field);
                // Escape quotes and wrap in quotes if contains comma, quote, or newline
                return fieldStr.includes(",") ||
                  fieldStr.includes('"') ||
                  fieldStr.includes("\n")
                  ? `"${fieldStr.replace(/"/g, '""')}"`
                  : fieldStr;
              })
              .join(","),
          )
          .join("\n");
      };

      // Create lists and items CSV
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

      // Create content status CSV
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

      // Create episode watch status CSV
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

      // Add CSV files to ZIP
      zip.file("lists_and_items.csv", arrayToCSV(listsRows));
      zip.file("content_status.csv", arrayToCSV(contentStatusRows));
      zip.file("episode_watch_status.csv", arrayToCSV(episodeStatusRows));

      // Generate ZIP file
      try {
        const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });
        const zipBase64 = Buffer.from(zipBuffer).toString("base64");

        return NextResponse.json({
          data: zipBase64,
          filename: `watchthis-${username}-${timestamp}.zip`,
          isZip: true,
        });
      } catch (zipError) {
        console.error("ZIP generation failed:", zipError);
        return NextResponse.json(
          { error: "Failed to generate ZIP file" },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
  } catch (error) {
    console.error("Export data error:", error);

    return NextResponse.json(
      { error: "Failed to export data" },
      { status: 500 },
    );
  }
});
