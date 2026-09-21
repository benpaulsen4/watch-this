/**
 * Warm the Series Finale runtime caches across all existing watch history.
 *
 * Run before generating any snapshot. Re-run safe: `ensureSeasonsCached`
 * skips seasons already recorded in `tmdb_season_fetch`, and film lookups skip
 * rows that already carry a runtime.
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

async function backfillSeasons(): Promise<void> {
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
}

async function backfillFilms(): Promise<void> {
  const films = await db
    .selectDistinct({ tmdbId: userContentStatus.tmdbId })
    .from(userContentStatus)
    .where(eq(userContentStatus.contentType, ContentType.MOVIE));

  console.log(`Films to consider: ${films.length}`);

  for (const [index, film] of films.entries()) {
    const cached = await db
      .select({ runtime: tmdbCache.runtime })
      .from(tmdbCache)
      .where(
        sql`${tmdbCache.tmdbId} = ${film.tmdbId} AND ${tmdbCache.contentType} = ${ContentType.MOVIE}`,
      );

    if (cached[0]?.runtime != null) continue;

    try {
      const details = await tmdbClient.getMovieDetails(film.tmdbId);
      await db
        .update(tmdbCache)
        .set({ runtime: details.runtime, updatedAt: new Date() })
        .where(
          sql`${tmdbCache.tmdbId} = ${film.tmdbId} AND ${tmdbCache.contentType} = ${ContentType.MOVIE}`,
        );
    } catch (error) {
      console.error(`  film ${film.tmdbId} failed`, error);
    }

    await sleep(REQUEST_GAP_MS);
    if ((index + 1) % 25 === 0) {
      console.log(`  ...${index + 1}/${films.length}`);
    }
  }
}

async function main(): Promise<void> {
  console.log("Backfilling Series Finale runtime caches");
  await backfillSeasons();
  await backfillFilms();
  console.log("Done");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
