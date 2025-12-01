import { db } from "@/lib/db";
import { and, desc, eq } from "drizzle-orm";
import { episodeWatchStatus } from "@/lib/db/schema";
import { tmdbClient } from "@/lib/tmdb/client";
import {
  batchUpdateEpisodes as batchUpdate,
  completeEpisodeUpdate,
  createEpisodeActivityEntry,
  syncEpisodeStatusToCollaborators,
  updateTVShowStatus,
} from "./episodeUtils";
import type {
  BatchUpdateEpisodesInputItem,
  BatchUpdateEpisodesResult,
  EpisodeStatusItem,
  ListEpisodeStatusResponse,
  MarkNextEpisodeError,
  MarkNextEpisodeResult,
  UpdateEpisodeStatusInput,
  UpdateEpisodeStatusResult,
} from "./types";

function mapRow(row: any): EpisodeStatusItem {
  return {
    id: row.id,
    userId: row.userId,
    tmdbId: row.tmdbId,
    seasonNumber: row.seasonNumber,
    episodeNumber: row.episodeNumber,
    watched: row.watched,
    watchedAt: row.watchedAt
      ? row.watchedAt.toISOString?.() ?? row.watchedAt
      : null,
    createdAt: row.createdAt
      ? row.createdAt.toISOString?.() ?? row.createdAt
      : undefined,
    updatedAt: row.updatedAt
      ? row.updatedAt.toISOString?.() ?? row.updatedAt
      : undefined,
  };
}

export async function listEpisodeStatuses(
  userId: string,
  tmdbId: number,
  seasonNumber?: number,
  episodeNumber?: number
): Promise<ListEpisodeStatusResponse> {
  const conditions = [
    eq(episodeWatchStatus.userId, userId),
    eq(episodeWatchStatus.tmdbId, tmdbId),
  ];
  if (typeof seasonNumber === "number") {
    conditions.push(eq(episodeWatchStatus.seasonNumber, seasonNumber));
  }
  if (typeof episodeNumber === "number") {
    conditions.push(eq(episodeWatchStatus.episodeNumber, episodeNumber));
  }
  const rows = await db
    .select()
    .from(episodeWatchStatus)
    .where(and(...conditions));
  return { episodes: rows.map(mapRow) };
}

export async function updateEpisodeStatus(
  userId: string,
  input: UpdateEpisodeStatusInput
): Promise<UpdateEpisodeStatusResult> {
  const { tmdbId, seasonNumber, episodeNumber, watched } = input;
  const { episode, newStatus } = await completeEpisodeUpdate(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched
  );
  return { episode: mapRow(episode), newStatus };
}

export async function batchUpdateEpisodeStatuses(
  userId: string,
  tmdbId: number,
  episodes: BatchUpdateEpisodesInputItem[]
): Promise<BatchUpdateEpisodesResult> {
  const result = await batchUpdate(userId, tmdbId, episodes);
  return {
    episodes: result.episodes.map(mapRow),
    newStatus: result.newStatus,
    syncedCollaboratorIds: result.syncedCollaboratorIds,
  };
}

export async function markNextEpisodeWatched(
  userId: string,
  tmdbId: number
): Promise<MarkNextEpisodeResult | MarkNextEpisodeError> {
  try {
    await tmdbClient.getTVShowDetails(tmdbId);
  } catch (error) {
    if (error instanceof Error && error.message.includes("404"))
      return "notFound";
    throw error;
  }
  const watchedEpisodes = await db
    .select()
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, tmdbId),
        eq(episodeWatchStatus.watched, true)
      )
    )
    .orderBy(
      desc(episodeWatchStatus.seasonNumber),
      desc(episodeWatchStatus.episodeNumber)
    );
  let nextSeasonNumber = 1;
  let nextEpisodeNumber = 1;
  if (watchedEpisodes.length > 0) {
    const lastWatched = watchedEpisodes[0];
    let seasonDetails;
    try {
      seasonDetails = await tmdbClient.getTVSeasonDetails(
        tmdbId,
        lastWatched.seasonNumber
      );
    } catch {
      throw new Error("Failed to get season details");
    }
    if (lastWatched.episodeNumber < seasonDetails.episodes.length) {
      nextSeasonNumber = lastWatched.seasonNumber;
      nextEpisodeNumber = lastWatched.episodeNumber + 1;
    } else {
      nextSeasonNumber = lastWatched.seasonNumber + 1;
      nextEpisodeNumber = 1;
    }
  }
  let nextEpisodeDetails;
  try {
    nextEpisodeDetails = await tmdbClient.getTVEpisodeDetails(
      tmdbId,
      nextSeasonNumber,
      nextEpisodeNumber
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("404"))
      return "noNextEpisode";
    throw error;
  }
  const airDate = new Date(nextEpisodeDetails.air_date);
  const now = new Date();
  if (airDate > now) return "notAired";
  const existingStatus = await db
    .select()
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, tmdbId),
        eq(episodeWatchStatus.seasonNumber, nextSeasonNumber),
        eq(episodeWatchStatus.episodeNumber, nextEpisodeNumber)
      )
    )
    .limit(1);
  let result;
  if (existingStatus.length > 0) {
    [result] = await db
      .update(episodeWatchStatus)
      .set({ watched: true, watchedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(episodeWatchStatus.userId, userId),
          eq(episodeWatchStatus.tmdbId, tmdbId),
          eq(episodeWatchStatus.seasonNumber, nextSeasonNumber),
          eq(episodeWatchStatus.episodeNumber, nextEpisodeNumber)
        )
      )
      .returning();
  } else {
    [result] = await db
      .insert(episodeWatchStatus)
      .values({
        userId,
        tmdbId,
        seasonNumber: nextSeasonNumber,
        episodeNumber: nextEpisodeNumber,
        watched: true,
        watchedAt: new Date(),
      })
      .returning();
  }
  const syncedCollaboratorIds = await syncEpisodeStatusToCollaborators(
    userId,
    tmdbId,
    nextSeasonNumber,
    nextEpisodeNumber,
    true
  );
  await createEpisodeActivityEntry(
    userId,
    tmdbId,
    nextSeasonNumber,
    nextEpisodeNumber,
    true,
    syncedCollaboratorIds,
    nextEpisodeDetails.name
  );
  const newStatus = await updateTVShowStatus(
    userId,
    tmdbId,
    nextSeasonNumber,
    nextEpisodeNumber,
    true
  );
  return {
    episode: mapRow(result),
    newStatus,
    episodeDetails: {
      seasonNumber: nextSeasonNumber,
      episodeNumber: nextEpisodeNumber,
      name: nextEpisodeDetails.name,
      airDate: nextEpisodeDetails.air_date,
    },
  };
}

export async function deleteEpisodeStatuses(
  userId: string,
  tmdbId: number,
  seasonNumber?: number,
  episodeNumber?: number
): Promise<{ deletedCount: number }> {
  let condition = and(
    eq(episodeWatchStatus.userId, userId),
    eq(episodeWatchStatus.tmdbId, tmdbId)
  );
  if (typeof seasonNumber === "number" && typeof episodeNumber === "number") {
    condition = and(
      eq(episodeWatchStatus.userId, userId),
      eq(episodeWatchStatus.tmdbId, tmdbId),
      eq(episodeWatchStatus.seasonNumber, seasonNumber),
      eq(episodeWatchStatus.episodeNumber, episodeNumber)
    );
  } else if (typeof seasonNumber === "number") {
    condition = and(
      eq(episodeWatchStatus.userId, userId),
      eq(episodeWatchStatus.tmdbId, tmdbId),
      eq(episodeWatchStatus.seasonNumber, seasonNumber)
    );
  }
  const deleted = await db
    .delete(episodeWatchStatus)
    .where(condition)
    .returning();
  return { deletedCount: deleted.length };
}
