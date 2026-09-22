import {
  type ArchetypeId,
  SOLO_TICK_FLOOR,
  THIN_YEAR_EPISODES,
  THIN_YEAR_TITLES,
} from "./types";

export interface ArchetypeInput {
  completedTitles: number;
  droppedShows: number;
  pausedTitles: number;
  /** Episode counts per weekday, Monday-first, 7 entries. */
  weekdayCounts: number[];
  /** Median episodes on the days that weekday was active, Monday-first. */
  medianEpisodesPerActiveDayByWeekday: number[];
  /**
   * Episodes and completed films per calendar month, 12 entries. Films count
   * despite the name -- `buildMonths` buckets both -- so a year spent on films
   * varies month to month here rather than arriving as twelve zeros, which
   * would put the feast-or-famine rule permanently out of reach for that user.
   */
  monthlyEpisodeCounts: number[];
  soloTickHours: number[];
  soloTickWeekdays: number[];
  /**
   * Individually-ticked episodes across the whole period. Not
   * `SeriesFinalePayload["bigDay"].soloTickCount`, which counts one day --
   * same name, different denominator, and one caller wires up both.
   */
  soloTickCount: number;
  /**
   * Share of completed TITLES carrying the most common genre tag, unrounded.
   * Not the share of genre tags that `SeriesFinalePayload["genres"]` reports:
   * titles usually carry two or three tags, so the two differ by roughly that
   * factor and only this one answers "how much of your year was one genre".
   */
  topGenreShare: number;
  medianPopularity: number | null;
  collaborativeCompletedShare: number;
  totalEpisodes: number;
  totalTitles: number;
}

/**
 * Standard deviation over the mean. Zero when the mean is zero, because a year
 * with no episodes is not "highly variable" -- it is empty, and NaN would
 * propagate into the comparison and silently read as false anyway.
 */
export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (mean === 0) return 0;

  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;

  return Math.sqrt(variance) / mean;
}

/**
 * Largest share of `hours` falling inside any window of `windowSize` hours.
 * Windows wrap across midnight, because a 22:00-01:00 habit is exactly the
 * pattern this is looking for.
 *
 * Entries outside 0-23 are counted in the denominator but never in a window.
 * They are upstream bugs, and writing them into the bucket array would create a
 * phantom hour; diluting the share instead means corrupt input can only fail to
 * fire the archetype, never fire it falsely.
 */
export function maxWindowShare(hours: number[], windowSize: number): number {
  if (hours.length === 0) return 0;

  const counts: number[] = Array.from({ length: 24 }, () => 0);
  for (const hour of hours) {
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    counts[hour] = (counts[hour] ?? 0) + 1;
  }

  let best = 0;
  for (let start = 0; start < 24; start += 1) {
    let inWindow = 0;
    for (let offset = 0; offset < windowSize; offset += 1) {
      inWindow += counts[(start + offset) % 24] ?? 0;
    }
    best = Math.max(best, inWindow);
  }

  return best / hours.length;
}

/**
 * Assign exactly one archetype.
 *
 * Rules are evaluated in order and the first match wins, so an input satisfying
 * several resolves deterministically rather than depending on iteration order.
 * Rule 5 is skipped when there are too few individually-ticked episodes to say
 * anything about time of day -- batch writes share one timestamp, so a bulk
 * marker would otherwise satisfy the window test trivially.
 */
export function classifyArchetype(input: ArchetypeInput): ArchetypeId | null {
  if (
    input.totalEpisodes < THIN_YEAR_EPISODES &&
    input.totalTitles < THIN_YEAR_TITLES
  ) {
    return null;
  }

  // 1 - Serial Abandoner
  const abandonDenominator = input.droppedShows + input.completedTitles;
  if (
    input.droppedShows >= 5 &&
    abandonDenominator > 0 &&
    input.droppedShows / abandonDenominator >= 0.35
  ) {
    return "serial-abandoner";
  }

  // 2 - Completionist
  const completionDenominator =
    input.completedTitles + input.droppedShows + input.pausedTitles;
  if (
    completionDenominator >= 15 &&
    input.completedTitles / completionDenominator >= 0.9
  ) {
    return "completionist";
  }

  // 3 - Weekday Marathoner
  const totalWeekdayEpisodes = input.weekdayCounts.reduce((a, b) => a + b, 0);
  if (totalWeekdayEpisodes > 0) {
    for (let weekday = 0; weekday < input.weekdayCounts.length; weekday += 1) {
      const share = (input.weekdayCounts[weekday] ?? 0) / totalWeekdayEpisodes;
      const median = input.medianEpisodesPerActiveDayByWeekday[weekday] ?? 0;
      if (share >= 0.22 && median >= 4) {
        return "weekday-marathoner";
      }
    }
  }

  // 4 - Feast or Famine
  if (coefficientOfVariation(input.monthlyEpisodeCounts) >= 0.75) {
    return "feast-or-famine";
  }

  // 5 - Nightly Ritualist (skipped below the solo-tick floor)
  if (input.soloTickCount >= SOLO_TICK_FLOOR) {
    const distinctWeekdays = new Set(input.soloTickWeekdays).size;
    if (
      distinctWeekdays >= 5 &&
      maxWindowShare(input.soloTickHours, 3) >= 0.6
    ) {
      return "nightly-ritualist";
    }
  }

  // 6 - One Genre Only
  if (input.topGenreShare >= 0.4) {
    return "one-genre-only";
  }

  // 7 - Deep Cut Hunter
  if (input.medianPopularity !== null && input.medianPopularity <= 25) {
    return "deep-cut-hunter";
  }

  // 8 - Group Watcher
  if (input.collaborativeCompletedShare >= 0.5) {
    return "group-watcher";
  }

  return null;
}
