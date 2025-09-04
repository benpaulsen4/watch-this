import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  episodeWatchStatus,
  userContentStatus,
  lists,
  listCollaborators,
  listItems,
  ContentType,
  WatchStatusEnum,
  WatchStatus,
  activityFeed,
  ActivityType,
} from "@/lib/db/schema";
import {
  withAuth,
  AuthenticatedRequest,
  handleApiError,
} from "@/lib/auth/api-middleware";
import { eq, and, or } from "drizzle-orm";
import { tmdbClient } from "@/lib";
import { syncStatusToCollaborators } from "@/lib/activity/sync-utils";

// Helper function to sync episode status to collaborators
async function syncEpisodeStatusToCollaborators(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean
) {
  try {
    // Find all lists that contain this TV show and have sync enabled
    const syncEnabledLists = await db
      .select({
        listId: lists.id,
        ownerId: lists.ownerId,
      })
      .from(lists)
      .innerJoin(listItems, eq(listItems.listId, lists.id))
      .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
      .where(
        and(
          eq(lists.syncWatchStatus, true),
          eq(listItems.tmdbId, tmdbId),
          eq(listItems.contentType, ContentType.TV),
          or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId))
        )
      );

    const syncedCollaboratorIds = new Set<string>();

    // For each sync-enabled list, update episode status for all collaborators
    for (const list of syncEnabledLists) {
      // Get all collaborators (including owner) for this list
      const collaborators = await db
        .select({ userId: listCollaborators.userId })
        .from(listCollaborators)
        .where(eq(listCollaborators.listId, list.listId));

      // Add the owner to the collaborators list
      const allUsers = [
        ...collaborators.map((c) => c.userId),
        list.ownerId,
      ].filter((id) => id !== userId); // Exclude the user who made the update

      // Update episode status for each collaborator
      for (const collaboratorId of allUsers) {
        // Check if collaborator already has episode status
        const existingEpisodeStatus = await db
          .select()
          .from(episodeWatchStatus)
          .where(
            and(
              eq(episodeWatchStatus.userId, collaboratorId),
              eq(episodeWatchStatus.tmdbId, tmdbId),
              eq(episodeWatchStatus.seasonNumber, seasonNumber),
              eq(episodeWatchStatus.episodeNumber, episodeNumber)
            )
          )
          .limit(1);

        if (existingEpisodeStatus.length === 0) {
          // Create new episode status
          await db.insert(episodeWatchStatus).values({
            userId: collaboratorId,
            tmdbId,
            seasonNumber,
            episodeNumber,
            watched: watched,
            watchedAt: watched ? new Date() : null,
          });
        } else {
          // Update existing status
          await db
            .update(episodeWatchStatus)
            .set({
              watched: watched,
              watchedAt: watched ? new Date() : null,
            })
            .where(
              and(
                eq(episodeWatchStatus.userId, collaboratorId),
                eq(episodeWatchStatus.tmdbId, tmdbId),
                eq(episodeWatchStatus.seasonNumber, seasonNumber),
                eq(episodeWatchStatus.episodeNumber, episodeNumber)
              )
            );
        }
        syncedCollaboratorIds.add(collaboratorId);
      }
    }

    return Array.from(syncedCollaboratorIds);
  } catch (error) {
    console.error("Error syncing episode status to collaborators:", error);
    // Don't throw error to avoid breaking the main status update
    return [];
  }
}

// GET /api/status/episodes - Get episode watch status for authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const seasonNumber = searchParams.get("seasonNumber");
    const episodeNumber = searchParams.get("episodeNumber");

    if (!tmdbId) {
      return NextResponse.json(
        { error: "tmdbId is required" },
        { status: 400 }
      );
    }

    // Build query conditions
    const conditions = [
      eq(episodeWatchStatus.userId, userId),
      eq(episodeWatchStatus.tmdbId, parseInt(tmdbId)),
    ];

    // Filter by season if provided
    if (seasonNumber) {
      conditions.push(
        eq(episodeWatchStatus.seasonNumber, parseInt(seasonNumber))
      );
    }

    // Filter by specific episode if both season and episode are provided
    if (episodeNumber) {
      conditions.push(
        eq(episodeWatchStatus.episodeNumber, parseInt(episodeNumber))
      );
    }

    const episodes = await db
      .select()
      .from(episodeWatchStatus)
      .where(and(...conditions));

    return NextResponse.json({ episodes });
  } catch (error) {
    return handleApiError(error, "Get episode status");
  }
});

// POST /api/status/episodes - Mark episode as watched/unwatched
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json();
    const { tmdbId, seasonNumber, episodeNumber, watched = true } = body;

    // Validation
    if (!tmdbId || seasonNumber === undefined || episodeNumber === undefined) {
      return NextResponse.json(
        { error: "tmdbId, seasonNumber, and episodeNumber are required" },
        { status: 400 }
      );
    }

    if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number") {
      return NextResponse.json(
        { error: "seasonNumber and episodeNumber must be numbers" },
        { status: 400 }
      );
    }

    if (seasonNumber < 0 || episodeNumber < 1) {
      return NextResponse.json(
        { error: "Invalid season or episode number" },
        { status: 400 }
      );
    }

    // Check if episode status already exists
    const existingStatus = await db
      .select()
      .from(episodeWatchStatus)
      .where(
        and(
          eq(episodeWatchStatus.userId, userId),
          eq(episodeWatchStatus.tmdbId, tmdbId),
          eq(episodeWatchStatus.seasonNumber, seasonNumber),
          eq(episodeWatchStatus.episodeNumber, episodeNumber)
        )
      )
      .limit(1);

    let result;
    if (existingStatus.length > 0) {
      // Update existing status
      [result] = await db
        .update(episodeWatchStatus)
        .set({
          watched,
          watchedAt: watched ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWatchStatus.userId, userId),
            eq(episodeWatchStatus.tmdbId, tmdbId),
            eq(episodeWatchStatus.seasonNumber, seasonNumber),
            eq(episodeWatchStatus.episodeNumber, episodeNumber)
          )
        )
        .returning();
    } else {
      // Create new status
      [result] = await db
        .insert(episodeWatchStatus)
        .values({
          userId,
          tmdbId,
          seasonNumber,
          episodeNumber,
          watched,
          watchedAt: watched ? new Date() : null,
        })
        .returning();
    }

    // Sync episode status to collaborators if applicable
    const syncedCollaboratorIds = await syncEpisodeStatusToCollaborators(
      userId,
      tmdbId,
      seasonNumber,
      episodeNumber,
      watched
    );

    // Create activity entry for episode progress
    try {
      const showDetails = await tmdbClient.getTVShowDetails(tmdbId);
      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.EPISODE_PROGRESS,
        tmdbId,
        contentType: ContentType.TV,
        metadata: {
          seasonNumber,
          episodeNumber,
          watched,
          title: showDetails.name,
          posterPath: showDetails.poster_path,
        },
        collaborators: syncedCollaboratorIds,
        isCollaborative: syncedCollaboratorIds.length > 0,
      });
    } catch (activityError) {
      console.error("Error creating episode activity entry:", activityError);
      // Don't fail the main operation if activity creation fails
    }

    let newStatus: WatchStatusEnum | null = null;

    //Check if show status needs to be updated
    if (watched) {
      const contentStatus = await db
        .select()
        .from(userContentStatus)
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, ContentType.TV)
          )
        )
        .limit(1);

      if (contentStatus.length === 0) {
        await db.insert(userContentStatus).values({
          userId,
          tmdbId,
          contentType: ContentType.TV,
          status: WatchStatus.WATCHING,
        });

        newStatus = WatchStatus.WATCHING;
      } else if (contentStatus[0].status !== WatchStatus.WATCHING) {
        await db
          .update(userContentStatus)
          .set({
            status: WatchStatus.WATCHING,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userContentStatus.userId, userId),
              eq(userContentStatus.tmdbId, tmdbId),
              eq(userContentStatus.contentType, ContentType.TV)
            )
          );

        newStatus = WatchStatus.WATCHING;
      } else {
        //If status is already watching, check if this is the last episode
        const showDetails = await tmdbClient.getTVShowDetails(tmdbId);
        if (
          showDetails.last_episode_to_air &&
          showDetails.last_episode_to_air.season_number === seasonNumber &&
          showDetails.last_episode_to_air.episode_number === episodeNumber
        ) {
          const inOneMonth = new Date();
          inOneMonth.setMonth(inOneMonth.getMonth() + 1);

          await db
            .update(userContentStatus)
            .set({
              status: WatchStatus.COMPLETED,
              updatedAt: new Date(),
              nextEpisodeDate: showDetails.next_episode_to_air
                ? new Date(showDetails.next_episode_to_air.air_date)
                : showDetails.status === "Ended"
                ? null
                : inOneMonth,
            })
            .where(
              and(
                eq(userContentStatus.userId, userId),
                eq(userContentStatus.tmdbId, tmdbId),
                eq(userContentStatus.contentType, ContentType.TV)
              )
            );

          newStatus = WatchStatus.COMPLETED;
        }
      }

      if (newStatus) {
        await syncStatusToCollaborators(
          userId,
          tmdbId,
          ContentType.TV,
          newStatus
        );
      }
    }

    return NextResponse.json({ episode: result, newStatus }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Update episode status");
  }
});

// PUT /api/status/episodes/batch - Batch update multiple episodes
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json();
    const { tmdbId, episodes } = body;

    // Validation
    if (!tmdbId || !Array.isArray(episodes)) {
      return NextResponse.json(
        { error: "tmdbId and episodes array are required" },
        { status: 400 }
      );
    }

    if (episodes.length === 0) {
      return NextResponse.json(
        { error: "Episodes array cannot be empty" },
        { status: 400 }
      );
    }

    if (episodes.length > 100) {
      return NextResponse.json(
        { error: "Cannot update more than 100 episodes at once" },
        { status: 400 }
      );
    }

    // Validate each episode
    for (const episode of episodes) {
      if (
        typeof episode.seasonNumber !== "number" ||
        typeof episode.episodeNumber !== "number" ||
        typeof episode.watched !== "boolean"
      ) {
        return NextResponse.json(
          {
            error:
              "Each episode must have seasonNumber, episodeNumber, and watched properties",
          },
          { status: 400 }
        );
      }
    }

    const results = [];

    // Process each episode
    for (const episode of episodes) {
      const { seasonNumber, episodeNumber, watched } = episode;

      // Check if episode status already exists
      const existingStatus = await db
        .select()
        .from(episodeWatchStatus)
        .where(
          and(
            eq(episodeWatchStatus.userId, userId),
            eq(episodeWatchStatus.tmdbId, tmdbId),
            eq(episodeWatchStatus.seasonNumber, seasonNumber),
            eq(episodeWatchStatus.episodeNumber, episodeNumber)
          )
        )
        .limit(1);

      let result;
      if (existingStatus.length > 0) {
        // Update existing status
        [result] = await db
          .update(episodeWatchStatus)
          .set({
            watched,
            watchedAt: watched ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(episodeWatchStatus.userId, userId),
              eq(episodeWatchStatus.tmdbId, tmdbId),
              eq(episodeWatchStatus.seasonNumber, seasonNumber),
              eq(episodeWatchStatus.episodeNumber, episodeNumber)
            )
          )
          .returning();
      } else {
        // Create new status
        [result] = await db
          .insert(episodeWatchStatus)
          .values({
            userId,
            tmdbId,
            seasonNumber,
            episodeNumber,
            watched,
            watchedAt: watched ? new Date() : null,
          })
          .returning();
      }

      results.push(result);
      // Sync episode status to collaborators if applicable
      const syncedCollaboratorIds = await syncEpisodeStatusToCollaborators(
        userId,
        tmdbId,
        seasonNumber,
        episodeNumber,
        watched
      );

      // Create activity entry for episode progress
      try {
        const showDetails = await tmdbClient.getTVShowDetails(tmdbId);
        await db.insert(activityFeed).values({
          userId,
          activityType: ActivityType.EPISODE_PROGRESS,
          tmdbId,
          contentType: ContentType.TV,
          metadata: {
            seasonNumber,
            episodeNumber,
            watched,
            title: showDetails.name,
            posterPath: showDetails.poster_path,
          },
          collaborators: syncedCollaboratorIds,
          isCollaborative: syncedCollaboratorIds.length > 0,
        });
      } catch (activityError) {
        console.error("Error creating episode activity entry:", activityError);
        // Don't fail the main operation if activity creation fails
      }
    }

    let newStatus: WatchStatusEnum | null = null;

    //Check if show status needs to be updated
    if (episodes.some((episode) => episode.watched)) {
      const contentStatus = await db
        .select()
        .from(userContentStatus)
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, ContentType.TV)
          )
        )
        .limit(1);

      if (contentStatus.length === 0) {
        await db.insert(userContentStatus).values({
          userId,
          tmdbId,
          contentType: ContentType.TV,
          status: WatchStatus.WATCHING,
        });

        newStatus = WatchStatus.WATCHING;
      } else if (contentStatus[0].status !== WatchStatus.WATCHING) {
        await db
          .update(userContentStatus)
          .set({
            status: WatchStatus.WATCHING,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(userContentStatus.userId, userId),
              eq(userContentStatus.tmdbId, tmdbId),
              eq(userContentStatus.contentType, ContentType.TV)
            )
          );

        newStatus = WatchStatus.WATCHING;
      } else {
        //If status is already watching, check if this is the last episode
        const showDetails = await tmdbClient.getTVShowDetails(tmdbId);
        if (
          showDetails.last_episode_to_air &&
          episodes.some(
            (episode) =>
              episode.seasonNumber ===
                showDetails.last_episode_to_air?.season_number &&
              episode.episodeNumber ===
                showDetails.last_episode_to_air?.episode_number
          )
        ) {
          await db
            .update(userContentStatus)
            .set({
              status: WatchStatus.COMPLETED,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(userContentStatus.userId, userId),
                eq(userContentStatus.tmdbId, tmdbId),
                eq(userContentStatus.contentType, ContentType.TV)
              )
            );
          newStatus = WatchStatus.COMPLETED;
        }
      }

      if (newStatus) {
        await syncStatusToCollaborators(
          userId,
          tmdbId,
          ContentType.TV,
          newStatus
        );
      }
    }

    return NextResponse.json({ episodes: results, newStatus });
  } catch (error) {
    return handleApiError(error, "Batch update episode status");
  }
});

// DELETE /api/status/episodes - Remove episode watch status
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const seasonNumber = searchParams.get("seasonNumber");
    const episodeNumber = searchParams.get("episodeNumber");

    if (!tmdbId) {
      return NextResponse.json(
        { error: "tmdbId is required" },
        { status: 400 }
      );
    }

    let deleteCondition = and(
      eq(episodeWatchStatus.userId, userId),
      eq(episodeWatchStatus.tmdbId, parseInt(tmdbId))
    );

    // If season and episode are specified, delete specific episode
    if (seasonNumber && episodeNumber) {
      deleteCondition = and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, parseInt(tmdbId)),
        eq(episodeWatchStatus.seasonNumber, parseInt(seasonNumber)),
        eq(episodeWatchStatus.episodeNumber, parseInt(episodeNumber))
      );
    }
    // If only season is specified, delete all episodes in that season
    else if (seasonNumber) {
      deleteCondition = and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, parseInt(tmdbId)),
        eq(episodeWatchStatus.seasonNumber, parseInt(seasonNumber))
      );
    }
    // If neither is specified, delete all episodes for the show

    const deletedEpisodes = await db
      .delete(episodeWatchStatus)
      .where(deleteCondition)
      .returning();

    return NextResponse.json({
      message: `Removed ${deletedEpisodes.length} episode status(es) successfully`,
      deletedCount: deletedEpisodes.length,
    });
  } catch (error) {
    return handleApiError(error, "Delete episode status");
  }
});
