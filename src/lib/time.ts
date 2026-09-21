/**
 * Timezone helpers shared by every path that has to reason about the calendar
 * day a user actually experienced.
 *
 * These lived as byte-identical copies in `src/lib/activity/service.ts` and
 * `src/lib/episodes/episodeUtils.ts`. Two copies of the "degrade to UTC" rule
 * is two places for it to drift, so they live here instead.
 */

export const DEFAULT_TIME_ZONE = "UTC";

/**
 * Fall back to UTC when a stored IANA zone is missing, stale or renamed.
 * `Intl.DateTimeFormat` throws `RangeError` on an unknown zone, and a bad
 * profile value must never take down an episode update or the activity
 * timeline (LOGIC-12/DATA-10).
 */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/** "YYYY-MM-DD" for `date` as observed in `timeZone`. */
export function getTimezoneDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const WEEKDAY_TO_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/**
 * Weekday of `date` as observed in `timeZone`, **Monday-first 0-6**.
 *
 * Monday-first because every weekday chart in Series Finale reads M T W T F S S.
 * Note this differs from `show_schedules.dayOfWeek`, which is Sunday-first --
 * the two must never be compared without conversion.
 */
export function getTimezoneWeekday(date: Date, timeZone: string): number {
  const zone = resolveTimeZone(timeZone);
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
  }).format(date);

  return WEEKDAY_TO_INDEX[label] ?? 0;
}

/** Hour (0-23) of `date` as observed in `timeZone`. */
export function getTimezoneHour(date: Date, timeZone: string): number {
  const zone = resolveTimeZone(timeZone);
  const label = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hour: "2-digit",
    hour12: false,
  }).format(date);

  // en-GB with hour12:false yields "24" for midnight in some ICU versions.
  const hour = Number.parseInt(label, 10);
  return hour === 24 ? 0 : hour;
}
