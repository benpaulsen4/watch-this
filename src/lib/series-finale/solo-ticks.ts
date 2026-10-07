import type { WatchedEpisodeRow } from "./types";

/**
 * Two ticks of the same show this close together are one sitting at the
 * checkbox, not two viewings: no episode is short enough to watch in between.
 *
 * It has to be a gap rather than an exact match because of how batches were
 * written. Since July 2026, batch episode writes in
 * `src/lib/episodes/episodeUtils.ts` compute a single `new Date()` and apply
 * it to every row, so a marked season shares one timestamp to the
 * millisecond. Before that, the batch endpoint looped over the episodes and
 * each write took its own `new Date()`, so a marked season from those years is
 * a run of rows milliseconds to seconds apart. Ticking a few episodes of a
 * show by hand in quick succession, after the fact, is the same artefact and
 * lands here too.
 *
 * Different shows ticked together are not: ticking the two or three shows on
 * today's schedule in one go, before or after watching them, is a common
 * routine, and each is a separate viewing.
 */
export const BATCH_GAP_MS = 2 * 60_000;

/**
 * Split episodes into those ticked individually and those written as part of a
 * batch.
 *
 * An episode is batched when another episode of the same show was ticked
 * within `BATCH_GAP_MS` of it, so a run of a show's ticks each close to the
 * next is one batch however long the whole run lasts. Every write path saves
 * one show at a time, so a batch never spans shows. The one exception is rows
 * sharing a timestamp to the millisecond: separate taps never do, but an
 * import can (the SeriesGuide converter stamps episodes with their air
 * dates), so those are batched whatever their show.
 *
 * Intra-day statistics computed over batched rows would show ten episodes at
 * one instant and read as a viewing habit that never happened. Only intra-day
 * cuts use this. Episode totals, monthly buckets, weekday distribution and
 * streaks are all correct over batched rows and must use the full set.
 */
export function partitionSoloTicks(episodes: WatchedEpisodeRow[]): {
  solo: WatchedEpisodeRow[];
  batched: WatchedEpisodeRow[];
} {
  const countByInstant = new Map<number, number>();
  const byShow = new Map<number, WatchedEpisodeRow[]>();
  for (const episode of episodes) {
    const instant = episode.watchedAt.getTime();
    countByInstant.set(instant, (countByInstant.get(instant) ?? 0) + 1);
    const show = byShow.get(episode.tmdbId);
    if (show) show.push(episode);
    else byShow.set(episode.tmdbId, [episode]);
  }

  const batchedRows = new Set<WatchedEpisodeRow>(
    episodes.filter(
      (episode) => countByInstant.get(episode.watchedAt.getTime())! > 1,
    ),
  );
  for (const rows of byShow.values()) {
    rows.sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime());
    for (let i = 1; i < rows.length; i += 1) {
      const previous = rows[i - 1]!;
      const current = rows[i]!;
      if (
        current.watchedAt.getTime() - previous.watchedAt.getTime() <=
        BATCH_GAP_MS
      ) {
        batchedRows.add(previous);
        batchedRows.add(current);
      }
    }
  }

  const solo: WatchedEpisodeRow[] = [];
  const batched: WatchedEpisodeRow[] = [];

  for (const episode of episodes) {
    if (batchedRows.has(episode)) {
      batched.push(episode);
    } else {
      solo.push(episode);
    }
  }

  return { solo, batched };
}
