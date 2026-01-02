import { db } from "@/lib/db";
import {
  userContentStatus,
  ContentType,
  activityFeed,
  ActivityType,
  showSchedules,
  MovieWatchStatus,
  TVWatchStatus,
  ContentTypeEnum,
  WatchStatusEnum,
  WatchStatus,
  episodeWatchStatus,
} from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  tmdbClient,
  TMDBMovie,
  TMDBSearchItem,
  TMDBTVShow,
} from "@/lib/tmdb/client";
import { syncStatusToCollaborators } from "@/lib/activity/activityUtils";
import type {
  ContentStatusItem,
  CreateOrUpdateContentStatusInput,
  CreateOrUpdateContentStatusResult,
  GetContentStatusResponse,
  UpdateContentStatusInput,
  UpdateContentStatusResult,
  DeleteContentStatusResult,
  TMDBContent,
} from "./types";

function mapRow(row: any): ContentStatusItem {
  return {
    id: row.id,
    userId: row.userId,
    tmdbId: row.tmdbId,
    contentType: row.contentType,
    status: row.status,
    nextEpisodeDate: row.nextEpisodeDate
      ? row.nextEpisodeDate.toISOString?.() ?? row.nextEpisodeDate
      : null,
    createdAt: row.createdAt
      ? row.createdAt.toISOString?.() ?? row.createdAt
      : undefined,
    updatedAt: row.updatedAt
      ? row.updatedAt.toISOString?.() ?? row.updatedAt
      : undefined,
  };
}

export async function getContentStatus(
  userId: string,
  tmdbId: number,
  contentType: string
): Promise<GetContentStatusResponse> {
  const status = await db
    .select()
    .from(userContentStatus)
    .where(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.tmdbId, tmdbId),
        eq(userContentStatus.contentType, contentType)
      )
    )
    .limit(1);
  return { status: status[0] ? mapRow(status[0]) : null };
}

export async function createOrUpdateContentStatus(
  userId: string,
  input: CreateOrUpdateContentStatusInput
): Promise<CreateOrUpdateContentStatusResult> {
  const { tmdbId, contentType, status } = input;
  try {
    const contentDetails =
      contentType === ContentType.MOVIE
        ? await tmdbClient.getMovieDetails(tmdbId)
        : await tmdbClient.getTVShowDetails(tmdbId);
    const existing = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, tmdbId),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);
    let result;
    if (existing.length > 0) {
      [result] = await db
        .update(userContentStatus)
        .set({ status, updatedAt: new Date() })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, contentType)
          )
        )
        .returning();
    } else {
      [result] = await db
        .insert(userContentStatus)
        .values({ userId, tmdbId, contentType, status })
        .returning();
    }
    if (
      contentType === ContentType.TV &&
      (status === TVWatchStatus.COMPLETED || status === TVWatchStatus.DROPPED)
    ) {
      try {
        await db
          .delete(showSchedules)
          .where(
            and(
              eq(showSchedules.userId, userId),
              eq(showSchedules.tmdbId, tmdbId)
            )
          );
      } catch {}
    }
    const syncedCollaboratorIds = await syncStatusToCollaborators(
      userId,
      tmdbId,
      contentType,
      status
    );
    try {
      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.STATUS_CHANGED,
        tmdbId,
        contentType,
        metadata: {
          status,
          title:
            (contentDetails as TMDBMovie)?.title ??
            (contentDetails as TMDBTVShow)?.name,
          posterPath: contentDetails.poster_path,
        },
        collaborators: syncedCollaboratorIds,
        isCollaborative: syncedCollaboratorIds.length > 0,
      });
    } catch {}
    return { status: mapRow(result) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("404"))
      return "notFound";
    throw error;
  }
}

export async function updateContentStatus(
  userId: string,
  input: UpdateContentStatusInput
): Promise<UpdateContentStatusResult> {
  const { tmdbId, contentType, status } = input;
  const existing = await db
    .select()
    .from(userContentStatus)
    .where(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.tmdbId, tmdbId),
        eq(userContentStatus.contentType, contentType)
      )
    )
    .limit(1);
  if (existing.length === 0) return "notFound";
  const updateData: any = { updatedAt: new Date() };
  if (status !== undefined) updateData.status = status;
  const [result] = await db
    .update(userContentStatus)
    .set(updateData)
    .where(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.tmdbId, tmdbId),
        eq(userContentStatus.contentType, contentType)
      )
    )
    .returning();
  if (
    status !== undefined &&
    contentType === ContentType.TV &&
    (status === TVWatchStatus.COMPLETED || status === TVWatchStatus.DROPPED)
  ) {
    try {
      await db
        .delete(showSchedules)
        .where(
          and(
            eq(showSchedules.userId, userId),
            eq(showSchedules.tmdbId, tmdbId)
          )
        );
    } catch {}
    const syncedCollaboratorIds = await syncStatusToCollaborators(
      userId,
      tmdbId,
      contentType,
      status
    );
    try {
      const contentDetails = await tmdbClient.getTVShowDetails(tmdbId);
      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.STATUS_CHANGED,
        tmdbId,
        contentType,
        metadata: {
          status,
          title: (contentDetails as TMDBTVShow)?.name,
          posterPath: contentDetails.poster_path,
        },
        collaborators: syncedCollaboratorIds,
        isCollaborative: syncedCollaboratorIds.length > 0,
      });
    } catch {}
  }
  return { status: mapRow(result) };
}

export async function deleteContentStatus(
  userId: string,
  tmdbId: number,
  contentType: string
): Promise<DeleteContentStatusResult | "notFound"> {
  const existing = await db
    .select()
    .from(userContentStatus)
    .where(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.tmdbId, tmdbId),
        eq(userContentStatus.contentType, contentType)
      )
    )
    .limit(1);
  if (existing.length === 0) return "notFound";
  await db
    .delete(userContentStatus)
    .where(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.tmdbId, tmdbId),
        eq(userContentStatus.contentType, contentType)
      )
    );
  return { message: "Content status removed successfully" };
}

export async function mapWithContentStatus(
  content: TMDBMovie | TMDBTVShow | TMDBSearchItem,
  userId: string
): Promise<TMDBContent> {
  const contentType =
    "media_type" in content
      ? content.media_type
      : "title" in content
      ? "movie"
      : "tv";
  let [statusData] = await db
    .select({
      status: userContentStatus.status,
      nextEpisodeDate: userContentStatus.nextEpisodeDate,
      updatedAt: userContentStatus.updatedAt,
    })
    .from(userContentStatus)
    .where(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.tmdbId, content.id),
        eq(userContentStatus.contentType, contentType)
      )
    )
    .limit(1);

  if (!statusData) {
    return mapContentToDomainModel(content, contentType, null, null);
  }

  if (
    contentType === ContentType.TV &&
    statusData.status === WatchStatus.COMPLETED &&
    statusData.nextEpisodeDate &&
    statusData.nextEpisodeDate < new Date()
  ) {
    // Need to check if a new episode is available
    const showDetails = await tmdbClient.getTVShowDetails(content.id);

    if (showDetails.last_episode_to_air) {
      const [episodeStatus] = await db
        .select({
          watched: episodeWatchStatus.watched,
        })
        .from(episodeWatchStatus)
        .where(
          and(
            eq(episodeWatchStatus.userId, userId),
            eq(episodeWatchStatus.tmdbId, content.id),
            eq(
              episodeWatchStatus.seasonNumber,
              showDetails.last_episode_to_air.season_number
            ),
            eq(
              episodeWatchStatus.episodeNumber,
              showDetails.last_episode_to_air.episode_number
            )
          )
        )
        .limit(1);

      if (!episodeStatus?.watched) {
        // A new episode has been released since the show was completed
        [statusData] = await db
          .update(userContentStatus)
          .set({
            status: WatchStatus.WATCHING,
            nextEpisodeDate: null,
          })
          .where(
            and(
              eq(userContentStatus.userId, userId),
              eq(userContentStatus.tmdbId, content.id),
              eq(userContentStatus.contentType, contentType)
            )
          )
          .returning({
            status: userContentStatus.status,
            nextEpisodeDate: userContentStatus.nextEpisodeDate,
            updatedAt: userContentStatus.updatedAt,
          });
      }
    }
  }

  return mapContentToDomainModel(
    content,
    contentType,
    statusData.status as WatchStatusEnum,
    statusData.updatedAt
  );
}

export function mapContentToDomainModel(
  content: TMDBMovie | TMDBTVShow | TMDBSearchItem,
  contentType: ContentTypeEnum,
  watchStatus: WatchStatusEnum | null,
  statusUpdatedAt: Date | null
): TMDBContent {
  return {
    tmdbId: content.id,
    contentType,
    title: "title" in content ? content.title : content.name,
    overview: content.overview,
    posterPath: content.poster_path,
    backdropPath: content.backdrop_path,
    releaseDate:
      "release_date" in content ? content.release_date : content.first_air_date,
    voteAverage: content.vote_average,
    voteCount: content.vote_count,
    popularity: content.popularity,
    genreIds: content.genre_ids || [],
    adult: "adult" in content ? content.adult : null,

    watchStatus,
    statusUpdatedAt: statusUpdatedAt?.toISOString() ?? null,
  };
}
