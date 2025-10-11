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
