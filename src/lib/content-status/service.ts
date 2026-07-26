import { and, eq, inArray, or } from "drizzle-orm";

import { syncStatusToCollaborators } from "@/lib/activity/activityUtils";
import { db } from "@/lib/db";
import { expectRow } from "@/lib/db/expectRow";
import {
  activityFeed,
  ActivityType,
  ContentType,
  ContentTypeEnum,
  episodeWatchStatus,
  showSchedules,
  TVWatchStatus,
  UserContentStatus,
  userContentStatus,
  WatchStatus,
  WatchStatusEnum,
} from "@/lib/db/schema";
import {
  tmdbClient,
  TMDBMovie,
  TMDBSearchItem,
  TMDBTVShow,
} from "@/lib/tmdb/client";

import type {
  ContentStatusItem,
  CreateOrUpdateContentStatusInput,
  CreateOrUpdateContentStatusResult,
  DeleteContentStatusResult,
  GetContentStatusResponse,
  TMDBContent,
  UpdateContentStatusInput,
  UpdateContentStatusResult,
} from "./types";

/**
 * A `user_content_status` row as far as mapRow is concerned. Timestamps are Date
 * objects straight from the driver, but rows can also arrive already serialised,
 * so both are accepted - which is what the old `toISOString?.()` dance was for.
 */
interface ContentStatusRow {
  id: string;
  userId: string;
  tmdbId: number;
  contentType: string;
  status: string;
  nextEpisodeDate?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: ContentStatusRow): ContentStatusItem {
  return {
    id: row.id,
    userId: row.userId,
    tmdbId: row.tmdbId,
    // Both columns are varchars, so the row type cannot narrow them for us.
    contentType: row.contentType as ContentStatusItem["contentType"],
    status: row.status as ContentStatusItem["status"],
    nextEpisodeDate: row.nextEpisodeDate
      ? toIsoString(row.nextEpisodeDate)
      : null,
    createdAt: row.createdAt ? toIsoString(row.createdAt) : undefined,
    updatedAt: row.updatedAt ? toIsoString(row.updatedAt) : undefined,
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
    // DATA-07(d): the TMDB lookup is hoisted ahead of the transaction so no
    // network call is held open inside it.
    const contentDetails =
      contentType === ContentType.MOVIE
        ? await tmdbClient.getMovieDetails(tmdbId)
        : await tmdbClient.getTVShowDetails(tmdbId);

    // DATA-07(d): the status write and the schedule cleanup it implies must
    // commit together. Previously the schedule delete sat in its own swallowing
    // try/catch after an already-committed status change, so a show could end
    // up "completed" with its schedules still live -- and the schedules page
    // would keep showing a show the user had finished.
    const result = await db.transaction(async (tx) => {
      // DATA-07(c): this was a check-then-insert -- select, then branch to
      // update or insert against unique(userId, tmdbId, contentType). READ
      // COMMITTED does not serialise that: two concurrent status writes both
      // see no row, and the loser hits the unique constraint and surfaces as a
      // 500. Wrapping it in a transaction made it marginally worse, because the
      // violation also rolled back the schedule cleanup below. Let the database
      // arbitrate with a single upsert on the natural key instead.
      const rows = await tx
        .insert(userContentStatus)
        .values({ userId, tmdbId, contentType, status })
        .onConflictDoUpdate({
          target: [
            userContentStatus.userId,
            userContentStatus.tmdbId,
            userContentStatus.contentType,
          ],
          set: { status, updatedAt: new Date() },
        })
        .returning();

      if (
        contentType === ContentType.TV &&
        (status === TVWatchStatus.COMPLETED || status === TVWatchStatus.DROPPED)
      ) {
        await tx
          .delete(showSchedules)
          .where(
            and(
              eq(showSchedules.userId, userId),
              eq(showSchedules.tmdbId, tmdbId)
            )
          );
      }

      // `onConflictDoUpdate` always produces a row -- it either inserts or
      // updates -- so unlike `onConflictDoNothing` this cannot come back empty.
      return expectRow(rows, "createOrUpdateContentStatus upsert");
    });

    // NOTE: `syncStatusToCollaborators` writes other users' rows through the
    // top-level `db` handle, so it cannot join this transaction without
    // changing `src/lib/activity/activityUtils.ts`, which this branch does not
    // own. Its half of DATA-07(d) is left for that owner.
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
            "title" in contentDetails
              ? contentDetails.title
              : contentDetails.name,
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
  const updateData: Partial<typeof userContentStatus.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (status !== undefined) updateData.status = status;

  const clearsSchedules =
    status !== undefined &&
    contentType === ContentType.TV &&
    (status === TVWatchStatus.COMPLETED || status === TVWatchStatus.DROPPED);

  // DATA-07(d): hoist the TMDB lookup out of the transaction below. It is only
  // needed for the activity metadata, and a network call must never be held
  // open inside a DB transaction.
  let contentDetails: Awaited<
    ReturnType<typeof tmdbClient.getTVShowDetails>
  > | null = null;
  if (clearsSchedules) {
    try {
      contentDetails = await tmdbClient.getTVShowDetails(tmdbId);
    } catch {
      contentDetails = null;
    }
  }

  // DATA-07(d): the status change and the schedule cleanup it implies commit
  // together, so a show can never end up "completed" with surviving schedules.
  const result = await db.transaction(async (tx) => {
    const [row] = await tx
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

    if (clearsSchedules) {
      await tx
        .delete(showSchedules)
        .where(
          and(
            eq(showSchedules.userId, userId),
            eq(showSchedules.tmdbId, tmdbId)
          )
        );
    }

    return row;
  });

  // The existence check at the top of this function and the UPDATE above are
  // separate statements with a TMDB network call between them, so a concurrent
  // deleteContentStatus can remove the row and leave the UPDATE matching
  // nothing. Report the same "notFound" the existence check would have.
  if (!result) return "notFound";

  if (clearsSchedules) {
    // NOTE: see createOrUpdateContentStatus -- collaborator sync writes through
    // the top-level `db` handle and cannot join the transaction without
    // changing activity/activityUtils.ts, which this branch does not own.
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
          title: contentDetails?.name,
          posterPath: contentDetails?.poster_path,
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
    return mapTVShowWithNewEpisode(
      content as TMDBTVShow,
      userId,
      statusData.updatedAt
    );
  }
  return mapContentToDomainModel(
    content,
    contentType,
    statusData.status as WatchStatusEnum,
    statusData.updatedAt
  );
}

export async function mapAllWithContentStatus(
  contents: (TMDBMovie | TMDBTVShow | TMDBSearchItem)[],
  userId: string
): Promise<TMDBContent[]> {
  if (!contents.length) return [];

  const contentsWithType = contents.map((content) => {
    const contentType =
      "media_type" in content
        ? content.media_type
        : "title" in content
        ? "movie"
        : "tv";
    return { content, contentType };
  });

  const movieIds = contentsWithType
    .filter((c) => c.contentType === "movie")
    .map((c) => c.content.id);
  const tvIds = contentsWithType
    .filter((c) => c.contentType === "tv")
    .map((c) => c.content.id);

  const conditions = [];
  if (movieIds.length > 0) {
    conditions.push(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.contentType, "movie"),
        inArray(userContentStatus.tmdbId, movieIds)
      )
    );
  }
  if (tvIds.length > 0) {
    conditions.push(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.contentType, "tv"),
        inArray(userContentStatus.tmdbId, tvIds)
      )
    );
  }

  let statuses: UserContentStatus[] = [];

  if (conditions.length > 0) {
    statuses = await db
      .select()
      .from(userContentStatus)
      .where(or(...conditions));
  }

  const statusMap = new Map<string, UserContentStatus>();
  for (const status of statuses) {
    statusMap.set(`${status.tmdbId}-${status.contentType}`, status);
  }

  return Promise.all(
    contentsWithType.map(async ({ content, contentType }) => {
      const statusData = statusMap.get(`${content.id}-${contentType}`);

      if (!statusData) {
        return mapContentToDomainModel(
          content,
          contentType as ContentTypeEnum,
          null,
          null
        );
      }

      if (
        contentType === ContentType.TV &&
        statusData.status === WatchStatus.COMPLETED &&
        statusData.nextEpisodeDate &&
        new Date(statusData.nextEpisodeDate) < new Date()
      ) {
        return mapTVShowWithNewEpisode(
          content as TMDBTVShow,
          userId,
          statusData.updatedAt
        );
      }

      return mapContentToDomainModel(
        content,
        contentType as ContentTypeEnum,
        statusData.status as WatchStatusEnum,
        statusData.updatedAt
      );
    })
  );
}

export async function enrichWithContentStatus(
  content: TMDBContent,
  userId: string
): Promise<TMDBContent> {
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
        eq(userContentStatus.tmdbId, content.tmdbId),
        eq(userContentStatus.contentType, content.contentType)
      )
    )
    .limit(1);

  if (!statusData) {
    return content;
  }

  if (
    content.contentType === ContentType.TV &&
    statusData.status === WatchStatus.COMPLETED &&
    statusData.nextEpisodeDate &&
    statusData.nextEpisodeDate < new Date()
  ) {
    return enrichTVShowWithNewEpisode(content, userId, statusData.updatedAt);
  }
  return {
    ...content,
    watchStatus: statusData.status as WatchStatusEnum,
    statusUpdatedAt: statusData.updatedAt?.toISOString(),
  };
}

export async function enrichAllWithContentStatus(
  contents: TMDBContent[],
  userId: string
): Promise<TMDBContent[]> {
  if (!contents.length) return [];

  const movieIds = contents
    .filter((c) => c.contentType === "movie")
    .map((c) => c.tmdbId);
  const tvIds = contents
    .filter((c) => c.contentType === "tv")
    .map((c) => c.tmdbId);

  const conditions = [];
  if (movieIds.length > 0) {
    conditions.push(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.contentType, "movie"),
        inArray(userContentStatus.tmdbId, movieIds)
      )
    );
  }
  if (tvIds.length > 0) {
    conditions.push(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.contentType, "tv"),
        inArray(userContentStatus.tmdbId, tvIds)
      )
    );
  }

  let statuses: UserContentStatus[] = [];

  if (conditions.length > 0) {
    statuses = await db
      .select()
      .from(userContentStatus)
      .where(or(...conditions));
  }

  const statusMap = new Map<string, UserContentStatus>();
  for (const status of statuses) {
    statusMap.set(`${status.tmdbId}-${status.contentType}`, status);
  }

  return Promise.all(
    contents.map(async (content) => {
      const statusData = statusMap.get(
        `${content.tmdbId}-${content.contentType}`
      );

      if (!statusData) {
        return content;
      }

      if (
        content.contentType === ContentType.TV &&
        statusData.status === WatchStatus.COMPLETED &&
        statusData.nextEpisodeDate &&
        new Date(statusData.nextEpisodeDate) < new Date()
      ) {
        return enrichTVShowWithNewEpisode(
          content,
          userId,
          statusData.updatedAt
        );
      }

      return {
        ...content,
        watchStatus: statusData.status as WatchStatusEnum,
        statusUpdatedAt: statusData.updatedAt?.toISOString(),
      };
    })
  );
}

async function mapTVShowWithNewEpisode(
  content: TMDBTVShow,
  userId: string,
  statusUpdateDate: Date
): Promise<TMDBContent> {
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
      const [statusData] = await db
        .update(userContentStatus)
        .set({
          status: WatchStatus.WATCHING,
          nextEpisodeDate: null,
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, content.id),
            eq(userContentStatus.contentType, ContentType.TV)
          )
        )
        .returning({
          status: userContentStatus.status,
          nextEpisodeDate: userContentStatus.nextEpisodeDate,
          updatedAt: userContentStatus.updatedAt,
        });

      // The caller read a COMPLETED status row before the `getTVShowDetails`
      // call above, so this UPDATE normally matches it. If the user cleared
      // their status during that network round trip the UPDATE matches nothing,
      // and the content genuinely has no status any more -- the same shape
      // `mapWithContentStatus` returns when it finds no row at all.
      if (!statusData) {
        return mapContentToDomainModel(content, ContentType.TV, null, null);
      }

      return mapContentToDomainModel(
        content,
        ContentType.TV,
        statusData.status as WatchStatusEnum,
        statusData.updatedAt
      );
    }
  }

  // No new episode released, keep status as completed
  return mapContentToDomainModel(
    content,
    ContentType.TV,
    WatchStatus.COMPLETED,
    statusUpdateDate
  );
}

async function enrichTVShowWithNewEpisode(
  content: TMDBContent,
  userId: string,
  statusUpdateDate: Date
): Promise<TMDBContent> {
  // Need to check if a new episode is available
  const showDetails = await tmdbClient.getTVShowDetails(content.tmdbId);

  if (showDetails.last_episode_to_air) {
    const [episodeStatus] = await db
      .select({
        watched: episodeWatchStatus.watched,
      })
      .from(episodeWatchStatus)
      .where(
        and(
          eq(episodeWatchStatus.userId, userId),
          eq(episodeWatchStatus.tmdbId, content.tmdbId),
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
      const [statusData] = await db
        .update(userContentStatus)
        .set({
          status: WatchStatus.WATCHING,
          nextEpisodeDate: null,
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, content.tmdbId),
            eq(userContentStatus.contentType, ContentType.TV)
          )
        )
        .returning({
          status: userContentStatus.status,
          nextEpisodeDate: userContentStatus.nextEpisodeDate,
          updatedAt: userContentStatus.updatedAt,
        });

      // As in mapTVShowWithNewEpisode: the status row was read before the
      // `getTVShowDetails` call, so a status cleared during that round trip
      // leaves this UPDATE matching nothing. Returning `content` untouched is
      // what enrichWithContentStatus/enrichAllWithContentStatus already do when
      // no status row exists. Previously this threw, and because
      // enrichAllWithContentStatus awaits these in a Promise.all the throw took
      // down the enrichment of every other item in the same request.
      if (!statusData) {
        return content;
      }

      return {
        ...content,
        watchStatus: statusData.status as WatchStatusEnum,
        statusUpdatedAt: statusData.updatedAt?.toISOString(),
      };
    }
  }

  // No new episode released, keep status as completed
  return {
    ...content,
    watchStatus: WatchStatus.COMPLETED,
    statusUpdatedAt: statusUpdateDate.toISOString(),
  };
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
