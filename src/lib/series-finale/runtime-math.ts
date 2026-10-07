/**
 * The pure half of the runtime accounting: key building and summation, with no
 * loader attached.
 *
 * It is split out of `runtime.ts` because that module imports `../db`, which
 * throws "DATABASE_URL environment variable is required" at module scope. The
 * aggregation engine is pure by design and its tests set no `DATABASE_URL`, so
 * an aggregator importing these helpers through the loader would give a test
 * file that cannot import its own subject. `runtime-math.test.ts` deliberately
 * mocks nothing, which is what keeps that true.
 */

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
