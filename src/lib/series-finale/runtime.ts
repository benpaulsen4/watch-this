import { and, eq, inArray, sql } from "drizzle-orm";

import { ContentType, db, tmdbCache, tmdbEpisodeRuntime, tmdbSeasonFetch } from "../db";
import { tmdbClient } from "../tmdb/client";

export interface EpisodeKey {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
}

/**
 * Maps `episodeKeyOf(...)` to a runtime in minutes. A `null` value means TMDB
 * was asked and has no runtime; an absent entry means it was never asked. Both
 * count as unknown for arithmetic, but only the second is worth refetching.
 */
export type RuntimeLookup = Map<string, number | null>;

export function episodeKeyOf(key: EpisodeKey): string {
  return `${key.tmdbId}:${key.seasonNumber}:${key.episodeNumber}`;
}

// Shared walk-and-accumulate behind summariseEpisodeRuntimes and
// summariseFilmRuntimes -- they differ only in how a runtime is looked up.
function summariseRuntimes<T>(
  items: T[],
  runtimeOf: (item: T) => number | null | undefined,
): { minutes: number; unknownCount: number } {
  let minutes = 0;
  let unknownCount = 0;

  for (const item of items) {
    const runtime = runtimeOf(item);
    if (typeof runtime === "number") {
      minutes += runtime;
    } else {
      unknownCount += 1;
    }
  }

  return { minutes, unknownCount };
}

/**
 * Total known minutes across `episodes`, plus a count of those whose runtime is
 * unknown.
 *
 * The unknown count is not decoration. Silently treating a missing runtime as
 * zero would make the headline "hours watched" quietly low in a way no reader
 * could detect, so callers get the number of episodes the total excludes and
 * can decide whether to qualify it.
 */
export function summariseEpisodeRuntimes(
  episodes: EpisodeKey[],
  lookup: RuntimeLookup,
): { minutes: number; unknownCount: number } {
  return summariseRuntimes(episodes, (episode) =>
    lookup.get(episodeKeyOf(episode)),
  );
}

/**
 * Read cached runtimes for the given episodes.
 *
 * Queries by distinct show so the predicate stays a small set of
 * `tmdb_id IN (...)` rather than one clause per episode; a heavy user has
 * thousands of episodes but only dozens of shows.
 */
export async function loadEpisodeRuntimes(
  episodes: EpisodeKey[],
): Promise<RuntimeLookup> {
  if (episodes.length === 0) return new Map();

  const showIds = Array.from(new Set(episodes.map((e) => e.tmdbId)));

  const rows = await db
    .select({
      tmdbId: tmdbEpisodeRuntime.tmdbId,
      seasonNumber: tmdbEpisodeRuntime.seasonNumber,
      episodeNumber: tmdbEpisodeRuntime.episodeNumber,
      runtime: tmdbEpisodeRuntime.runtime,
    })
    .from(tmdbEpisodeRuntime)
    .where(inArray(tmdbEpisodeRuntime.tmdbId, showIds));

  const lookup: RuntimeLookup = new Map();
  for (const row of rows) {
    lookup.set(episodeKeyOf(row), row.runtime);
  }

  return lookup;
}

export interface SeasonKey {
  tmdbId: number;
  seasonNumber: number;
}

/**
 * Make sure every given (show, season) has been asked for at least once,
 * fetching and persisting per-episode runtimes for those that have not.
 *
 * Best-effort by design: a failure either to fetch a season from TMDB or to
 * persist what was fetched -- both caught by the same try/catch -- must not
 * cost the caller its whole generation run. A season that fails either way is
 * still recorded as fetched, because the alternative is retrying a
 * permanently failing season on every generation for every user, forever.
 * Re-running the backfill script is the deliberate way to retry.
 */
export async function ensureSeasonsCached(pairs: SeasonKey[]): Promise<void> {
  if (pairs.length === 0) return;

  const unique = new Map<string, SeasonKey>();
  for (const pair of pairs) {
    unique.set(`${pair.tmdbId}:${pair.seasonNumber}`, pair);
  }

  const showIds = Array.from(new Set(pairs.map((p) => p.tmdbId)));
  const fetched = await db
    .select({
      tmdbId: tmdbSeasonFetch.tmdbId,
      seasonNumber: tmdbSeasonFetch.seasonNumber,
    })
    .from(tmdbSeasonFetch)
    .where(inArray(tmdbSeasonFetch.tmdbId, showIds));

  const alreadyFetched = new Set(
    fetched.map((row) => `${row.tmdbId}:${row.seasonNumber}`),
  );

  for (const [key, season] of unique) {
    if (alreadyFetched.has(key)) continue;

    try {
      const details = await tmdbClient.getTVSeasonDetails(
        season.tmdbId,
        season.seasonNumber,
      );

      if (details.episodes.length > 0) {
        await db
          .insert(tmdbEpisodeRuntime)
          .values(
            details.episodes.map((episode) => ({
              tmdbId: season.tmdbId,
              seasonNumber: season.seasonNumber,
              episodeNumber: episode.episode_number,
              runtime: episode.runtime,
            })),
          )
          .onConflictDoUpdate({
            target: [
              tmdbEpisodeRuntime.tmdbId,
              tmdbEpisodeRuntime.seasonNumber,
              tmdbEpisodeRuntime.episodeNumber,
            ],
            set: {
              runtime: sql`excluded.runtime`,
              updatedAt: new Date(),
            },
          });
      }
    } catch (error) {
      console.error(
        `Series Finale: failed to fetch season ${season.tmdbId}/${season.seasonNumber}`,
        error,
      );
    }

    await db
      .insert(tmdbSeasonFetch)
      .values({ tmdbId: season.tmdbId, seasonNumber: season.seasonNumber })
      .onConflictDoNothing();
  }
}

/** Read cached film runtimes from `tmdb_cache`. */
export async function loadFilmRuntimes(
  tmdbIds: number[],
): Promise<Map<number, number | null>> {
  if (tmdbIds.length === 0) return new Map();

  const rows = await db
    .select({ tmdbId: tmdbCache.tmdbId, runtime: tmdbCache.runtime })
    .from(tmdbCache)
    .where(
      and(
        inArray(tmdbCache.tmdbId, tmdbIds),
        eq(tmdbCache.contentType, ContentType.MOVIE),
      ),
    );

  return new Map(rows.map((row) => [row.tmdbId, row.runtime]));
}

/**
 * Total known minutes across `tmdbIds`, plus a count of those whose runtime is
 * unknown. Same contract as `summariseEpisodeRuntimes`, and unknown is counted
 * for the same reason: a silent zero would understate the headline.
 */
export function summariseFilmRuntimes(
  tmdbIds: number[],
  lookup: Map<number, number | null>,
): { minutes: number; unknownCount: number } {
  return summariseRuntimes(tmdbIds, (tmdbId) => lookup.get(tmdbId));
}
