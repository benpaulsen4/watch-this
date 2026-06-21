import { and, eq, or } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  activityFeed,
  ActivityType,
  ContentType,
  episodeWatchStatus,
  listCollaborators,
  listItems,
  lists,
  showSchedules,
  userContentStatus,
  WatchStatus,
  WatchStatusEnum,
} from "@/lib/db/schema";
import { tmdbClient } from "@/lib/tmdb/client";

import { syncStatusToCollaborators } from "../activity/activityUtils";

type TVShowProgressState = {
  nextEpisodeDate: Date | null;
  shouldMarkCompleted: boolean;
};

function areDatesEqual(
  left: Date | null | undefined,
  right: Date | null | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return left.getTime() === right.getTime();
}

async function getTVShowProgressState(
  userId: string,
  tmdbId: number,
): Promise<TVShowProgressState> {
  const showDetails = await tmdbClient.getTVShowDetails(tmdbId);
  const nextEpisodeDate = showDetails.next_episode_to_air?.air_date
    ? new Date(showDetails.next_episode_to_air.air_date)
    : null;

  if (!showDetails.last_episode_to_air) {
    return {
      nextEpisodeDate,
      shouldMarkCompleted: nextEpisodeDate === null,
    };
  }

  const watchedEpisodes = await db
    .select({
      seasonNumber: episodeWatchStatus.seasonNumber,
      episodeNumber: episodeWatchStatus.episodeNumber,
    })
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, tmdbId),
        eq(episodeWatchStatus.watched, true),
      ),
    );

  const watchedEpisodeSet = new Set(
    watchedEpisodes.map(
      (episode) => `${episode.seasonNumber}-${episode.episodeNumber}`,
    ),
  );
  const targetSeasonNumbers = Array.from(
    { length: showDetails.last_episode_to_air.season_number },
    (_, index) => index + 1,
  );

  const seasonDetailsList = await Promise.all(
    targetSeasonNumbers.map(async (seasonNumber) => ({
      seasonNumber,
      details: await tmdbClient.getTVSeasonDetails(tmdbId, seasonNumber),
    })),
  );

  const now = new Date();
  const allAvailableEpisodesWatched = seasonDetailsList.every(
    ({ seasonNumber, details }) =>
      details.episodes.every((episode) => {
        if (!episode.air_date) return true;

        const airDate = new Date(episode.air_date);
        if (Number.isNaN(airDate.getTime()) || airDate > now) {
          return true;
        }

        if (
          seasonNumber === showDetails.last_episode_to_air!.season_number &&
          episode.episode_number > showDetails.last_episode_to_air!.episode_number
        ) {
          return true;
        }

        return watchedEpisodeSet.has(
          `${seasonNumber}-${episode.episode_number}`,
        );
      }),
  );

  if (!allAvailableEpisodesWatched) {
    return {
      nextEpisodeDate: null,
      shouldMarkCompleted: false,
    };
  }

  if (!nextEpisodeDate) {
    return {
      nextEpisodeDate: null,
      shouldMarkCompleted: true,
    };
  }

  const inOneMonth = new Date();
  inOneMonth.setMonth(inOneMonth.getMonth() + 1);

  return {
    nextEpisodeDate,
    shouldMarkCompleted: nextEpisodeDate > inOneMonth,
  };
}

/**
 * Sync episode status to collaborators in shared lists
 */
export async function syncEpisodeStatusToCollaborators(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean,
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
          or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)),
        ),
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
              eq(episodeWatchStatus.episodeNumber, episodeNumber),
            ),
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
                eq(episodeWatchStatus.episodeNumber, episodeNumber),
              ),
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
  watched: boolean,
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
        eq(episodeWatchStatus.episodeNumber, episodeNumber),
      ),
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
          eq(episodeWatchStatus.episodeNumber, episodeNumber),
        ),
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
  episodeName?: string,
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
  _seasonNumber: number,
  _episodeNumber: number,
  watched: boolean,
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
        eq(userContentStatus.contentType, ContentType.TV),
      ),
    )
    .limit(1);

  let newStatus: WatchStatusEnum | null = null;
  const progressState = await getTVShowProgressState(userId, tmdbId);
  const existingStatus = contentStatus[0] ?? null;
  const shouldMarkCompleted = progressState.shouldMarkCompleted;

  if (contentStatus.length === 0) {
    await db.insert(userContentStatus).values({
      userId,
      tmdbId,
      contentType: ContentType.TV,
      status: shouldMarkCompleted ? WatchStatus.COMPLETED : WatchStatus.WATCHING,
      nextEpisodeDate: progressState.nextEpisodeDate,
    });
    newStatus = shouldMarkCompleted
      ? WatchStatus.COMPLETED
      : WatchStatus.WATCHING;
  } else if (shouldMarkCompleted) {
    if (existingStatus.status !== WatchStatus.COMPLETED) {
      await db
        .update(userContentStatus)
        .set({
          status: WatchStatus.COMPLETED,
          updatedAt: new Date(),
          nextEpisodeDate: progressState.nextEpisodeDate,
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, ContentType.TV),
          ),
        );
      newStatus = WatchStatus.COMPLETED;
    } else if (
      !areDatesEqual(existingStatus.nextEpisodeDate, progressState.nextEpisodeDate)
    ) {
      await db
        .update(userContentStatus)
        .set({
          nextEpisodeDate: progressState.nextEpisodeDate,
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, ContentType.TV),
          ),
        );
    }

    // Remove schedules when show is completed
    try {
      const deletedSchedules = await db
        .delete(showSchedules)
        .where(
          and(eq(showSchedules.userId, userId), eq(showSchedules.tmdbId, tmdbId)),
        )
        .returning();

      if (deletedSchedules.length > 0) {
        console.info(
          `Automatically removed ${deletedSchedules.length} schedule(s) for completed show ${tmdbId}`,
        );
      }
    } catch (error) {
      console.error("Error removing schedules for completed show:", error);
      // Don't fail the main operation if schedule cleanup fails
    }
  } else {
    const needsWatchingStatus = existingStatus.status !== WatchStatus.WATCHING;
    const needsNextEpisodeDateUpdate = !areDatesEqual(
      existingStatus.nextEpisodeDate,
      progressState.nextEpisodeDate,
    );

    if (needsWatchingStatus || needsNextEpisodeDateUpdate) {
      await db
        .update(userContentStatus)
        .set({
          ...(needsWatchingStatus
            ? {
                status: WatchStatus.WATCHING,
                updatedAt: new Date(),
              }
            : {}),
          nextEpisodeDate: progressState.nextEpisodeDate,
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, ContentType.TV),
          ),
        );
    }

    if (needsWatchingStatus) {
      newStatus = WatchStatus.WATCHING;
    }
  }

  // Sync status to collaborators if it changed
  if (newStatus) {
    await syncStatusToCollaborators(userId, tmdbId, ContentType.TV, newStatus);
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
  episodeName?: string,
  options?: {
    skipShowStatus?: boolean;
  },
) {
  // Update episode status
  const episodeResult = await updateEpisodeWatchStatus(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched,
  );

  // Sync to collaborators
  const syncedCollaboratorIds = await syncEpisodeStatusToCollaborators(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched,
  );

  // Create activity entry
  await createEpisodeActivityEntry(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched,
    syncedCollaboratorIds,
    episodeName,
  );

  // Update show status
  const newStatus = options?.skipShowStatus
    ? null
    : await updateTVShowStatus(
        userId,
        tmdbId,
        seasonNumber,
        episodeNumber,
        watched,
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
  }>,
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
      episode.watched,
      undefined,
      { skipShowStatus: true },
    );

    results.push(result.episode);
    result.syncedCollaboratorIds.forEach((id) =>
      allSyncedCollaboratorIds.add(id),
    );
  }

  const lastWatchedEpisode = [...episodes].reverse().find((episode) => episode.watched);
  if (lastWatchedEpisode) {
    finalStatus = await updateTVShowStatus(
      userId,
      tmdbId,
      lastWatchedEpisode.seasonNumber,
      lastWatchedEpisode.episodeNumber,
      true,
    );
  }

  return {
    episodes: results,
    newStatus: finalStatus,
    syncedCollaboratorIds: Array.from(allSyncedCollaboratorIds),
  };
}
