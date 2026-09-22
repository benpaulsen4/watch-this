import {
  getTimezoneDateKey,
  getTimezoneHour,
  getTimezoneWeekday,
  resolveTimeZone,
} from "../time";
import { classifyArchetype } from "./archetype";
// From `./runtime-math`, never `./runtime`: the loader module imports `../db`,
// which throws at module scope without a DATABASE_URL, and this engine is pure
// by design -- its tests set no such variable and mock nothing.
import { type RuntimeLookup, summariseEpisodeRuntimes } from "./runtime-math";
import { partitionSoloTicks } from "./solo-ticks";
import {
  type AggregationInput,
  type ContentStatusRow,
  SERIES_FINALE_SCHEMA_VERSION,
  type SeriesFinalePayload,
  SOLO_TICK_FLOOR,
  THIN_YEAR_EPISODES,
  THIN_YEAR_TITLES,
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
 * The year every row is checked against is derived here, in `timeZone`, from
 * the period's MIDPOINT rather than either of its edges, and never taken as a
 * number from the caller. Both edges are wrong, in opposite directions, and
 * which one bites depends on how the caller built the period:
 *
 * - Read `period.start` as UTC (`getUTCFullYear()`) and every zone EAST of UTC
 *   breaks: Auckland's local 2026-01-01 00:00 is `2025-12-31T11:00Z`, so the
 *   year comes back 2025.
 * - Read `period.start` in-zone and every zone WEST of UTC breaks instead,
 *   whenever the caller built the period from UTC midnights: `2026-01-01T00:00Z`
 *   is 2025-12-31 in Los Angeles, so the year comes back 2025 again.
 *
 * Either way every row of a 2026 recap fails the check, all twelve buckets
 * return zero, and nothing throws. The midpoint is the only point that is
 * boundary-independent: it sits roughly half a period away from both edges, so
 * no offset in the +14/-12 IANA range (nor any DST shift) can push it out of
 * the intended year for any period at least a day long.
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
  const midpoint = new Date(
    (period.start.getTime() + period.end.getTime()) / 2,
  );
  const periodYear = getTimezoneDateKey(midpoint, timeZone).slice(0, 4);

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
    // A tie resolves to the lower `tmdbId` rather than to whichever show the
    // input happened to mention first -- the same correction `buildBigDay`
    // carries for its date. `episodes` arrives in whatever order the caller's
    // query produced, and "your most watched show" silently changing because
    // an ORDER BY changed is a bug nobody would think to look for. The id is
    // arbitrary as a ranking, which is the point: nothing here ranks two
    // equally-watched shows against each other, so the only requirement is
    // that the same year renders the same way twice.
    const better =
      rows.length > topRows.length ||
      (rows.length === topRows.length && topId !== null && tmdbId < topId);

    if (better) {
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
 *
 * Deliberately NOT the number the `one-genre-only` archetype reads: that one is
 * `topGenreTitleShare` below, over a different denominator. Do not collapse the
 * two -- see its comment for why they answer different questions.
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

/**
 * Share of completed titles carrying the single most common genre tag, for the
 * `one-genre-only` archetype.
 *
 * Computed here rather than read off `buildGenres`, for two reasons.
 *
 * The denominators differ, and both are right for their own question.
 * `buildGenres` divides by the number of genre TAGS, because a breakdown of
 * "what your year looked like" should let one title speak for each label it
 * carries. This divides by the number of TITLES, because the archetype asks
 * "how much of what you finished was this one genre" -- and a TMDB title
 * usually carries two or three tags, so the tag denominator drags the answer
 * down by exactly that factor. Ten titles all tagged Drama/Thriller/Crime are
 * 100% Drama by title and 33% by tag; against a 0.4 threshold the rule could
 * not fire for a user watching nothing but that one genre. Neither figure is
 * wrong; they are answers to different questions, so leave them apart.
 *
 * It is also unrounded. `buildGenres` rounds for display, and a classification
 * threshold reading a display percent moves whenever the rounding does -- 0.395
 * would classify, 0.404 might not.
 */
function topGenreTitleShare(completed: TitleMeta[]): number {
  if (completed.length === 0) return 0;

  const titlesPerGenre = new Map<number, number>();
  for (const meta of completed) {
    // Deduplicated per title: a row listing the same genre twice is a data
    // problem, and counting it twice could push a share above 1.
    for (const genreId of new Set(meta.genreIds)) {
      titlesPerGenre.set(genreId, (titlesPerGenre.get(genreId) ?? 0) + 1);
    }
  }

  const best = Math.max(0, ...titlesPerGenre.values());

  // Divided by the titles whose genres are actually known -- the caller passes
  // only resolvable metadata. A title with no cached row has unknown genres,
  // not zero genres, so counting it in the denominator would read as evidence
  // against the archetype when it is really absence of evidence.
  return best / completed.length;
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
  // Intersected by identity against the rows already bucketed into the big
  // day, rather than re-deriving a date key for every solo tick in the period.
  // `getTimezoneDateKey` builds an `Intl.DateTimeFormat` per call, so the
  // obvious filter costs a second formatter pass over the whole year to
  // recompute keys `groupByDateKey` has just produced. Both arrays hold the
  // same row objects from `episodes` in the same relative order, so this
  // selects exactly the same rows.
  const soloRows = new Set(solo);
  const soloOnBestDay = bestRows.filter((row) => soloRows.has(row));

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
 * Weekday distribution over every episode, plus the share of solo ticks from
 * 21:00 onwards -- the 21:00 hour itself counts, so a 21:30 episode is late.
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

/**
 * Shows abandoned in the period, and films still sitting in "planning".
 *
 * Only shows can be dropped -- `MovieWatchStatus` is planning-or-completed --
 * so the two lists are genuinely different things rather than one filtered
 * two ways.
 *
 * `now` is a parameter rather than `new Date()` so the day counts are
 * deterministic under test.
 */
export function buildShame(
  statuses: ContentStatusRow[],
  titles: Map<string, TitleMeta>,
  episodes: WatchedEpisodeRow[],
  period: { start: Date; end: Date },
  now: Date,
): SeriesFinalePayload["shame"] {
  const lastEpisodeByShow = new Map<number, WatchedEpisodeRow>();
  for (const row of episodes) {
    const current = lastEpisodeByShow.get(row.tmdbId);
    // "Last" in season/episode order, not in `watchedAt` order: someone who
    // circles back to mop up an episode they skipped did not un-abandon the
    // show at the point they stopped.
    const isLater =
      !current ||
      row.seasonNumber > current.seasonNumber ||
      (row.seasonNumber === current.seasonNumber &&
        row.episodeNumber > current.episodeNumber);
    if (isLater) lastEpisodeByShow.set(row.tmdbId, row);
  }

  const dropped = statuses
    .filter((row) => row.status === "dropped" && isWithin(row.updatedAt, period))
    .map((row) => {
      const meta = titles.get(titleKey(row.tmdbId, row.contentType));
      // A title with no cached metadata is dropped from the list rather than
      // named "Unknown". This describes a population, so one unresolvable row
      // makes it slightly less complete; a placeholder would make it wrong.
      if (!meta) return null;

      const last = lastEpisodeByShow.get(row.tmdbId);
      return {
        tmdbId: row.tmdbId,
        title: meta.title,
        lastEpisode: last
          ? `S${last.seasonNumber}E${String(last.episodeNumber).padStart(2, "0")}`
          : null,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    // Ordered by `tmdbId` rather than left in whatever order the caller's
    // query returned. Nothing here ranks shows against each other, so the only
    // requirement is that the same year renders the same way twice.
    .sort((a, b) => a.tmdbId - b.tmdbId);

  // Deliberately not filtered by the period: a film added three years ago and
  // never watched is exactly what this list is for, and dating it by the
  // recap year would hide the worst offenders.
  const stillPlanning = statuses
    .filter((row) => row.status === "planning" && row.contentType === "movie")
    .map((row) => {
      const meta = titles.get(titleKey(row.tmdbId, "movie"));
      if (!meta) return null;

      return {
        tmdbId: row.tmdbId,
        title: meta.title,
        // Floored, so a film added earlier today has waited zero days rather
        // than being rounded up into a day it has not finished. Clamped at 0
        // because a negative can only mean `createdAt` is ahead of `now` --
        // clock skew between the row's writer and this caller -- and `days`
        // is rendered as copy, where "-1 days" reads as a broken recap rather
        // than as the sub-second skew it actually is.
        days: Math.max(
          0,
          Math.floor((now.getTime() - row.createdAt.getTime()) / MS_PER_DAY),
        ),
        runtime: meta.runtime,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    // `tmdbId` breaks the tie, because films added on the same day are common
    // -- one evening's worth of watchlisting shares a date -- and `days` alone
    // would leave their order to the caller's query. Same data, same list.
    .sort((a, b) => b.days - a.days || a.tmdbId - b.tmdbId);

  return { dropped, stillPlanning };
}

/**
 * Assemble the full payload.
 *
 * Every card is computed independently and nullable cards return null rather
 * than throwing, so one thin slice of data cannot fail a whole recap.
 *
 * `now` is a parameter rather than `new Date()` so the whole engine stays pure
 * and the "days in planning" counts are deterministic under test.
 */
export function buildPayload(
  input: AggregationInput,
  now: Date,
): SeriesFinalePayload {
  const { period, episodes, statuses, titles } = input;

  // Resolved once, here at the boundary, and it is the resolved value that
  // every builder below receives. `getTimezoneWeekday` and `getTimezoneHour`
  // resolve internally, but `getTimezoneDateKey` does not -- it hands the zone
  // straight to `Intl.DateTimeFormat`, which throws `RangeError` for a zone no
  // longer in the ICU database. A profile holding a renamed or retired IANA
  // name would therefore fail a whole recap, contradicting this module's own
  // promise that one thin slice of data cannot. Resolving here rather than
  // inside `getTimezoneDateKey` keeps that helper's app-wide behaviour where
  // its own callers decide it, and costs one validation rather than one per
  // formatter call.
  const zone = resolveTimeZone(input.timeZone);

  const finished = countFinished(statuses, period);
  const titlesDropped = countDropped(statuses, period);
  const minutes = input.episodeMinutes.minutes + input.filmMinutes.minutes;

  const rhythm = buildRhythm(episodes, zone);
  const months = buildMonths(episodes, statuses, zone, period);
  const genres = buildGenres(statuses, titles, input.genreNames, period);

  // The period's solo ticks. They reach the payload as `soloTickTotal` and the
  // archetype as `soloTickCount`; `bigDay.soloTickCount` counts one day's, from
  // `buildBigDay`'s own pass -- same name, different denominator, and crossing
  // the two typechecks silently.
  const { solo } = partitionSoloTicks(episodes);

  const completedMetas = statuses
    .filter((row) => row.status === "completed" && isWithin(row.updatedAt, period))
    .map((row) => titles.get(titleKey(row.tmdbId, row.contentType)))
    .filter((meta): meta is TitleMeta => meta !== undefined);

  const collaborativeCount = statuses.filter(
    (row) =>
      row.status === "completed" &&
      isWithin(row.updatedAt, period) &&
      input.collaborativeCompletedKeys.has(titleKey(row.tmdbId, row.contentType)),
  ).length;

  const archetype = classifyArchetype({
    completedTitles: finished.total,
    droppedShows: titlesDropped,
    pausedTitles: statuses.filter(
      (row) => row.status === "paused" && isWithin(row.updatedAt, period),
    ).length,
    weekdayCounts: rhythm.weekdayCounts,
    medianEpisodesPerActiveDayByWeekday: medianEpisodesPerActiveDayByWeekday(
      episodes,
      zone,
    ),
    monthlyEpisodeCounts: months.map((m) => m.episodes),
    soloTickHours: solo.map((row) => getTimezoneHour(row.watchedAt, zone)),
    soloTickWeekdays: solo.map((row) =>
      getTimezoneWeekday(row.watchedAt, zone),
    ),
    soloTickCount: solo.length,
    // Not `genres[0].percent / 100`: that is a share of genre TAGS, rounded
    // for display, and both of those are wrong for a classification threshold.
    // See `topGenreTitleShare`.
    topGenreShare: topGenreTitleShare(completedMetas),
    medianPopularity: median(completedMetas.map((meta) => meta.popularity)),
    collaborativeCompletedShare:
      finished.total === 0 ? 0 : collaborativeCount / finished.total,
    totalEpisodes: episodes.length,
    totalTitles: finished.total,
  });

  return {
    schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
    period: {
      start: period.start.toISOString(),
      end: period.end.toISOString(),
      label: period.label,
    },
    headline: {
      hours: Math.round(minutes / 60),
      minutes,
      episodes: episodes.length,
      titlesCompleted: finished.total,
      titlesDropped,
      unknownRuntimeEpisodes:
        input.episodeMinutes.unknownCount + input.filmMinutes.unknownCount,
      percentile: input.percentile,
    },
    episodes: {
      total: episodes.length,
      perDay: episodesPerDay(episodes.length, period),
    },
    finished,
    topShow: buildTopShow(episodes, titles, input.episodeRuntimeLookup, zone),
    niche: buildNiche(statuses, titles, period),
    genres,
    months,
    soloTickTotal: solo.length,
    bigDay: buildBigDay(episodes, zone, input.episodeRuntimeLookup),
    rhythm: { archetype, ...rhythm },
    shame: buildShame(statuses, titles, episodes, period, now),
    crew: input.crew,
    // Assembled in plan 3, where the peer completed/planning sets are loaded.
    // Empty here is what keeps this engine free of cross-user concerns.
    compare: [],
    thin:
      episodes.length < THIN_YEAR_EPISODES && finished.total < THIN_YEAR_TITLES,
  };
}
