#!/usr/bin/env node

import * as fs from "fs";

// SeriesGuide JSON structure types
interface SeriesGuideEpisode {
  collected: boolean;
  episode: number;
  first_aired: number;
  plays: number;
  skipped: boolean;
  title: string;
  tmdb_id: number;
  watched: boolean;
}

interface SeriesGuideSeason {
  episodes: SeriesGuideEpisode[];
  season: number;
  tmdb_id: string;
}

interface SeriesGuideShow {
  content_rating: string;
  country: string;
  custom_release_day_offset: number;
  custom_release_timezone: string;
  favorite: boolean;
  first_aired: string;
  hidden: boolean;
  imdb_id: string;
  language: string;
  last_watched_ms: number;
  network: string;
  notify: boolean;
  poster: string;
  rating_user: number;
  release_time: number;
  release_timezone: string;
  release_weekday: number;
  runtime: number;
  seasons: SeriesGuideSeason[];
  status: string;
  title: string;
  tmdb_id: number;
  trakt_id: number;
  tvdb_id: number;
}

// WatchThis import format types.
//
// LOGIC-03: these must match what `importUserData`
// (src/lib/profile/data/service.ts) actually reads. Previously the converter
// emitted an `episodeWatchStatus` key while the importer reads `episodeStatus`,
// so every converted episode was silently dropped and the import reported
// success with zero imported. The rows also omitted createdAt/updatedAt, which
// made `new Date(undefined)` an Invalid Date against a NOT NULL column.
//
// LOGIC-04: `id` is deliberately not emitted. The importer never carries a
// client-supplied primary key across; the database generates fresh uuids and
// the unique constraints deduplicate.
interface ContentStatus {
  tmdbId: number;
  contentType: "movie" | "tv";
  status: "planning" | "watching" | "completed" | "paused" | "dropped";
  createdAt: string;
  updatedAt: string;
}

interface EpisodeStatus {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
  watchedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WatchThisImport {
  contentStatus: ContentStatus[];
  episodeStatus: EpisodeStatus[];
}

/**
 * Maps SeriesGuide status to WatchThis status
 */
function mapShowStatus(
  seriesGuideStatus: string,
  hasWatchedEpisodes: boolean,
): ContentStatus["status"] {
  switch (seriesGuideStatus.toLowerCase()) {
    case "ended":
      // If show is ended and has watched episodes, consider it completed
      // Otherwise, it might be planning to watch
      return hasWatchedEpisodes ? "completed" : "planning";
    case "continuing":
      // If show is continuing and has watched episodes, it's being watched
      // Otherwise, it's planned
      return hasWatchedEpisodes ? "watching" : "planning";
    case "canceled":
    case "cancelled":
      return hasWatchedEpisodes ? "dropped" : "planning";
    default:
      // Default fallback based on whether episodes have been watched
      return hasWatchedEpisodes ? "watching" : "planning";
  }
}

/**
 * SeriesGuide carries no created/updated timestamps, but the importer writes
 * both into NOT NULL columns. Emit a single valid timestamp for the whole
 * conversion rather than letting `new Date(undefined)` produce an Invalid Date.
 */
function toISODate(timestampMs: number | undefined, fallback: string): string {
  if (!timestampMs) return fallback;
  const date = new Date(timestampMs);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

/**
 * Converts SeriesGuide JSON to WatchThis import format
 */
export function convertSeriesGuideToWatchThis(
  seriesGuideData: SeriesGuideShow[],
  now: Date = new Date(),
): WatchThisImport {
  const contentStatus: ContentStatus[] = [];
  const episodeStatus: EpisodeStatus[] = [];
  const nowISO = now.toISOString();

  for (const show of seriesGuideData) {
    // Collect all watched episodes for this show
    const watchedEpisodes: EpisodeStatus[] = [];

    for (const season of show.seasons) {
      for (const episode of season.episodes) {
        if (episode.watched) {
          // SeriesGuide has no per-episode "watched at", so the air date is the
          // best available approximation; fall back to null when absent.
          const airedISO = episode.first_aired
            ? toISODate(episode.first_aired, nowISO)
            : null;

          watchedEpisodes.push({
            tmdbId: show.tmdb_id,
            seasonNumber: season.season,
            episodeNumber: episode.episode,
            watched: true,
            watchedAt: airedISO,
            createdAt: nowISO,
            updatedAt: nowISO,
          });
        }
      }
    }

    // Add to episode status array
    episodeStatus.push(...watchedEpisodes);

    // Determine show status based on SeriesGuide status and watched episodes
    const hasWatchedEpisodes = watchedEpisodes.length > 0;
    const showStatus = mapShowStatus(show.status, hasWatchedEpisodes);

    // Add content status
    contentStatus.push({
      tmdbId: show.tmdb_id,
      contentType: "tv", // SeriesGuide only handles TV shows
      status: showStatus,
      createdAt: toISODate(show.last_watched_ms, nowISO),
      updatedAt: nowISO,
    });
  }

  return {
    contentStatus,
    episodeStatus,
  };
}

/**
 * Main function to process the conversion
 */
function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error(
      "Usage: node seriesguide-converter.js <input-file> [output-file]",
    );
    console.error(
      "Example: node seriesguide-converter.js seriesguide-snippet.json watchthis-import.json",
    );
    process.exit(1);
  }

  const inputFile = args[0];
  const outputFile =
    args[1] || inputFile.replace(/\.json$/, "-watchthis-import.json");

  // Check if input file exists
  if (!fs.existsSync(inputFile)) {
    console.error(`Error: Input file "${inputFile}" does not exist.`);
    process.exit(1);
  }

  try {
    // Read and parse SeriesGuide JSON
    console.log(`Reading SeriesGuide data from: ${inputFile}`);
    const seriesGuideData: SeriesGuideShow[] = JSON.parse(
      fs.readFileSync(inputFile, "utf8"),
    );

    // Convert to WatchThis format
    console.log(`Converting ${seriesGuideData.length} shows...`);
    const watchThisData = convertSeriesGuideToWatchThis(seriesGuideData);

    // Write output
    console.log(`Writing WatchThis import data to: ${outputFile}`);
    fs.writeFileSync(
      outputFile,
      JSON.stringify(watchThisData, null, 2),
      "utf8",
    );

    // Summary
    console.log("\n=== Conversion Summary ===");
    console.log(`Shows processed: ${watchThisData.contentStatus.length}`);
    console.log(`Watched episodes: ${watchThisData.episodeStatus.length}`);

    // Show breakdown by status
    const statusCounts = watchThisData.contentStatus.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    console.log("\nShow status breakdown:");
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    console.log(`\nConversion completed successfully!`);
  } catch (error) {
    console.error("Error during conversion:", error);
    process.exit(1);
  }
}

// Run the script if called directly. Guarded on `require` so the module can be
// imported from an ESM test runner without executing the CLI.
if (typeof require !== "undefined" && require.main === module) {
  main();
}
