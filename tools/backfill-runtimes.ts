/**
 * Warm the Series Finale runtime caches across all existing watch history.
 *
 * Run before generating any snapshot. Re-run safe: `ensureSeasonsCached`
 * skips seasons already recorded in `tmdb_season_fetch`, and film lookups skip
 * rows that already carry a runtime. A film with no `tmdb_cache` row at all is
 * a third case -- not a cache hit, not fetchable either -- and is reported
 * separately rather than retried forever; see the comment in `backfillFilms`.
 *
 * Usage: npm run backfill:runtimes
 */
import { eq, sql } from "drizzle-orm";

import { db } from "../src/lib/db";
import {
  ContentType,
  episodeWatchStatus,
  tmdbCache,
  userContentStatus,
} from "../src/lib/db/schema";
import { ensureSeasonsCached } from "../src/lib/series-finale/runtime";
import { tmdbClient } from "../src/lib/tmdb/client";

// TMDB asks for restraint rather than enforcing a hard cap. One request at a
// time with a short gap keeps a full backfill well inside anything they would
// consider abusive, and the job is not latency-sensitive.
const REQUEST_GAP_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function backfillSeasons(): Promise<{ considered: number }> {
  const pairs = await db
    .selectDistinct({
      tmdbId: episodeWatchStatus.tmdbId,
      seasonNumber: episodeWatchStatus.seasonNumber,
    })
    .from(episodeWatchStatus);

  console.log(`Seasons to consider: ${pairs.length}`);

  for (const [index, pair] of pairs.entries()) {
    await ensureSeasonsCached([pair]);
    await sleep(REQUEST_GAP_MS);
    if ((index + 1) % 25 === 0) {
      console.log(`  ...${index + 1}/${pairs.length}`);
    }
  }

  return { considered: pairs.length };
}

interface FilmBackfillCounts {
  fetched: number;
  alreadyCached: number;
  noCacheRow: number;
  failed: number;
}

async function backfillFilms(): Promise<FilmBackfillCounts> {
  const films = await db
    .selectDistinct({ tmdbId: userContentStatus.tmdbId })
    .from(userContentStatus)
    .where(eq(userContentStatus.contentType, ContentType.MOVIE));

  console.log(`Films to consider: ${films.length}`);

  const counts: FilmBackfillCounts = {
    fetched: 0,
    alreadyCached: 0,
    noCacheRow: 0,
    failed: 0,
  };

  for (const [index, film] of films.entries()) {
    const cached = await db
      .select({ runtime: tmdbCache.runtime })
      .from(tmdbCache)
      .where(
        sql`${tmdbCache.tmdbId} = ${film.tmdbId} AND ${tmdbCache.contentType} = ${ContentType.MOVIE}`,
      );

    if (cached[0]?.runtime != null) {
      counts.alreadyCached += 1;
      continue;
    }

    // A film can be in `userContentStatus` with no matching `tmdb_cache` row
    // at all -- the bulk profile importer writes straight into
    // `userContentStatus` without also populating the cache. `UPDATE ...
    // WHERE tmdb_id = x` against a row that doesn't exist affects zero rows
    // and raises nothing, so writing the fetched runtime here would silently
    // discard it on every run, forever, with no error to notice. Skip before
    // spending the TMDB request; the app's own caching path is what creates
    // the row this script then fills in.
    if (cached.length === 0) {
      counts.noCacheRow += 1;
      continue;
    }

    try {
      const details = await tmdbClient.getMovieDetails(film.tmdbId);
      await db
        .update(tmdbCache)
        .set({ runtime: details.runtime, updatedAt: new Date() })
        .where(
          sql`${tmdbCache.tmdbId} = ${film.tmdbId} AND ${tmdbCache.contentType} = ${ContentType.MOVIE}`,
        );
      counts.fetched += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(`  film ${film.tmdbId} failed`, error);
    }

    await sleep(REQUEST_GAP_MS);
    if ((index + 1) % 25 === 0) {
      console.log(`  ...${index + 1}/${films.length}`);
    }
  }

  if (counts.noCacheRow > 0) {
    console.log(
      `Skipped ${counts.noCacheRow} film(s) with no tmdb_cache row -- ` +
        "nothing to attach a runtime to yet. Run the app's own caching " +
        "path for these (e.g. view or add them) and re-run this script.",
    );
  }

  return counts;
}

async function main(): Promise<void> {
  console.log("Backfilling Series Finale runtime caches");
  const seasonCounts = await backfillSeasons();
  const filmCounts = await backfillFilms();
  console.log("Done");
  console.log(
    `Summary: ${seasonCounts.considered} season(s) considered; films -- ` +
      `${filmCounts.fetched} fetched, ${filmCounts.alreadyCached} already ` +
      `cached, ${filmCounts.noCacheRow} skipped (no cache row), ` +
      `${filmCounts.failed} failed.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
