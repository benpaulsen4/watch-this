import { getTimezoneDateKey, resolveTimeZone } from "@/lib/time";

export interface Period {
  start: Date;
  /** Exclusive. A period is [start, end). */
  end: Date;
  label: string;
}

// Nothing before streaming existed, and nothing far in the future, is a real
// period. Bounds exist so a hand-typed URL segment cannot ask for a scan
// across a thousand years.
//
// `MIN_YEAR` is also the floor for `completedYearsBetween`: an imported watch
// dated to year 100 would otherwise walk the loop down past it, and
// `Date.UTC` maps years 0-99 onto 1900-1999, so year 51 would collide with
// 1951. One constant, so the listing can never offer a year the URL rejects.
export const MIN_YEAR = 1900;
const MAX_YEAR = 2999;

export function calendarYearPeriod(year: number): Period {
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
    label: String(year),
  };
}

/**
 * Every completed calendar year between the user's first activity and now,
 * newest first. The year in progress is excluded -- a recap of a year that has
 * not finished would be frozen mid-flight.
 *
 * The first year is never earlier than `MIN_YEAR`, whatever `firstActivity`
 * says.
 *
 * Completeness and the first year are judged in `timeZone` -- the spec's
 * "every date bucket is computed in the user's timezone" -- but the returned
 * periods keep their canonical UTC bounds; that's the identity used as the DB
 * key, the URL label and the cohort length. Callers that load or aggregate
 * data for a period must localise it first with `localisePeriod`.
 */
export function completedYearsBetween(
  firstActivity: Date,
  now: Date,
  timeZone = "UTC",
): Period[] {
  const zone = resolveTimeZone(timeZone);
  const firstYear = Math.max(
    MIN_YEAR,
    Number.parseInt(getTimezoneDateKey(firstActivity, zone).slice(0, 4), 10),
  );

  const periods: Period[] = [];
  for (let year = now.getUTCFullYear(); year >= firstYear; year -= 1) {
    const localised = localisePeriod(calendarYearPeriod(year), zone);
    if (localised.end <= now) {
      periods.push(calendarYearPeriod(year));
    }
  }

  return periods;
}

/** Parse a URL period segment. Returns null for anything not a plausible year. */
export function parsePeriodLabel(label: string): Period | null {
  if (!/^\d{4}$/.test(label)) return null;

  const year = Number.parseInt(label, 10);
  if (year < MIN_YEAR || year > MAX_YEAR) return null;

  return calendarYearPeriod(year);
}

/**
 * Formatter used to read a zone's wall clock for an instant, memoised per
 * zone like `src/lib/time.ts` does -- this runs on the same per-request path.
 */
const wallClockFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(zone: string): Intl.DateTimeFormat {
  const existing = wallClockFormatters.get(zone);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  wallClockFormatters.set(zone, formatter);
  return formatter;
}

/** The offset (ms) such that `instant - offset` is zone's wall clock read as UTC. */
function offsetMillis(instant: number, zone: string): number {
  const parts = wallClockFormatter(zone).formatToParts(new Date(instant));
  const get = (type: string) =>
    Number.parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );

  return asUtc - instant;
}

/** The UTC instant of local midnight in `zone` on the UTC calendar date of `instant`. */
function localMidnight(instant: Date, zone: string): Date {
  const guess = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
  );

  const firstPass = guess - offsetMillis(guess, zone);
  const secondPass = guess - offsetMillis(firstPass, zone);

  return new Date(secondPass);
}

/**
 * Re-express a period's UTC-midnight bounds as the local midnight bounds in
 * `timeZone`, so loading and aggregation run over the year as the user lived
 * it. The period's identity (DB key, URL label, cohort length) stays the
 * canonical UTC period -- only these localised bounds are used to select rows.
 */
export function localisePeriod(period: Period, timeZone: string): Period {
  const zone = resolveTimeZone(timeZone);

  return {
    start: localMidnight(period.start, zone),
    end: localMidnight(period.end, zone),
    label: period.label,
  };
}
