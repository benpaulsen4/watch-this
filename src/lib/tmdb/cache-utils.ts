import { and, eq, inArray, or } from "drizzle-orm";

import {
  enrichAllWithContentStatus,
  enrichWithContentStatus,
} from "../content-status/service";
import { TMDBContent } from "../content-status/types";
import { ContentType, ContentTypeEnum, db, TMDBCache, tmdbCache } from "../db";
import {
  ExtendedTMDBMovieDetails,
  ExtendedTMDBTVShowDetails,
  tmdbClient,
} from "./client";

// DATA-09: `tmdb_cache` is the widest table in the schema -- an unbounded
// `overview` plus three integer arrays, one of which holds up to 50 cast ids.
// `mapToContent` reads none of the id arrays, yet an unprojected `select()`
// pulled all of them for every item on every list page. Every read below
// projects exactly the columns that are actually consumed: what `mapToContent`
// maps, plus `id` and `updatedAt` for the cache-expiry/refresh path.
const cacheColumns = {
  id: tmdbCache.id,
  tmdbId: tmdbCache.tmdbId,
  contentType: tmdbCache.contentType,
  title: tmdbCache.title,
  overview: tmdbCache.overview,
  posterPath: tmdbCache.posterPath,
  backdropPath: tmdbCache.backdropPath,
  releaseDate: tmdbCache.releaseDate,
  voteAverage: tmdbCache.voteAverage,
  voteCount: tmdbCache.voteCount,
  popularity: tmdbCache.popularity,
  genreIds: tmdbCache.genreIds,
  adult: tmdbCache.adult,
  updatedAt: tmdbCache.updatedAt,
} as const;

/** The subset of `tmdb_cache` that any read path in this module needs. */
export type CachedContentRow = Pick<TMDBCache, keyof typeof cacheColumns>;

// LOGIC-09: TMDB returns `""` -- not null -- for `release_date` /
// `first_air_date` on announced-but-unscheduled titles, and `new Date("")` is
// an Invalid Date, which the NOT NULL `release_date` column rejects at insert
// time. Adding any upcoming title to a list therefore threw. Mirrors the guard
// already used in `src/lib/lists/recommendations.ts`.
function toReleaseDate(value: string | null | undefined): Date {
  if (!value) return new Date(0);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

export async function addToCache(
  tmdbId: number,
  contentType: ContentTypeEnum
): Promise<TMDBContent> {
  let contentDetails: ExtendedTMDBMovieDetails | ExtendedTMDBTVShowDetails;
  let castIds: number[] = [];
  let keywordIds: number[] = [];

  if (contentType === ContentType.MOVIE) {
    contentDetails = await tmdbClient.getExtendedMovieDetails(tmdbId);
    castIds = Array.from(
      new Set(contentDetails.credits.cast.map((c) => c.id))
    ).slice(0, 50);
    keywordIds = Array.from(
      new Set(contentDetails.keywords.keywords.map((k) => k.id))
    );
  } else if (contentType === ContentType.TV) {
    contentDetails = await tmdbClient.getExtendedTVShowDetails(tmdbId);
    castIds = Array.from(
      new Set(contentDetails.aggregate_credits.cast.map((c) => c.id))
    ).slice(0, 50);
    keywordIds = Array.from(
      new Set(contentDetails.keywords.results.map((k) => k.id))
    );
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
      releaseDate: toReleaseDate(
        "release_date" in contentDetails!
          ? contentDetails.release_date
          : contentDetails!.first_air_date
      ),
      voteAverage: contentDetails!.vote_average.toString(),
      voteCount: contentDetails!.vote_count,
      popularity: contentDetails!.popularity.toString(),
      genreIds: contentDetails!.genres.map((g) => g.id),
      castIds,
      keywordIds,
      adult: "adult" in contentDetails! ? contentDetails.adult : null,
    })
    .onConflictDoNothing()
    .returning(cacheColumns);

  if (data) {
    return mapToContent(data);
  }

  // Handle race condition where insert failed due to conflict
  const [existingData] = await db
    .select(cacheColumns)
    .from(tmdbCache)
    .where(
      and(eq(tmdbCache.tmdbId, tmdbId), eq(tmdbCache.contentType, contentType))
    );

  if (!existingData) {
    throw new Error(`Failed to cache content: ${tmdbId} ${contentType}`);
  }

  return mapToContent(existingData);
}

async function updateCache(
  tmdbId: number,
  contentType: ContentTypeEnum,
  cacheId: string
): Promise<TMDBContent> {
  let contentDetails: ExtendedTMDBMovieDetails | ExtendedTMDBTVShowDetails;
  let castIds: number[] = [];
  let keywordIds: number[] = [];

  if (contentType === ContentType.MOVIE) {
    contentDetails = await tmdbClient.getExtendedMovieDetails(tmdbId);
    castIds = Array.from(
      new Set(contentDetails.credits.cast.map((c) => c.id))
    ).slice(0, 50);
    keywordIds = Array.from(
      new Set(contentDetails.keywords.keywords.map((k) => k.id))
    );
  } else if (contentType === ContentType.TV) {
    contentDetails = await tmdbClient.getExtendedTVShowDetails(tmdbId);
    castIds = Array.from(
      new Set(contentDetails.aggregate_credits.cast.map((c) => c.id))
    ).slice(0, 50);
    keywordIds = Array.from(
      new Set(contentDetails.keywords.results.map((k) => k.id))
    );
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
      releaseDate: toReleaseDate(
        "release_date" in contentDetails!
          ? contentDetails.release_date
          : contentDetails!.first_air_date
      ),
      voteAverage: contentDetails!.vote_average.toString(),
      voteCount: contentDetails!.vote_count,
      popularity: contentDetails!.popularity.toString(),
      genreIds: contentDetails!.genres.map((g) => g.id),
      castIds,
      keywordIds,
      adult: "adult" in contentDetails! ? contentDetails.adult : null,
      updatedAt: new Date(),
    })
    .where(eq(tmdbCache.id, cacheId))
    .returning(cacheColumns);

  // Both callers pass a `cacheId` they read in an earlier statement, so an empty
  // result means the row disappeared in between. Nothing in this codebase
  // deletes from `tmdb_cache`, so this is not reachable today -- but it is not
  // structurally impossible either, and the alternative is `mapToContent`
  // throwing an anonymous "cannot read properties of undefined".
  if (!data) {
    throw new Error(
      `Failed to update cache: ${tmdbId} ${contentType} (row ${cacheId} no longer exists)`
    );
  }

  return mapToContent(data);
}

export async function getCachedContent(
  tmdbId: number,
  contentType: ContentTypeEnum,
  userId: string
): Promise<TMDBContent> {
  const [cacheData] = await db
    .select(cacheColumns)
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

  let cacheData: CachedContentRow[] = [];

  if (conditions.length > 0) {
    cacheData = await db
      .select(cacheColumns)
      .from(tmdbCache)
      .where(or(...conditions));
  }

  const cacheMap = new Map<string, CachedContentRow>();
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

function mapToContent(cacheData: CachedContentRow): TMDBContent {
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
