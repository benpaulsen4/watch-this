import {
  getTimezoneDateKey,
  getTimezoneHour,
  getTimezoneWeekday,
} from "../time";
// From `./runtime-math`, never `./runtime`: the loader module imports `../db`,
// which throws at module scope without a DATABASE_URL, and this engine is pure
// by design -- its tests set no such variable and mock nothing.
import { type RuntimeLookup, summariseEpisodeRuntimes } from "./runtime-math";
import { partitionSoloTicks } from "./solo-ticks";
import {
  type ContentStatusRow,
  type SeriesFinalePayload,
  SOLO_TICK_FLOOR,
  titleKey,
  type TitleMeta,
  type WatchedEpisodeRow,
} from "./types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isWithin(at: Date, period: { start: Date; end: Date }): boolean {
  return at >= period.start && at < period.end;
}

/**
 * Completed titles in the period, split by content type.
 *
 * Films carry no per-watch timestamp, so completion is dated by
 * `user_content_status.updated_at`. That column is only written when a writer
 * sets it explicitly -- the `nextEpisodeDate`-only update path does not touch
 * it -- so it survives as a completion date. A user who re-marks a title does
 * move it into the later period; that is accepted and documented in the spec.
 */
export function countFinished(
  statuses: ContentStatusRow[],
  period: { start: Date; end: Date },
): { films: number; shows: number; total: number } {
  let films = 0;
  let shows = 0;

  for (const row of statuses) {
    if (row.status !== "completed") continue;
    if (!isWithin(row.updatedAt, period)) continue;

    if (row.contentType === "movie") films += 1;
    else shows += 1;
  }

  return { films, shows, total: films + shows };
}

/** Dropped titles in the period. Only shows can be dropped. */
export function countDropped(
  statuses: ContentStatusRow[],
  period: { start: Date; end: Date },
): number {
  return statuses.filter(
    (row) => row.status === "dropped" && isWithin(row.updatedAt, period),
  ).length;
}

/**
 * Twelve zero-filled monthly buckets combining episodes (dated by `watchedAt`)
 * and completed films (dated by `updatedAt`), both bucketed in the user's
 * timezone so the months match the calendar they experienced.
 *
 * The year every row is checked against is derived here, from `period.start`
 * in `timeZone`, rather than taken as a number from the caller. A caller
 * holding a `period` naturally reaches for `period.start.getUTCFullYear()`,
 * and that is wrong for every zone east of UTC: Auckland's local 2026-01-01
 * 00:00 is `2025-12-31T11:00Z`, so the year would come back 2025, every row of
 * a 2026 recap would fail the check, all twelve buckets would return zero, and
 * nothing would throw. Deriving it in-zone makes that unrepresentable instead
 * of merely documented.
 */
export function buildMonths(
  episodes: WatchedEpisodeRow[],
  statuses: ContentStatusRow[],
  timeZone: string,
  period: { start: Date; end: Date },
): { month: number; episodes: number }[] {
  const buckets = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    episodes: 0,
  }));

  // Compared as the four-character prefix of the same "YYYY-MM-DD" shape every
  // row produces, so the two sides cannot disagree about how a year is read.
  const periodYear = getTimezoneDateKey(period.start, timeZone).slice(0, 4);

  const add = (at: Date) => {
    const key = getTimezoneDateKey(at, timeZone);
    // Destructured with defaults rather than indexed: under
    // `noUncheckedIndexedAccess` a split part is `string | undefined`, and the
    // empty defaults match no year and parse to NaN, which drops the row. That
    // is the right outcome for a date key this helper could not read --
    // silently charging it to month NaN would corrupt a bucket.
    const [year = "", month = ""] = key.split("-");
    if (year !== periodYear) return;

    const bucket = buckets[Number.parseInt(month, 10) - 1];
    if (bucket) bucket.episodes += 1;
  };

  for (const row of episodes) add(row.watchedAt);
  for (const row of statuses) {
    if (row.status === "completed" && row.contentType === "movie") {
      add(row.updatedAt);
    }
  }

  return buckets;
}

/** Mean episodes per calendar day across the period. */
export function episodesPerDay(
  total: number,
  period: { start: Date; end: Date },
): number {
  const days = (period.end.getTime() - period.start.getTime()) / MS_PER_DAY;
  if (days <= 0) return 0;
  return total / days;
}

/** Median of `values`, or null when there are none. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  // Both indices are in range once the empty case is gone -- `middle` always
  // is, and `middle - 1` whenever the count is even -- but
  // `noUncheckedIndexedAccess` types them as possibly-undefined. Falling back
  // to the null this function already returns for no values keeps the contract
  // honest without a non-null assertion papering over a real index bug.
  const upper = sorted[middle];
  if (upper === undefined) return null;
  if (sorted.length % 2 !== 0) return upper;

  const lower = sorted[middle - 1];
  return lower === undefined ? upper : (lower + upper) / 2;
}

/**
 * The show with the most episodes watched in the period.
 *
 * `finishedAt` comes from the latest `watchedAt` rather than a status column,
 * because that is a real event with a real timestamp -- unlike film completion,
 * which has to be inferred.
 *
 * When the top show has no cached metadata the whole statistic returns null
 * rather than falling through to the runner-up. That is deliberate, and it is
 * why this differs from `buildNiche` and `buildGenres`, which drop an
 * unresolvable row and carry on: those two describe a population, so one
 * missing title makes them slightly less complete, while this one names a
 * single show. Silently promoting second place would tell the user their most
 * watched show of the year was something it was not, and nothing in the
 * rendering would reveal the substitution.
 */
export function buildTopShow(
  episodes: WatchedEpisodeRow[],
  titles: Map<string, TitleMeta>,
  episodeRuntimeLookup: RuntimeLookup,
  timeZone: string,
): SeriesFinalePayload["topShow"] {
  if (episodes.length === 0) return null;

  const byShow = new Map<number, WatchedEpisodeRow[]>();
  for (const row of episodes) {
    const existing = byShow.get(row.tmdbId);
    if (existing) existing.push(row);
    else byShow.set(row.tmdbId, [row]);
  }

  let topId: number | null = null;
  let topRows: WatchedEpisodeRow[] = [];
  for (const [tmdbId, rows] of byShow) {
    if (rows.length > topRows.length) {
      topId = tmdbId;
      topRows = rows;
    }
  }

  if (topId === null) return null;

  const meta = titles.get(titleKey(topId, "tv"));
  if (!meta) return null;

  const { minutes } = summariseEpisodeRuntimes(topRows, episodeRuntimeLookup);
  const latest = topRows.reduce((newest, row) =>
    row.watchedAt > newest.watchedAt ? row : newest,
  );

  return {
    tmdbId: topId,
    title: meta.title,
    posterPath: meta.posterPath,
    episodes: topRows.length,
    minutes,
    finishedAt: getTimezoneDateKey(latest.watchedAt, timeZone),
    // Filled by the service in plan 3, which is the only layer that knows about
    // other users. The pure engine stays free of cross-user concerns.
    alsoTopFor: [],
  };
}

/**
 * The least popular film completed in the period, against the median of the
 * others.
 *
 * Popularity is the currently-cached TMDB value, not the value at watch time --
 * TMDB popularity drifts, so this reflects today's obscurity. Accepted and
 * documented in the spec.
 */
export function buildNiche(
  statuses: ContentStatusRow[],
  titles: Map<string, TitleMeta>,
  period: { start: Date; end: Date },
): SeriesFinalePayload["niche"] {
  const films = statuses
    .filter(
      (row) =>
        row.contentType === "movie" &&
        row.status === "completed" &&
        isWithin(row.updatedAt, period),
    )
    .map((row) => titles.get(titleKey(row.tmdbId, "movie")))
    .filter((meta): meta is TitleMeta => meta !== undefined);

  if (films.length === 0) return null;

  const least = films.reduce((lowest, meta) =>
    meta.popularity < lowest.popularity ? meta : lowest,
  );
  const most = films.reduce((highest, meta) =>
    meta.popularity > highest.popularity ? meta : highest,
  );

  const others = films
    .filter((meta) => meta.tmdbId !== least.tmdbId)
    .map((meta) => meta.popularity);

  return {
    tmdbId: least.tmdbId,
    title: least.title,
    posterPath: least.posterPath,
    popularity: least.popularity,
    medianPopularity: median(others) ?? least.popularity,
    mostPopular:
      most.tmdbId === least.tmdbId
        ? null
        : {
            tmdbId: most.tmdbId,
            title: most.title,
            popularity: most.popularity,
          },
    filmPopularities: films.map((meta) => meta.popularity),
  };
}

/**
 * Share of genre *tags* across the titles completed in the period: top five,
 * remainder folded together.
 *
 * The denominator is the number of genre assignments, not the number of
 * titles -- a title tagged Drama, Thriller and Crime contributes three. So a
 * percent here reads "this share of the genre labels on what you finished",
 * not "this share of your finished titles".
 *
 * Each bucket is also rounded independently, so the values need not total 100:
 * six genres at one tag each come out as 17% six times, which is 102. A
 * renderer that assumes the list sums to 100 -- a stacked bar drawn to a fixed
 * width, say -- will overflow. Treat the percents as labels and compute any
 * geometry from the shares themselves.
 */
export function buildGenres(
  statuses: ContentStatusRow[],
  titles: Map<string, TitleMeta>,
  genreNames: Map<number, string>,
  period: { start: Date; end: Date },
): { name: string; percent: number }[] {
  const completed = statuses
    .filter(
      (row) => row.status === "completed" && isWithin(row.updatedAt, period),
    )
    .map((row) => titles.get(titleKey(row.tmdbId, row.contentType)))
    .filter((meta): meta is TitleMeta => meta !== undefined);

  if (completed.length === 0) return [];

  const counts = new Map<number, number>();
  for (const meta of completed) {
    for (const genreId of meta.genreIds) {
      counts.set(genreId, (counts.get(genreId) ?? 0) + 1);
    }
  }

  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  if (total === 0) return [];

  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 5);
  const rest = ranked.slice(5);

  const result = top.map(([genreId, count]) => ({
    name: genreNames.get(genreId) ?? "Unknown",
    percent: Math.round((count / total) * 100),
  }));

  if (rest.length > 0) {
    const restCount = rest.reduce((sum, [, count]) => sum + count, 0);
    result.push({
      name: "Everything else",
      percent: Math.round((restCount / total) * 100),
    });
  }

  return result;
}

function groupByDateKey(
  episodes: WatchedEpisodeRow[],
  timeZone: string,
): Map<string, WatchedEpisodeRow[]> {
  const byDay = new Map<string, WatchedEpisodeRow[]>();
  for (const row of episodes) {
    const key = getTimezoneDateKey(row.watchedAt, timeZone);
    const existing = byDay.get(key);
    if (existing) existing.push(row);
    else byDay.set(key, [row]);
  }
  return byDay;
}

/** Longest run of consecutive calendar days present in `dateKeys`. */
export function longestStreak(
  dateKeys: string[],
): { days: number; start: string; end: string } | null {
  const unique = Array.from(new Set(dateKeys)).sort();

  // Destructured rather than indexed: `noUncheckedIndexedAccess` types
  // `unique[0]` as possibly-undefined, and the check that narrows it is the
  // same check that rejects an empty input, so one guard covers both.
  const [firstDay] = unique;
  if (firstDay === undefined) return null;

  let bestLength = 1;
  let bestStart = firstDay;
  let bestEnd = firstDay;

  let runLength = 1;
  let runStart = firstDay;

  // Walked as a pair of values rather than by index for the same reason:
  // `unique[i]` and `unique[i - 1]` are both possibly-undefined, and carrying
  // the previous day forward removes the indexing instead of asserting it away.
  let previousDay = firstDay;
  for (const currentDay of unique.slice(1)) {
    // Compared as UTC midnights, so a run never breaks or merges on a DST
    // shift: local midnights 23 and 25 hours apart are both one calendar day.
    const previous = Date.parse(`${previousDay}T00:00:00Z`);
    const current = Date.parse(`${currentDay}T00:00:00Z`);
    const consecutive = current - previous === MS_PER_DAY;

    if (consecutive) {
      runLength += 1;
    } else {
      runLength = 1;
      runStart = currentDay;
    }

    if (runLength > bestLength) {
      bestLength = runLength;
      bestStart = runStart;
      bestEnd = currentDay;
    }

    previousDay = currentDay;
  }

  return { days: bestLength, start: bestStart, end: bestEnd };
}

/**
 * The day with the most episodes.
 *
 * The date, count and minutes use every episode. The `timeline` uses only solo
 * ticks and is null below the floor -- a batch of eleven episodes shares one
 * timestamp, so charting it would draw a single spike and describe it as an
 * eight-hour session.
 */
export function buildBigDay(
  episodes: WatchedEpisodeRow[],
  timeZone: string,
  episodeRuntimeLookup: RuntimeLookup,
): SeriesFinalePayload["bigDay"] {
  if (episodes.length === 0) return null;

  const byDay = groupByDateKey(episodes, timeZone);

  let bestKey = "";
  let bestRows: WatchedEpisodeRow[] = [];
  for (const [key, rows] of byDay) {
    // A tie resolves to the earlier date rather than to whichever day the
    // input happened to mention first. `episodes` arrives in whatever order
    // the caller's query produced, and "your biggest day" silently changing
    // because an ORDER BY changed is a bug nobody would think to look for.
    const better =
      rows.length > bestRows.length ||
      (rows.length === bestRows.length && key < bestKey);

    if (better) {
      bestKey = key;
      bestRows = rows;
    }
  }

  const { solo } = partitionSoloTicks(episodes);
  const soloOnBestDay = solo.filter(
    (row) => getTimezoneDateKey(row.watchedAt, timeZone) === bestKey,
  );

  const { minutes } = summariseEpisodeRuntimes(bestRows, episodeRuntimeLookup);

  return {
    date: bestKey,
    episodes: bestRows.length,
    minutes,
    timeline:
      solo.length >= SOLO_TICK_FLOOR
        ? soloOnBestDay
            .slice()
            .sort((a, b) => a.watchedAt.getTime() - b.watchedAt.getTime())
            .map((row) => ({ at: row.watchedAt.toISOString() }))
        : null,
    soloTickCount: soloOnBestDay.length,
    streak: longestStreak(Array.from(byDay.keys())),
  };
}

/**
 * Weekday distribution over every episode, plus the share of solo ticks after
 * 21:00.
 *
 * Weekday counts use all episodes: a batch write still lands on the right day.
 * `lateShare` uses solo ticks only and is null below the floor, because
 * time-of-day over batched rows is an artefact of when someone bulk-marked.
 */
export function buildRhythm(
  episodes: WatchedEpisodeRow[],
  timeZone: string,
): {
  weekdayCounts: number[];
  topWeekday: number | null;
  lateShare: number | null;
} {
  const weekdayCounts = Array.from({ length: 7 }, () => 0);
  for (const row of episodes) {
    const weekday = getTimezoneWeekday(row.watchedAt, timeZone);
    // `?? 0` only to satisfy `noUncheckedIndexedAccess`: `getTimezoneWeekday`
    // is documented 0-6 and falls back to 0 itself, so the default is
    // unreachable and no count can be lost to it.
    weekdayCounts[weekday] = (weekdayCounts[weekday] ?? 0) + 1;
  }

  const total = weekdayCounts.reduce((a, b) => a + b, 0);
  const topWeekday =
    total === 0 ? null : weekdayCounts.indexOf(Math.max(...weekdayCounts));

  const { solo } = partitionSoloTicks(episodes);
  const lateShare =
    solo.length >= SOLO_TICK_FLOOR
      ? solo.filter((row) => getTimezoneHour(row.watchedAt, timeZone) >= 21)
          .length / solo.length
      : null;

  return { weekdayCounts, topWeekday, lateShare };
}

/**
 * For each weekday, the median episode count across the days that weekday was
 * actually active. Feeds archetype rule 3, which distinguishes "watches a bit
 * every Sunday" from "marathons on Sundays".
 */
export function medianEpisodesPerActiveDayByWeekday(
  episodes: WatchedEpisodeRow[],
  timeZone: string,
): number[] {
  const byDay = groupByDateKey(episodes, timeZone);
  const perWeekday: number[][] = Array.from({ length: 7 }, () => []);

  for (const rows of byDay.values()) {
    // Every group is created holding a row, so the guard never fires; it is
    // how `noUncheckedIndexedAccess` is satisfied without an assertion. All
    // rows in a group share a date key, so any of them gives the same weekday.
    const [first] = rows;
    if (first === undefined) continue;

    const bucket = perWeekday[getTimezoneWeekday(first.watchedAt, timeZone)];
    if (bucket) bucket.push(rows.length);
  }

  // Only active days are in each bucket, so a quiet Tuesday contributes
  // nothing rather than a zero -- counting absent days as zeros would drag
  // every median toward zero and make rule 3 unreachable. A weekday that was
  // never active has no median at all, and reports 0.
  return perWeekday.map((counts) => median(counts) ?? 0);
}
