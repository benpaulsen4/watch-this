import { and, eq, inArray, sql } from "drizzle-orm";

import { ContentType, db, tmdbCache, tmdbEpisodeRuntime, tmdbSeasonFetch } from "../db";
import { isTMDBHttpError, tmdbClient, type TMDBEpisode } from "../tmdb/client";

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
    // `> 0`, not just "is a number": write sites normalise TMDB's 0 to null,
    // but a 0 already in the column would otherwise be summed as a known zero
    // minutes -- the silent understatement this accounting exists to prevent.
    // Nothing watchable lasts no time, so a non-positive runtime is unknown.
    if (typeof runtime === "number" && runtime > 0) {
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

/** What one `ensureSeasonsCached` run did, for operator-facing reporting. */
export interface SeasonCacheSummary {
  /** Seasons fetched from TMDB and persisted. */
  fetched: number;
  /** Seasons left alone because a recent `tmdb_season_fetch` row covers them. */
  skipped: number;
  /** Seasons that produced no runtimes this run, definitively or otherwise. */
  failed: number;
}

/**
 * Gap between consecutive TMDB season fetches.
 *
 * It lives here rather than in the backfill script because the script is not
 * the only caller: snapshot generation hands this function a whole deduped
 * array of seasons inside a user-facing request, and knowledge of TMDB's
 * appetite has to sit with the code making the requests, not with one of the
 * things that calls it. TMDB asks for restraint rather than enforcing a hard
 * cap; this stays well inside anything they would consider abusive.
 */
export const SEASON_FETCH_GAP_MS = 250;

/**
 * How long a `tmdb_season_fetch` row is trusted before the season is asked
 * about again.
 *
 * A currently-airing season fetched in January holds only the episodes that
 * had aired by then. Without a refresh those later episodes never get runtimes
 * for anyone, so an annual recap systematically undercounts exactly the shows
 * a heavy user watches most. The refetch is cheap because the universe is
 * bounded by shows x seasons, not episodes -- a monthly re-ask of a few
 * thousand seasons is nothing next to a permanently frozen undercount.
 *
 * It doubles as a backstop for failures: non-definitive failures already leave
 * no row and retry on the next run, and this bounds the damage if any other
 * permanent-record path is ever introduced.
 */
export const SEASON_FETCH_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Collapse repeated `episode_number`s, keeping the last occurrence.
 *
 * A TMDB season can list the same episode number twice -- season 0, where the
 * specials live, is where their data is messiest -- and Postgres rejects the
 * whole statement with "ON CONFLICT DO UPDATE command cannot affect row a
 * second time" when one `INSERT` touches a conflict target twice. That used to
 * surface as a failed season rather than as the data problem it is.
 */
function dedupeByEpisodeNumber(episodes: TMDBEpisode[]): TMDBEpisode[] {
  const byNumber = new Map<number, TMDBEpisode>();
  for (const episode of episodes) {
    byNumber.set(episode.episode_number, episode);
  }

  return Array.from(byNumber.values());
}

/**
 * Make sure every given (show, season) has been asked about recently, fetching
 * and persisting per-episode runtimes for those that have not.
 *
 * Best-effort by design: a TMDB or database failure must not cost the caller
 * its whole generation run. What it does *not* do is record a failure as an
 * answer. `tmdb_season_fetch` means "we asked and this is what TMDB has", so
 * only a definitive outcome writes a row: a successful fetch, or a 404, which
 * is TMDB saying the season does not exist. A 429, a 5xx or a network failure
 * leaves no row, so the next run asks again -- otherwise a transient blip
 * would freeze into a permanent empty season for every user, with no retry
 * path anywhere. Rows older than `SEASON_FETCH_STALE_AFTER_MS` are treated as
 * absent and refetched.
 */
export async function ensureSeasonsCached(
  pairs: SeasonKey[],
): Promise<SeasonCacheSummary> {
  const summary: SeasonCacheSummary = { fetched: 0, skipped: 0, failed: 0 };
  if (pairs.length === 0) return summary;

  const unique = new Map<string, SeasonKey>();
  for (const pair of pairs) {
    unique.set(`${pair.tmdbId}:${pair.seasonNumber}`, pair);
  }

  const showIds = Array.from(new Set(pairs.map((p) => p.tmdbId)));
  const fetched = await db
    .select({
      tmdbId: tmdbSeasonFetch.tmdbId,
      seasonNumber: tmdbSeasonFetch.seasonNumber,
      fetchedAt: tmdbSeasonFetch.fetchedAt,
    })
    .from(tmdbSeasonFetch)
    .where(inArray(tmdbSeasonFetch.tmdbId, showIds));

  const staleBefore = Date.now() - SEASON_FETCH_STALE_AFTER_MS;
  const freshlyFetched = new Set(
    fetched
      .filter((row) => row.fetchedAt.getTime() > staleBefore)
      .map((row) => `${row.tmdbId}:${row.seasonNumber}`),
  );

  let attempted = 0;

  for (const [key, season] of unique) {
    if (freshlyFetched.has(key)) {
      summary.skipped += 1;
      continue;
    }

    // Between fetches only: never before the first, and never at all when
    // every season was already cached. A gap paid by a run that made no
    // requests is latency charged to a user for nothing.
    if (attempted > 0) await sleep(SEASON_FETCH_GAP_MS);
    attempted += 1;

    let definitive = false;
    let persisted = false;

    try {
      const details = await tmdbClient.getTVSeasonDetails(
        season.tmdbId,
        season.seasonNumber,
      );

      const episodes = dedupeByEpisodeNumber(details.episodes);
      if (episodes.length > 0) {
        await db
          .insert(tmdbEpisodeRuntime)
          .values(
            episodes.map((episode) => ({
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

      definitive = true;
      persisted = true;
    } catch (error) {
      // A 404 is an answer: TMDB has no such season and never will, so record
      // it and stop asking. Everything else -- rate limits, server errors, a
      // dropped connection, a failed insert -- says nothing about whether the
      // season exists, so it must not be written down as if it did.
      definitive = isTMDBHttpError(error) && error.status === 404;
      console.error(
        `Series Finale: failed to fetch season ${season.tmdbId}/${season.seasonNumber}`,
        error,
      );
    }

    if (definitive) {
      try {
        await db
          .insert(tmdbSeasonFetch)
          .values({ tmdbId: season.tmdbId, seasonNumber: season.seasonNumber })
          .onConflictDoUpdate({
            target: [tmdbSeasonFetch.tmdbId, tmdbSeasonFetch.seasonNumber],
            // Must be an update, not `onConflictDoNothing`: a refetched stale
            // row that keeps its original timestamp stays stale forever and is
            // refetched on every single run.
            set: { fetchedAt: new Date() },
          });
      } catch (error) {
        console.error(
          `Series Finale: failed to record season fetch ${season.tmdbId}/${season.seasonNumber}`,
          error,
        );
        persisted = false;
      }
    }

    if (persisted) summary.fetched += 1;
    else summary.failed += 1;
  }

  return summary;
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
