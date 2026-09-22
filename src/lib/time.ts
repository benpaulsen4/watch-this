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
 * Constructing an `Intl.DateTimeFormat` costs ~57us; calling `.format` on an
 * existing one costs ~0.75us. These helpers run once per row, so a recap over
 * 5000 episodes spent ~1.5 seconds building formatters it immediately threw
 * away -- inside a user-facing request, once Series Finale generation moved
 * there.
 *
 * So each kind of formatter is built once per zone and reused. `.format(date)`
 * takes the instant as an argument and keeps no state between calls, so a
 * shared instance is safe.
 *
 * Unbounded on purpose, with no eviction: the key space is IANA zone names
 * (~600 of them) plus whatever stale strings profiles still hold, and a
 * process only ever sees the zones its own users are in. A cache that cannot
 * grow past a few hundred small objects does not need a policy for growing.
 */
const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>();
const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();
const hourFormatters = new Map<string, Intl.DateTimeFormat>();
const resolvedZones = new Map<string, string>();

function cached(
  cache: Map<string, Intl.DateTimeFormat>,
  zone: string,
  build: () => Intl.DateTimeFormat,
): Intl.DateTimeFormat {
  const existing = cache.get(zone);
  if (existing) return existing;

  // Built before it is stored, so a zone `Intl` rejects throws here exactly as
  // it did uncached and nothing is written down. Each helper's own contract
  // around that throw is unchanged.
  const formatter = build();
  cache.set(zone, formatter);
  return formatter;
}

/**
 * Fall back to UTC when a stored IANA zone is missing, stale or renamed.
 * `Intl.DateTimeFormat` throws `RangeError` on an unknown zone, and a bad
 * profile value must never take down an episode update or the activity
 * timeline (LOGIC-12/DATA-10).
 */
export function resolveTimeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return DEFAULT_TIME_ZONE;

  // Memoized alongside the formatters, and for the same reason: this is the
  // per-call cost of `getTimezoneWeekday` and `getTimezoneHour`, so caching
  // only their formatters would leave a formatter construction per row anyway.
  const known = resolvedZones.get(timeZone);
  if (known !== undefined) return known;

  let resolved: string;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    resolved = timeZone;
  } catch {
    resolved = DEFAULT_TIME_ZONE;
  }

  resolvedZones.set(timeZone, resolved);
  return resolved;
}

/**
 * "YYYY-MM-DD" for `date` as observed in `timeZone`.
 *
 * Unlike the two below, this does NOT resolve the zone first: it throws
 * `RangeError` for one `Intl` does not know. Callers that must degrade rather
 * than fail resolve before calling -- `buildPayload` does.
 */
export function getTimezoneDateKey(date: Date, timeZone: string): string {
  return cached(
    dateKeyFormatters,
    timeZone,
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
  ).format(date);
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
  const label = cached(
    weekdayFormatters,
    zone,
    () => new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short" }),
  ).format(date);

  return WEEKDAY_TO_INDEX[label] ?? 0;
}

/** Hour (0-23) of `date` as observed in `timeZone`. */
export function getTimezoneHour(date: Date, timeZone: string): number {
  const zone = resolveTimeZone(timeZone);
  const label = cached(
    hourFormatters,
    zone,
    () =>
      new Intl.DateTimeFormat("en-GB", {
        timeZone: zone,
        hour: "2-digit",
        hour12: false,
      }),
  ).format(date);

  // en-GB with hour12:false yields "24" for midnight in some ICU versions.
  const hour = Number.parseInt(label, 10);
  return hour === 24 ? 0 : hour;
}
