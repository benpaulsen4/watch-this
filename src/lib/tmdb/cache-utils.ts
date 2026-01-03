import { eq, and, inArray, or } from "drizzle-orm";
import { TMDBContent } from "../content-status/types";
import { ContentType, ContentTypeEnum, db, TMDBCache, tmdbCache } from "../db";
import { tmdbClient, TMDBMovieDetails, TMDBTVShowDetails } from "./client";
import {
  enrichAllWithContentStatus,
  enrichWithContentStatus,
  mapWithContentStatus,
} from "../content-status/service";

export async function addToCache(
  tmdbId: number,
  contentType: ContentTypeEnum
): Promise<TMDBContent> {
  let contentDetails: TMDBMovieDetails | TMDBTVShowDetails;

  if (contentType === ContentType.MOVIE) {
    contentDetails = await tmdbClient.getMovieDetails(tmdbId);
  } else if (contentType === ContentType.TV) {
    contentDetails = await tmdbClient.getTVShowDetails(tmdbId);
  }

  const [data] = await db
    .insert(tmdbCache)
    .values({
      tmdbId,
      contentType,
      title:
        "title" in contentDetails!
          ? contentDetails.title
          : contentDetails!.name,
      overview: contentDetails!.overview,
      posterPath: contentDetails!.poster_path,
      backdropPath: contentDetails!.backdrop_path,
      releaseDate:
        "release_date" in contentDetails!
          ? new Date(contentDetails.release_date)
          : new Date(contentDetails!.first_air_date),
      voteAverage: contentDetails!.vote_average.toString(),
      voteCount: contentDetails!.vote_count,
      popularity: contentDetails!.popularity.toString(),
      genreIds: contentDetails!.genre_ids,
      adult: "adult" in contentDetails! ? contentDetails.adult : null,
    })
    .returning();

  return mapToContent(data);
}

export async function updateCache(
  tmdbId: number,
  contentType: ContentTypeEnum,
  cacheId: string
): Promise<TMDBContent> {
  let contentDetails: TMDBMovieDetails | TMDBTVShowDetails;

  if (contentType === ContentType.MOVIE) {
    contentDetails = await tmdbClient.getMovieDetails(tmdbId);
  } else if (contentType === ContentType.TV) {
    contentDetails = await tmdbClient.getTVShowDetails(tmdbId);
  }

  const [data] = await db
    .update(tmdbCache)
    .set({
      tmdbId,
      contentType,
      title:
        "title" in contentDetails!
          ? contentDetails.title
          : contentDetails!.name,
      overview: contentDetails!.overview,
      posterPath: contentDetails!.poster_path,
      backdropPath: contentDetails!.backdrop_path,
      releaseDate:
        "release_date" in contentDetails!
          ? new Date(contentDetails.release_date)
          : new Date(contentDetails!.first_air_date),
      voteAverage: contentDetails!.vote_average.toString(),
      voteCount: contentDetails!.vote_count,
      popularity: contentDetails!.popularity.toString(),
      genreIds: contentDetails!.genre_ids,
      adult: "adult" in contentDetails! ? contentDetails.adult : null,
      updatedAt: new Date(),
    })
    .where(eq(tmdbCache.id, cacheId))
    .returning();

  return mapToContent(data);
}

export async function getCachedContent(
  tmdbId: number,
  contentType: ContentTypeEnum,
  userId: string
): Promise<TMDBContent> {
  const [cacheData] = await db
    .select()
    .from(tmdbCache)
    .where(
      and(eq(tmdbCache.tmdbId, tmdbId), eq(tmdbCache.contentType, contentType))
    )
    .limit(1);

  if (!cacheData) {
    const newCacheData = await addToCache(tmdbId, contentType);

    return enrichWithContentStatus(newCacheData, userId);
  }

  // Check for cache expiry with 7 day threshold
  if (cacheData.updatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
    const updatedCacheData = await updateCache(
      tmdbId,
      contentType,
      cacheData.id
    );

    return enrichWithContentStatus(updatedCacheData, userId);
  }

  return enrichWithContentStatus(mapToContent(cacheData), userId);
}

export async function getAllCachedContent(
  toFetch: {
    tmdbId: number;
    contentType: ContentTypeEnum;
  }[],
  userId: string
): Promise<TMDBContent[]> {
  if (!toFetch.length) return [];

  const movieIds = toFetch
    .filter((c) => c.contentType === ContentType.MOVIE)
    .map((c) => c.tmdbId);
  const tvIds = toFetch
    .filter((c) => c.contentType === ContentType.TV)
    .map((c) => c.tmdbId);

  const conditions = [];
  if (movieIds.length > 0) {
    conditions.push(
      and(
        eq(tmdbCache.contentType, ContentType.MOVIE),
        inArray(tmdbCache.tmdbId, movieIds)
      )
    );
  }
  if (tvIds.length > 0) {
    conditions.push(
      and(
        eq(tmdbCache.contentType, ContentType.TV),
        inArray(tmdbCache.tmdbId, tvIds)
      )
    );
  }

  let cacheData: TMDBCache[] = [];

  if (conditions.length > 0) {
    cacheData = await db
      .select()
      .from(tmdbCache)
      .where(or(...conditions));
  }

  const cacheMap = new Map<string, TMDBCache>();
  for (const item of cacheData) {
    cacheMap.set(`${item.contentType}:${item.tmdbId}`, item);
  }

  const missingItems = toFetch.filter(
    (c) => !cacheMap.has(`${c.contentType}:${c.tmdbId}`)
  );
  // Check for cache expiry with 7 day threshold
  const expiredItems = cacheData.filter(
    (c) => c.updatedAt < new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );

  const newItems = await Promise.all(
    missingItems.map(async (c) => await addToCache(c.tmdbId, c.contentType))
  );
  const updatedItems = await Promise.all(
    expiredItems.map(
      async (c) =>
        await updateCache(c.tmdbId, c.contentType as ContentTypeEnum, c.id)
    )
  );

  const resultMap = new Map<string, TMDBContent>();

  // Add all cached items first
  for (const item of cacheData) {
    resultMap.set(`${item.contentType}:${item.tmdbId}`, mapToContent(item));
  }

  // Add new items
  for (const item of newItems) {
    resultMap.set(`${item.contentType}:${item.tmdbId}`, item);
  }

  // Overwrite expired items with updated versions
  for (const item of updatedItems) {
    resultMap.set(`${item.contentType}:${item.tmdbId}`, item);
  }

  // Retain input ordering - very important!
  const allItemsInOrder = toFetch.map((i) => {
    return resultMap.get(`${i.contentType}:${i.tmdbId}`)!;
  });

  return enrichAllWithContentStatus(allItemsInOrder, userId);
}

function mapToContent(cacheData: TMDBCache): TMDBContent {
  return {
    tmdbId: cacheData.tmdbId,
    contentType: cacheData.contentType as ContentTypeEnum,
    title: cacheData.title,
    overview: cacheData.overview,
    posterPath: cacheData.posterPath,
    backdropPath: cacheData.backdropPath,
    releaseDate: cacheData.releaseDate.toISOString(),
    voteAverage: Number(cacheData.voteAverage),
    voteCount: cacheData.voteCount,
    popularity: Number(cacheData.popularity),
    genreIds: cacheData.genreIds,
    adult: cacheData.adult,

    watchStatus: null,
    statusUpdatedAt: null,
  };
}
