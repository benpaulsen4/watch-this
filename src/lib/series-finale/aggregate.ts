import { getTimezoneDateKey } from "../time";
import type { ContentStatusRow, WatchedEpisodeRow } from "./types";

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
 */
export function buildMonths(
  episodes: WatchedEpisodeRow[],
  statuses: ContentStatusRow[],
  timeZone: string,
  periodStartYear: number,
): { month: number; episodes: number }[] {
  const buckets = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    episodes: 0,
  }));

  const add = (at: Date) => {
    const key = getTimezoneDateKey(at, timeZone);
    // Destructured with defaults rather than indexed: under
    // `noUncheckedIndexedAccess` a split part is `string | undefined`, and the
    // empty defaults parse to NaN, which fails the year check and drops the
    // row. That is the right outcome for a date key this helper could not
    // read -- silently charging it to month NaN would corrupt a bucket.
    const [year = "", month = ""] = key.split("-");
    if (Number.parseInt(year, 10) !== periodStartYear) return;

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
