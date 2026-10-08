# SeriesGuide to WatchThis Converter

This tool converts SeriesGuide JSON exports to the WatchThis import format.

## Usage

### Prerequisites

- Node.js installed on your system
- TypeScript execution environment (tsx will be installed automatically)

### Running the Converter

```bash
# Basic usage - converts input file and creates output with "-watchthis-import" suffix
npx tsx seriesguide-converter.ts <input-file>

# Specify custom output file
npx tsx seriesguide-converter.ts <input-file> <output-file>

# Example
npx tsx seriesguide-converter.ts seriesguide-snippet.json my-watchthis-import.json
```

### What it does

1. **Content Status Mapping**:
   - Maps each TV show from SeriesGuide to WatchThis format
   - Determines status based on SeriesGuide status and watched episodes:
     - `ended` shows with watched episodes → `completed`
     - `continuing` shows with watched episodes → `watching`
     - Shows without watched episodes → `planning`
     - `canceled` shows → `dropped` (if watched) or `planning`

2. **Episode Watch Status**:
   - Only includes episodes marked as `watched: true` in SeriesGuide
   - Maps episode air dates to `watchedAt` timestamps
   - Uses the show's TMDB ID (not individual episode TMDB IDs)

### Output Format

The generated JSON follows the WatchThis import schema with:

- `contentStatus`: Array of shows with their watch status
- `episodeWatchStatus`: Array of individual watched episodes

### Example Output

```json
{
  "contentStatus": [
    {
      "tmdbId": 217512,
      "contentType": "tv",
      "status": "completed"
    }
  ],
  "episodeWatchStatus": [
    {
      "tmdbId": 217512,
      "seasonNumber": 1,
      "episodeNumber": 1,
      "watched": true,
      "watchedAt": "2023-10-04T15:30:00.000Z"
    }
  ]
}
```

### Notes

- Only TV shows are supported (SeriesGuide doesn't handle movies)
- Unwatched episodes are not included in the output
- The converter preserves TMDB IDs for accurate matching
- Episode air dates are used as watch timestamps when available

## Series Finale runtime backfill

`backfill-runtimes.ts` warms the two runtime caches Series Finale's "hours
watched" headline reads from -- `tmdb_episode_runtime` for TV and the
`tmdb_cache.runtime` column for film -- across every show and film already
in watch history. It's the first tool in this directory that touches the
database; everything else here is a standalone converter.

### Running it

```bash
npm run backfill:runtimes
```

The npm script runs the file through `tsx`, which this project now declares as
a devDependency, so `npm install` is all it takes to have it.

### Environment

Needs `DATABASE_URL` and `TMDB_API_KEY` set exactly as the running app
requires them. The script imports `src/lib/db`, which throws immediately if
`DATABASE_URL` is missing, so there's no way to run it half-configured.

### Re-run safety

Safe to run more than once, and safe to stop partway through. A season is
recorded in `tmdb_season_fetch` only when TMDB gave a definitive answer:
either the season came back, or TMDB returned a 404 saying there is no such
season. A rate limit, a server error or a dropped connection records nothing,
so the next run asks again -- that is the retry path, and it happens by
itself rather than being something you have to arrange. Film lookups skip
any `tmdb_cache` row that already has a runtime, and a film that failed is
retried the same way.

Recorded seasons are re-asked about after 30 days. A season that was still
airing when it was first fetched only had some of its episodes then, and
without a refresh the rest would never get runtimes for anyone. The cost is
bounded by shows x seasons rather than by episodes, so a monthly re-ask is
cheap next to a permanent undercount.

One film case is not a no-op on re-run: a film can sit in a user's watch
history with no `tmdb_cache` row at all (the profile bulk importer writes
`userContentStatus` without populating the cache). There's no row for this
script to attach a runtime to, so it counts and skips these rather than
fetching a runtime it would have nowhere to put. The end-of-run summary
reports how many; get the app's own caching path to run for them first
(viewing or adding the title works), then re-run this script.

### What it reports

The end-of-run summary counts both halves: seasons considered, fetched,
already cached and failed, then the same for films plus the no-cache-row
skips. Seasons are the slow half and report only when they finish; films
print a progress line every 25 titles considered, cached or not.

### Before enabling Series Finale

Run this once over the existing watch history before turning Series Finale
generation on. Skip it and the first snapshot for every user does its TMDB
lookups inline instead of reading a warm cache -- thousands of round trips
that this script exists to avoid.
