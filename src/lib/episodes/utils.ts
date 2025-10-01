import { db } from "@/lib/db";
import {
  episodeWatchStatus,
  userContentStatus,
  lists,
  listCollaborators,
  listItems,
  activityFeed,
  ContentType,
  WatchStatus,
  ActivityType,
  WatchStatusEnum,
  showSchedules,
} from "@/lib/db/schema";
import { eq, and, or } from "drizzle-orm";
import { tmdbClient } from "@/lib/tmdb/client";
import { syncStatusToCollaborators } from "@/lib/activity/sync-utils";

/**
 * Sync episode status to collaborators in shared lists
 */
export async function syncEpisodeStatusToCollaborators(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean
): Promise<string[]> {
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
              updatedAt: new Date(),
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

/**
 * Update or create episode watch status
 */
export async function updateEpisodeWatchStatus(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean
) {
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

  return result;
}

/**
 * Create activity entry for episode progress
 */
export async function createEpisodeActivityEntry(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean,
  syncedCollaboratorIds: string[],
  episodeName?: string
) {
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
        ...(episodeName && { episodeName }),
      },
      collaborators: syncedCollaboratorIds,
      isCollaborative: syncedCollaboratorIds.length > 0,
    });
  } catch (activityError) {
    console.error("Error creating episode activity entry:", activityError);
    // Don't fail the main operation if activity creation fails
  }
}

/**
 * Update TV show content status based on episode progress
 */
export async function updateTVShowStatus(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean
): Promise<WatchStatusEnum | null> {
  if (!watched) {
    return null;
  }

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

  let newStatus: WatchStatusEnum | null = null;

  if (contentStatus.length === 0) {
    // Create new status as "watching"
    await db.insert(userContentStatus).values({
      userId,
      tmdbId,
      contentType: ContentType.TV,
      status: WatchStatus.WATCHING,
    });
    newStatus = WatchStatus.WATCHING;
  } else if (contentStatus[0].status !== WatchStatus.WATCHING) {
    // Update status to "watching" if it's not already
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
    // Check if this is the last available episode (mark as completed)
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

      // Remove schedules when show is completed
      try {
        const deletedSchedules = await db
          .delete(showSchedules)
          .where(
            and(
              eq(showSchedules.userId, userId),
              eq(showSchedules.tmdbId, tmdbId)
            )
          )
          .returning();
        
        if (deletedSchedules.length > 0) {
          console.log(`Automatically removed ${deletedSchedules.length} schedule(s) for completed show ${tmdbId}`);
        }
      } catch (error) {
        console.error("Error removing schedules for completed show:", error);
        // Don't fail the main operation if schedule cleanup fails
      }
    }
  }

  // Sync status to collaborators if it changed
  if (newStatus) {
    await syncStatusToCollaborators(
      userId,
      tmdbId,
      ContentType.TV,
      newStatus
    );
  }

  return newStatus;
}

/**
 * Complete episode workflow: update status, sync to collaborators, create activity, update show status
 */
export async function completeEpisodeUpdate(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean,
  episodeName?: string
) {
  // Update episode status
  const episodeResult = await updateEpisodeWatchStatus(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched
  );

  // Sync to collaborators
  const syncedCollaboratorIds = await syncEpisodeStatusToCollaborators(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched
  );

  // Create activity entry
  await createEpisodeActivityEntry(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched,
    syncedCollaboratorIds,
    episodeName
  );

  // Update show status
  const newStatus = await updateTVShowStatus(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched
  );

  return {
    episode: episodeResult,
    newStatus,
    syncedCollaboratorIds,
  };
}

/**
 * Batch update multiple episodes
 */
export async function batchUpdateEpisodes(
  userId: string,
  tmdbId: number,
  episodes: Array<{
    seasonNumber: number;
    episodeNumber: number;
    watched: boolean;
  }>
) {
  const results = [];
  const allSyncedCollaboratorIds = new Set<string>();
  let finalStatus = null;

  for (const episode of episodes) {
    const result = await completeEpisodeUpdate(
      userId,
      tmdbId,
      episode.seasonNumber,
      episode.episodeNumber,
      episode.watched
    );
    
    results.push(result.episode);
    result.syncedCollaboratorIds.forEach(id => allSyncedCollaboratorIds.add(id));
    finalStatus = result.newStatus;
  }

  return {
    episodes: results,
    newStatus: finalStatus,
    syncedCollaboratorIds: Array.from(allSyncedCollaboratorIds),
  };
}