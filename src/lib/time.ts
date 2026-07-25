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
