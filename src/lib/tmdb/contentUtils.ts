import { eq, and } from "drizzle-orm";
import {
  ContentType,
  db,
  episodeWatchStatus,
  userContentStatus,
  WatchStatus,
  WatchStatusEnum,
} from "../db";
import { tmdbClient, TMDBMovie, TMDBSearchItem, TMDBTVShow } from "./client";

export async function enrichWithContentStatus(
  content: TMDBMovie | TMDBTVShow | TMDBSearchItem,
  userId: string,
) {
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
        eq(userContentStatus.contentType, contentType),
      ),
    )
    .limit(1);

  if (!statusData) {
    return content;
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
              showDetails.last_episode_to_air.season_number,
            ),
            eq(
              episodeWatchStatus.episodeNumber,
              showDetails.last_episode_to_air.episode_number,
            ),
          ),
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
              eq(userContentStatus.contentType, contentType),
            ),
          )
          .returning({
            status: userContentStatus.status,
            nextEpisodeDate: userContentStatus.nextEpisodeDate,
            updatedAt: userContentStatus.updatedAt,
          });
      }
    }
  }

  content.watchStatus = statusData.status as WatchStatusEnum;
  content.statusUpdatedAt = statusData.updatedAt?.toISOString();

  return content;
}
