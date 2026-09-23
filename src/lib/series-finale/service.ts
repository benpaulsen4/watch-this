import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "../db";
import { episodeWatchStatus, tmdbCache, userContentStatus } from "../db/schema";
import { tmdbClient } from "../tmdb/client";
import type { Period } from "./periods";
import {
  type ContentStatusRow,
  titleKey,
  type TitleMeta,
  type WatchedEpisodeRow,
} from "./types";

export interface LoadedRows {
  episodes: WatchedEpisodeRow[];
  statuses: ContentStatusRow[];
  titles: Map<string, TitleMeta>;
  genreNames: Map<number, string>;
}

/**
 * Load everything the aggregation engine needs for one user and period.
 *
 * `period` must already be localised (see `localisePeriod` in `./periods`) --
 * this function does not localise it. The caller reads the user's zone once
 * and localises once; a canonical UTC calendar year passed here would
 * silently mis-date the edges of the year for every non-UTC user.
 *
 * Statuses are loaded in full rather than filtered to the period: `buildShame`
 * reports films that have sat in "planning" for years, and those rows were
 * created long before the period started. The aggregators apply their own
 * period filters.
 */
export async function loadUserRows(
  userId: string,
  period: Period,
): Promise<LoadedRows> {
  const episodeRows = await db
    .select({
      tmdbId: episodeWatchStatus.tmdbId,
      seasonNumber: episodeWatchStatus.seasonNumber,
      episodeNumber: episodeWatchStatus.episodeNumber,
      watchedAt: episodeWatchStatus.watchedAt,
    })
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.watched, true),
        gte(episodeWatchStatus.watchedAt, period.start),
        lt(episodeWatchStatus.watchedAt, period.end),
      ),
    );

  const episodes: WatchedEpisodeRow[] = episodeRows
    // `watched_at` is nullable in the schema. A watched row without one cannot
    // be placed on the calendar, so it is dropped rather than dated to the
    // epoch. A type-guard filter (rather than a post-filter cast) is required
    // under `noUncheckedIndexedAccess`.
    .filter(
      (row): row is typeof row & { watchedAt: Date } => row.watchedAt !== null,
    )
    .map((row) => ({
      tmdbId: row.tmdbId,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      watchedAt: row.watchedAt,
    }));

  const statuses = (await db
    .select({
      tmdbId: userContentStatus.tmdbId,
      contentType: userContentStatus.contentType,
      status: userContentStatus.status,
      createdAt: userContentStatus.createdAt,
      updatedAt: userContentStatus.updatedAt,
    })
    .from(userContentStatus)
    .where(eq(userContentStatus.userId, userId))) as ContentStatusRow[];

  const referencedIds = Array.from(
    new Set([
      ...episodes.map((row) => row.tmdbId),
      ...statuses.map((row) => row.tmdbId),
    ]),
  );

  const titles = new Map<string, TitleMeta>();
  if (referencedIds.length > 0) {
    const titleRows = await db
      .select({
        tmdbId: tmdbCache.tmdbId,
        contentType: tmdbCache.contentType,
        title: tmdbCache.title,
        posterPath: tmdbCache.posterPath,
        genreIds: tmdbCache.genreIds,
        popularity: tmdbCache.popularity,
        runtime: tmdbCache.runtime,
      })
      .from(tmdbCache)
      .where(inArray(tmdbCache.tmdbId, referencedIds));

    for (const row of titleRows) {
      const contentType = row.contentType as "movie" | "tv";
      titles.set(titleKey(row.tmdbId, contentType), {
        tmdbId: row.tmdbId,
        contentType,
        title: row.title,
        posterPath: row.posterPath,
        genreIds: row.genreIds ?? [],
        // `popularity` is a Postgres numeric, which postgres-js returns as a
        // string. Every comparison downstream is numeric.
        popularity: Number(row.popularity),
        runtime: row.runtime,
      });
    }
  }

  return {
    episodes,
    statuses,
    titles,
    genreNames: await loadGenreNames(),
  };
}

/**
 * TMDB genre id to display name, across both movie and TV lists.
 *
 * Without this the genres card renders every slice as "Unknown" -- `genre_ids`
 * in `tmdb_cache` are numbers, and nothing else in the codebase resolves them
 * server-side.
 *
 * Best-effort: TMDB being unreachable during generation should cost the genre
 * labels, not the whole recap. An empty map degrades the card, and `buildGenres`
 * already falls back to "Unknown" per id.
 *
 * Memoised at module scope for the lifetime of the process: `loadUserRows` is
 * called once per crew member as well as for the viewer, so without this a
 * single generation would hit TMDB once per collaborator. Only a non-empty
 * successful result is cached -- an empty genre list is not a real TMDB
 * answer, and caching it would pin "Unknown" on every genre for the life of
 * the process. A failed load caches nothing either, so a transient error is
 * retried rather than permanently degrading the card.
 */
let genreNameCache: Map<number, string> | null = null;

export async function loadGenreNames(): Promise<Map<number, string>> {
  if (genreNameCache) return genreNameCache;

  try {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbClient.getMovieGenres(),
      tmdbClient.getTVGenres(),
    ]);

    const names = new Map(
      [...movieGenres.genres, ...tvGenres.genres].map((genre) => [
        genre.id,
        genre.name,
      ]),
    );

    if (names.size > 0) {
      genreNameCache = names;
    }

    return names;
  } catch (error) {
    console.error("Series Finale: failed to load TMDB genre names", error);
    return new Map();
  }
}

/** Exists for tests: resets the module-scope genre-name memo. */
export function clearGenreNameCache(): void {
  genreNameCache = null;
}
