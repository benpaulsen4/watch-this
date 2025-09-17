import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import {
  lists,
  listItems,
  userContentStatus,
  episodeWatchStatus,
  activityFeed,
  ActivityType,
} from "@/lib/db/schema";

// POST /api/profile/import - Import user's lists data from JSON only
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const format = formData.get("format") as string;

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!format || format !== "json") {
      return NextResponse.json(
        { error: "Only JSON format is supported for imports" },
        { status: 400 }
      );
    }

    const fileContent = await file.text();
    let importedListsCount = 0;
    let importedContentStatusCount = 0;
    let importedEpisodeStatusCount = 0;
    const errors: string[] = [];

    try {
      const data = JSON.parse(fileContent);

      if (data.lists && Array.isArray(data.lists)) {
        // Process each list
        for (const listData of data.lists) {
          try {
            // Validate required fields
            if (!listData.name || typeof listData.name !== "string") {
              errors.push(
                `Skipped list: name is required and must be a string`
              );
              continue;
            }

            // Create the list
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

            // Process list items if they exist
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
            errors.push(
              `Failed to import list '${listData.name}': ${listError}`
            );
          }
        }
      }

      // Process content status if it exists
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

            // Validate status value
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

            // Validate content type
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
              console.error("Failed to insert content status:", error);
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

      // Process episode watch status if it exists
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

            // Validate season and episode numbers are valid integers
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
              console.error("Failed to insert episode status:", error);
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

      // Create activity feed entry for successful import
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
        } catch (activityError) {
          // Don't fail the import if activity creation fails
          console.error("Failed to create activity entry:", activityError);
        }
      }

      return NextResponse.json({
        success: true,
        imported: {
          lists: importedListsCount,
          contentStatus: importedContentStatusCount,
          episodeStatus: importedEpisodeStatusCount,
        },
        errors: errors,
      });
    } catch (parseError) {
      return NextResponse.json(
        {
          error: `Failed to parse ${format.toUpperCase()} file: ${parseError}`,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Import data error:", error);

    return NextResponse.json(
      { error: "Failed to import data" },
      { status: 500 }
    );
  }
});
