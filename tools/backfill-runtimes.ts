/**
 * Warm the Series Finale runtime caches across all existing watch history.
 *
 * Run before generating any snapshot. Re-run safe: `ensureSeasonsCached` skips
 * seasons it has a recent `tmdb_season_fetch` row for, and film lookups skip
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
import {
  ensureSeasonsCached,
  type SeasonCacheSummary,
} from "../src/lib/series-finale/runtime";
import { normaliseFilmRuntime, tmdbClient } from "../src/lib/tmdb/client";

// The film loop's own TMDB traffic. Seasons are paced by
// `ensureSeasonsCached`, which owns that knowledge because generation calls it
// too; this one is the script's alone. TMDB asks for restraint rather than
// enforcing a hard cap, and the job is not latency-sensitive.
const REQUEST_GAP_MS = 250;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SeasonBackfillCounts extends SeasonCacheSummary {
  considered: number;
}

async function backfillSeasons(): Promise<SeasonBackfillCounts> {
  const pairs = await db
    .selectDistinct({
      tmdbId: episodeWatchStatus.tmdbId,
      seasonNumber: episodeWatchStatus.seasonNumber,
    })
    .from(episodeWatchStatus);

  console.log(`Seasons to consider: ${pairs.length}`);
  console.log(
    "  working through them; uncached seasons cost about a quarter of a " +
      "second each, so this is the slow half and it reports at the end",
  );

  // The whole array in one call, not one pair per call: this is what the
  // batched lookup inside `ensureSeasonsCached` is for -- a single SELECT for
  // every season rather than one per season -- and the request pacing it
  // needs now lives there too.
  const summary = await ensureSeasonsCached(pairs);

  return { considered: pairs.length, ...summary };
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
    // Progress first, before either `continue` below. Counting only the films
    // that did work meant a long run of already-cached ones printed nothing
    // at all, which from the outside is indistinguishable from a hang.
    if ((index + 1) % 25 === 0) {
      console.log(`  ...${index + 1}/${films.length}`);
    }

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
        // Normalised, so TMDB's 0 is stored as null. A 0 would be summed as a
        // film known to last no time, quietly understating "hours watched".
        .set({
          runtime: normaliseFilmRuntime(details.runtime),
          updatedAt: new Date(),
        })
        .where(
          sql`${tmdbCache.tmdbId} = ${film.tmdbId} AND ${tmdbCache.contentType} = ${ContentType.MOVIE}`,
        );
      counts.fetched += 1;
    } catch (error) {
      counts.failed += 1;
      console.error(`  film ${film.tmdbId} failed`, error);
    }

    await sleep(REQUEST_GAP_MS);
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

// `process.exit` throws away anything still sitting in stdout's buffer, and
// when the run is piped to a file stdout is an async pipe -- so the summary,
// the one line an operator keeps, is exactly what gets truncated. Exiting is
// still necessary: the postgres-js pool holds open handles, so simply
// returning from `main` leaves the process running.
async function exitAfterFlush(code: number): Promise<never> {
  await new Promise<void>((resolve) => {
    process.stdout.write("", () => resolve());
  });
  process.exit(code);
}

async function main(): Promise<void> {
  console.log("Backfilling Series Finale runtime caches");
  const seasonCounts = await backfillSeasons();
  const filmCounts = await backfillFilms();
  console.log("Done");
  console.log(
    `Summary: seasons -- ${seasonCounts.considered} considered, ` +
      `${seasonCounts.fetched} fetched, ${seasonCounts.skipped} already ` +
      `cached, ${seasonCounts.failed} failed; films -- ` +
      `${filmCounts.fetched} fetched, ${filmCounts.alreadyCached} already ` +
      `cached, ${filmCounts.noCacheRow} skipped (no cache row), ` +
      `${filmCounts.failed} failed.`,
  );
  await exitAfterFlush(0);
}

main().catch(async (error) => {
  console.error(error);
  await exitAfterFlush(1);
});
