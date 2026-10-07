import type { WatchedEpisodeRow } from "./types";

/**
 * Split episodes into those ticked individually and those written as part of a
 * batch.
 *
 * Batch episode writes in `src/lib/episodes/episodeUtils.ts` compute a single
 * `new Date()` and apply it to every episode in the batch, so marking a season
 * watched produces N rows sharing one timestamp to the millisecond. Intra-day
 * statistics computed over those rows would show ten episodes at one instant
 * and read as a viewing habit that never happened.
 *
 * Only intra-day cuts use this. Episode totals, monthly buckets, weekday
 * distribution and streaks are all correct over batched rows and must use the
 * full set.
 */
export function partitionSoloTicks(episodes: WatchedEpisodeRow[]): {
  solo: WatchedEpisodeRow[];
  batched: WatchedEpisodeRow[];
} {
  const countByInstant = new Map<number, number>();
  for (const episode of episodes) {
    const instant = episode.watchedAt.getTime();
    countByInstant.set(instant, (countByInstant.get(instant) ?? 0) + 1);
  }

  const solo: WatchedEpisodeRow[] = [];
  const batched: WatchedEpisodeRow[] = [];

  for (const episode of episodes) {
    if (countByInstant.get(episode.watchedAt.getTime()) === 1) {
      solo.push(episode);
    } else {
      batched.push(episode);
    }
  }

  return { solo, batched };
}
