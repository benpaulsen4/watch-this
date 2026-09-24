/**
 * Pure copy and label helpers shared by the desktop recap and the story.
 *
 * Every sentence here is built only from what the payload actually carries: a
 * clause whose data is null is dropped, never filled with a plausible guess.
 * Index lookups go through helpers that return `string`, so no caller has to
 * reach into an array under `noUncheckedIndexedAccess`.
 */

import type {
  ArchetypeId,
  SeriesFinalePayload,
} from "@/lib/series-finale/types";

import { ARCHETYPE_LABELS } from "./ARCHETYPE_LABELS";

type Payload = SeriesFinalePayload;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Monday first, matching `getTimezoneWeekday` and `rhythm.weekdayCounts`. */
const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

/** Full month name for a 1-based month number; "" out of range. */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

/** Three-letter month label for a 1-based month number. */
export function monthLabel(month: number): string {
  return monthName(month).slice(0, 3);
}

/** One-letter month label, for the story's twelve narrow bars. */
export function monthInitial(month: number): string {
  return monthName(month).slice(0, 1);
}

/** Weekday name for a Monday-first index; "" out of range. */
export function weekdayName(index: number): string {
  return WEEKDAY_NAMES[index] ?? "";
}

export function weekdayInitial(index: number): string {
  return weekdayName(index).slice(0, 1);
}

/** Thousands-grouped, in a fixed locale so the copy reads the same everywhere. */
export function formatCount(value: number): string {
  return value.toLocaleString("en-GB");
}

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
] as const;

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
] as const;

function wordsBelowHundred(value: number): string {
  const small = ONES[value];
  if (small !== undefined) return small;

  const tens = TENS[Math.floor(value / 10)] ?? "";
  const ones = value % 10;
  return ones === 0 ? tens : `${tens}-${ONES[ones] ?? ""}`;
}

/**
 * A whole number in words, for counts that open a sentence ("Six shows marked
 * dropped."). From a thousand up it falls back to digits, which no sentence
 * here reaches: the largest input is a count of days in one year.
 */
export function numberWords(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value >= 1000) {
    return formatCount(value);
  }
  if (value < 100) return wordsBelowHundred(value);

  const hundreds = `${ONES[Math.floor(value / 100)] ?? ""} hundred`;
  const rest = value % 100;
  return rest === 0 ? hundreds : `${hundreds} and ${wordsBelowHundred(rest)}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "1 episode", "1,208 episodes". */
export function pluralise(count: number, noun: string): string {
  return `${formatCount(count)} ${noun}${count === 1 ? "" : "s"}`;
}

/** "A, B and C". */
function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.slice(-1).join("")}`;
}

/** The archetype's display name, with the weekday marathoner's day filled in. */
export function archetypeName(rhythm: {
  archetype: ArchetypeId;
  topWeekday: number | null;
}): string;
export function archetypeName(
  rhythm: Pick<Payload["rhythm"], "archetype" | "topWeekday">,
): string | null;
export function archetypeName(
  rhythm: Pick<Payload["rhythm"], "archetype" | "topWeekday">,
): string | null {
  if (rhythm.archetype === null) return null;

  const weekday =
    rhythm.topWeekday === null ? "" : weekdayName(rhythm.topWeekday);
  return ARCHETYPE_LABELS[rhythm.archetype].name.replace(
    "{weekday}",
    weekday || "Weekday",
  );
}

function percentOf(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

/**
 * What the weekday strip under the archetype shows, in words, saying exactly
 * what `rhythm` measures: weekday counts are episodes, and `lateShare` is the
 * share of episodes ticked one at a time that came from 21:00 -- batch ticks
 * carry no real time of day, so they are not in it.
 */
export function archetypeDetail(
  rhythm: Pick<Payload["rhythm"], "weekdayCounts" | "topWeekday" | "lateShare">,
): string | null {
  const total = rhythm.weekdayCounts.reduce((sum, count) => sum + count, 0);
  const sentences: string[] = [];

  const topCount =
    rhythm.topWeekday === null
      ? undefined
      : rhythm.weekdayCounts[rhythm.topWeekday];
  if (rhythm.topWeekday !== null && topCount !== undefined && total > 0) {
    sentences.push(
      `${percentOf(topCount, total)}% of your episodes landed on a ${weekdayName(rhythm.topWeekday)}.`,
    );
  }

  if (rhythm.lateShare !== null) {
    sentences.push(
      `${percentOf(rhythm.lateShare, 1)}% of the episodes you ticked one at a time came after 21:00.`,
    );
  }

  if (total > 0) {
    const empty = rhythm.weekdayCounts.flatMap((count, index) =>
      count === 0 ? [`${weekdayName(index)}s`] : [],
    );
    if (empty.length > 0) {
      sentences.push(`${joinWithAnd(empty)} had no episodes.`);
    }
  }

  return sentences.length > 0 ? sentences.join(" ") : null;
}

/** The archetype's blurb, then what the weekday strip shows. */
export function archetypeDescription(
  archetype: ArchetypeId,
  rhythm: Pick<Payload["rhythm"], "weekdayCounts" | "topWeekday" | "lateShare">,
): string {
  const detail = archetypeDetail(rhythm);
  const { blurb } = ARCHETYPE_LABELS[archetype];
  return detail ? `${blurb} ${detail}` : blurb;
}

/** "16h 42m", "8h", "42m". */
export function formatHoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Parse a "YYYY-MM-DD" key as a calendar date at UTC midnight. The key is
 * already in the user's zone, so it is read back in UTC and never shifted.
 */
function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const date = new Date(`${key}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Monday-first index for a UTC date (`getUTCDay` is Sunday-first). */
function utcWeekdayIndex(date: Date): number {
  return (date.getUTCDay() + 6) % 7;
}

/** "14 March", or "Saturday 14 March". "" for a malformed key. */
export function formatDateKey(
  key: string,
  options: { weekday?: boolean } = {},
): string {
  const date = parseDateKey(key);
  if (!date) return "";

  const day = `${date.getUTCDate()} ${monthName(date.getUTCMonth() + 1)}`;
  return options.weekday ? `${weekdayName(utcWeekdayIndex(date))} ${day}` : day;
}

/** "2–24 Jan", "28 Jan – 3 Feb", "14 Mar". Keys are in the user's zone. */
export function formatDateRange(startKey: string, endKey: string): string {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);
  if (!start || !end) return "";

  const short = (date: Date) =>
    `${date.getUTCDate()} ${monthLabel(date.getUTCMonth() + 1)}`;

  if (startKey === endKey) return short(start);
  if (
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear()
  ) {
    return `${start.getUTCDate()}–${short(end)}`;
  }
  return `${short(start)} – ${short(end)}`;
}

/**
 * "1 January – 31 December 2026". Every period is a calendar year, so the
 * range comes from the label. The payload's bounds are instants localised to
 * whatever zone the user had when the snapshot froze, and nothing records that
 * zone -- reading them in today's zone could shift either end by a day.
 */
export function periodRange(label: string): string {
  return /^\d{4}$/.test(label) ? `1 January – 31 December ${label}` : "";
}

/** Whole days of screen time, back to back: the hero's and the story's figure. */
function straightDays(minutes: number): number {
  return Math.floor(minutes / (24 * 60));
}

/**
 * Only the top half is told where they rank: "Top 96% of everyone" is not a
 * line anyone wants read back to them.
 */
export function percentileLine(percentile: number | null): string | null {
  if (percentile === null || percentile > 50) return null;
  return `Top ${percentile}% of everyone on WatchThis`;
}

/**
 * The hero's sentence: "1,208 episodes, most often on Sundays, and 31 films.
 * Seventeen straight days of screen, if you had done it all at once." The
 * weekday rides with the episodes because that is what `weekdayCounts`
 * counts; each clause appears only when the payload backs it.
 */
export function heroSentence(input: {
  headline: Pick<Payload["headline"], "episodes" | "minutes">;
  finished: Pick<Payload["finished"], "films">;
  rhythm: Pick<Payload["rhythm"], "topWeekday">;
}): string {
  const { episodes, minutes } = input.headline;
  const { films } = input.finished;
  const { topWeekday } = input.rhythm;

  let counts = "";
  if (episodes > 0) {
    counts = pluralise(episodes, "episode");
    if (topWeekday !== null) {
      counts += `, most often on ${weekdayName(topWeekday)}s`;
      if (films > 0) counts += ",";
    }
  }
  if (films > 0) {
    counts = counts
      ? `${counts} and ${pluralise(films, "film")}`
      : pluralise(films, "film");
  }

  const sentences = counts ? [`${counts}.`] : [];

  const days = straightDays(minutes);
  if (days > 0) {
    sentences.push(
      `${capitalise(numberWords(days))} straight ${days === 1 ? "day" : "days"} of screen, if you had done it all at once.`,
    );
  }

  return sentences.join(" ");
}

/** The day-streak tile's label: "Day streak, 2–24 Jan". */
export function streakLabel(
  streak: NonNullable<Payload["bigDay"]>["streak"],
): string {
  if (!streak) return "Day streak";
  return `Day streak, ${formatDateRange(streak.start, streak.end)}`;
}

/** "Saturday 14 March · 11 episodes · 8h 20m". */
export function bigDayLine(
  bigDay: Pick<NonNullable<Payload["bigDay"]>, "date" | "episodes" | "minutes">,
): string {
  return [
    formatDateKey(bigDay.date, { weekday: true }),
    pluralise(bigDay.episodes, "episode"),
    bigDay.minutes > 0 ? formatHoursMinutes(bigDay.minutes) : null,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

function droppedIntro(count: number, namesEpisodes: boolean): string {
  const shows = `${capitalise(numberWords(count))} ${count === 1 ? "show" : "shows"} marked dropped.`;
  if (!namesEpisodes) return shows;
  return count === 1
    ? `${shows} This episode was what tipped you over the edge.`
    : `${shows} These episodes were what tipped you over the edge.`;
}

/**
 * The abandonment panel's opening line: the dropped shows when there are any
 * ("Six shows marked dropped. These episodes were what tipped you over the
 * edge." -- the second sentence only when a show names its episode), otherwise
 * the waiting films, never "0 shows". Null when there is nothing to say.
 */
export function shameIntro(
  shame: Pick<Payload["shame"], "dropped" | "stillPlanning">,
): string | null {
  const { dropped, stillPlanning } = shame;
  if (dropped.length > 0) {
    return droppedIntro(
      dropped.length,
      dropped.some((show) => show.lastEpisode !== null),
    );
  }
  if (stillPlanning.length > 0) {
    return "Nothing dropped this year. These films, on the other hand, are still waiting.";
  }
  return null;
}

/** Between the dropped shows and the waiting films, when there are both. */
export const SHAME_PLANNING_LINK =
  "And even after giving up on those, you still didn't find time for these.";

/**
 * Why the biggest day has no timeline: the whole period's solo ticks fell
 * below `SOLO_TICK_FLOOR`. Quotes `soloTickTotal`, the number actually
 * compared against the floor -- not the day's own count.
 */
export function soloTickDisclosure(soloTickTotal: number): string {
  if (soloTickTotal === 0) {
    return "No episodes this year were ticked one at a time, so there is nothing to put on a clock.";
  }
  return `Only ${pluralise(soloTickTotal, "episode")} this year ${soloTickTotal === 1 ? "was" : "were"} ticked one at a time — too few to put on a clock.`;
}

/** "an" for the percentages read aloud with a vowel: 8, 11, 18, 80-89. */
function articleFor(percent: number): "A" | "An" {
  return percent === 8 ||
    percent === 11 ||
    percent === 18 ||
    (percent >= 80 && percent <= 89)
    ? "An"
    : "A";
}

/** "34 titles in common out of 124. A 27% overlap." */
export function overlapLine(
  peer: Pick<Payload["compare"][number], "onlyYou" | "both" | "onlyThem">,
): string | null {
  const total = peer.onlyYou + peer.both + peer.onlyThem;
  if (total === 0) return null;

  const percent = percentOf(peer.both, total);
  return `${pluralise(peer.both, "title")} in common out of ${formatCount(total)}. ${articleFor(percent)} ${percent}% overlap.`;
}

/** The films the niche pick is compared against: how many, and their median. */
function nicheOthers(
  niche: Pick<
    NonNullable<Payload["niche"]>,
    "medianPopularity" | "filmPopularities"
  >,
): { count: number; median: number } {
  return {
    count: niche.filmPopularities.length - 1,
    median: Math.round(niche.medianPopularity),
  };
}

/** The niche film's comparison line, against the other films finished. */
export function nicheLine(
  niche: Pick<
    NonNullable<Payload["niche"]>,
    "medianPopularity" | "filmPopularities"
  >,
): string {
  const others = nicheOthers(niche);

  if (others.count <= 0) return "The only film you finished";
  if (others.count === 1) {
    return `Your most obscure watch — your other film was at ${others.median}`;
  }
  return `Your most obscure watch — median for your other ${formatCount(others.count)} films was ${others.median}`;
}

/**
 * The story's niche card: the same comparison as `nicheLine`, led by the
 * film's own score. "TMDB popularity 2.1, against a median of 68 for the
 * other 30 films you finished."
 */
export function nicheComparison(
  niche: Pick<
    NonNullable<Payload["niche"]>,
    "popularity" | "medianPopularity" | "filmPopularities"
  >,
): string {
  const own = `TMDB popularity ${niche.popularity.toFixed(1)}`;
  const others = nicheOthers(niche);

  if (others.count <= 0) return `${own}. The only film you finished.`;
  if (others.count === 1) {
    return `${own}, against ${others.median} for the other film you finished.`;
  }
  return `${own}, against a median of ${others.median} for the other ${formatCount(others.count)} films you finished.`;
}

/** "Most famous: Dune: Part Two, popularity 412". */
export function mostFamousLine(
  mostPopular: Pick<
    NonNullable<NonNullable<Payload["niche"]>["mostPopular"]>,
    "title" | "popularity"
  >,
): string {
  return `Most famous: ${mostPopular.title}, popularity ${Math.round(mostPopular.popularity)}`;
}

/** The busiest month, the earlier on a tie; null when nothing was logged. */
export function peakMonth(
  months: Payload["months"],
): Payload["months"][number] | null {
  let peak: Payload["months"][number] | null = null;
  for (const month of months) {
    if (month.episodes > 0 && (!peak || month.episodes > peak.episodes)) {
      peak = month;
    }
  }
  return peak;
}

/** "Also number one for ana and marcus." -- crew data, recap and story only. */
export function alsoTopForLine(usernames: string[]): string | null {
  if (usernames.length === 0) return null;
  return `Also number one for ${joinWithAnd(usernames)}.`;
}

/**
 * The story's follow-up to `alsoTopForLine`: everyone sharing the top show,
 * counting the viewer -- "You two" for one other person, "You four" for three.
 */
export function newMaterialLine(othersCount: number): string | null {
  if (othersCount <= 0) return null;
  return `You ${numberWords(othersCount + 1)} need new material.`;
}

/** "38 episodes · 16h 42m", the time left out when no runtime is known. */
export function topShowStats(
  topShow: Pick<NonNullable<Payload["topShow"]>, "episodes" | "minutes">,
): string {
  const episodes = pluralise(topShow.episodes, "episode");
  return topShow.minutes > 0
    ? `${episodes} · ${formatHoursMinutes(topShow.minutes)}`
    : episodes;
}

/**
 * Where each of the biggest day's solo ticks falls between the first and the
 * last, as 0-100, and the minutes between them. Elapsed time is the same in
 * every zone, so this needs no clock -- the timeline's instants carry none.
 * Null when the ticks span no time at all: one tick, or a batch sharing one
 * instant, is not a session.
 */
export function timelineSpread(
  ats: string[],
): { offsets: number[]; minutes: number } | null {
  const times = ats
    .map((at) => new Date(at).getTime())
    .filter((time) => !Number.isNaN(time));
  if (times.length < 2) return null;

  const first = Math.min(...times);
  const span = Math.max(...times) - first;
  if (span <= 0) return null;

  return {
    offsets: times.map((time) => Math.round(((time - first) / span) * 100)),
    minutes: Math.round(span / 60_000),
  };
}

/** "8 of these were ticked one at a time, 9h 40m from first to last." */
export function timelineLine(soloTicks: number, minutes: number): string {
  const ticked = `${formatCount(soloTicks)} of these ${soloTicks === 1 ? "was" : "were"} ticked one at a time`;
  return minutes > 0
    ? `${ticked}, ${formatHoursMinutes(minutes)} from first to last.`
    : `${ticked}.`;
}

/** When a non-null timeline still holds too few points to place on a line. */
export const TIMELINE_TOO_FEW =
  "Too few of these were ticked one at a time to say how the day went.";

/** "Excludes 3 episodes with no runtime on TMDB", or null when none. */
export function unknownRuntimeNote(count: number): string | null {
  if (count <= 0) return null;
  return `Excludes ${pluralise(count, "episode")} with no runtime on TMDB`;
}

// ---------------------------------------------------------------------------
// The story's own sentences
// ---------------------------------------------------------------------------

/** A working day and a working month: four 40-hour weeks. */
const WORKING_DAY_HOURS = 8;
const WORKING_MONTH_HOURS = 160;

/**
 * The hours as a job: to the nearest half working month from three weeks of
 * work (120 hours) up, otherwise to the nearest working day. Null under half
 * a working day.
 */
function workingTime(hours: number): string | null {
  if (hours >= 0.75 * WORKING_MONTH_HOURS) {
    const halves = Math.round((hours / WORKING_MONTH_HOURS) * 2);
    const whole = Math.floor(halves / 2);
    if (halves % 2 === 1) {
      return `${numberWords(whole)} and a half working months`;
    }
    return whole === 1
      ? "one full working month"
      : `${numberWords(whole)} full working months`;
  }

  const days = Math.round(hours / WORKING_DAY_HOURS);
  if (days === 0) return null;
  return days === 1 ? "one working day" : `${numberWords(days)} working days`;
}

/**
 * The line under the story's hours figure: "in front of something. That is
 * 17 straight days, or roughly two and a half working months if you had a job
 * doing this." Built from minutes, so the conversions are not compounded from
 * a rounded hours figure.
 */
export function hoursLine(minutes: number): string {
  const days = straightDays(minutes);
  const work = workingTime(minutes / 60);

  if (days > 0 && work) {
    return `in front of something. That is ${formatCount(days)} straight ${days === 1 ? "day" : "days"}, or roughly ${work} if you had a job doing this.`;
  }
  if (work) {
    return `in front of something. That is roughly ${work}, if you had a job doing this.`;
  }
  return "in front of something.";
}

/**
 * The average rate over the whole period -- never "every day": plenty of
 * episodes are batch-ticked, and plenty of days have none.
 */
export function episodesPerDayLine(perDay: number): string | null {
  if (perDay <= 0) return null;
  if (perDay < 1) {
    return `About one every ${Math.round(1 / perDay)} days, on average.`;
  }
  return `${perDay.toFixed(1)} a day, on average.`;
}

/** The quietest month, the earlier on a tie; null for an empty list. */
export function quietestMonth(
  months: Payload["months"],
): Payload["months"][number] | null {
  let quietest: Payload["months"][number] | null = null;
  for (const month of months) {
    if (!quietest || month.episodes < quietest.episodes) quietest = month;
  }
  return quietest;
}

/** A month is "not so much" at a quarter of the peak or less. */
const QUIET_MONTH_SHARE = 0.25;

/**
 * The months card's headline, by a fixed rule on the counts:
 * - months with nothing in them are named ("July did not", or "Four months
 *   did not" for several);
 * - otherwise a quietest month at a quarter of the peak or less is "not so
 *   much";
 * - otherwise the year was steady.
 * Null when nothing was logged at all.
 */
export function monthsHeadline(months: Payload["months"]): string | null {
  const peak = peakMonth(months);
  const quietest = quietestMonth(months);
  if (!peak || !quietest) return null;

  const happened = `${monthName(peak.month)} happened.`;
  const empty = months.filter((month) => month.episodes === 0);

  if (empty.length > 1) {
    return `${happened} ${capitalise(numberWords(empty.length))} months did not.`;
  }
  if (empty.length === 1) {
    return `${happened} ${monthName(quietest.month)} did not.`;
  }
  if (quietest.episodes <= peak.episodes * QUIET_MONTH_SHARE) {
    return `${happened} ${monthName(quietest.month)}, not so much.`;
  }
  return `A steady year, peaking in ${monthName(peak.month)}.`;
}

/** "Saturday" for "2026-03-14"; "" for a malformed key. */
export function dateKeyWeekday(key: string): string {
  const date = parseDateKey(key);
  return date ? weekdayName(utcWeekdayIndex(date)) : "";
}

/** "Eleven episodes in one day, 8h 20m of screen." */
export function bigDaySentence(
  bigDay: Pick<NonNullable<Payload["bigDay"]>, "episodes" | "minutes">,
): string {
  const episodes = `${capitalise(numberWords(bigDay.episodes))} ${bigDay.episodes === 1 ? "episode" : "episodes"} in one day`;
  return bigDay.minutes > 0
    ? `${episodes}, ${formatHoursMinutes(bigDay.minutes)} of screen.`
    : `${episodes}.`;
}

/** "Longest streak: 23 days, 2–24 Jan". */
export function streakLine(
  streak: NonNullable<NonNullable<Payload["bigDay"]>["streak"]>,
): string {
  return `Longest streak: ${pluralise(streak.days, "day")}, ${formatDateRange(streak.start, streak.end)}`;
}

/** "Blade Runner 2049, for 1,104 days. It is 164 minutes long." */
export function planningLine(
  film: Pick<
    Payload["shame"]["stillPlanning"][number],
    "title" | "days" | "runtime"
  >,
): string {
  const waited = `${film.title}, for ${pluralise(film.days, "day")}.`;
  return film.runtime
    ? `${waited} It is ${pluralise(film.runtime, "minute")} long.`
    : waited;
}

/** The waiting films behind the one the story names. */
export function planningMoreLine(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "One more is waiting behind it."
    : `${capitalise(numberWords(count))} more are waiting behind it.`;
}

/** "And four more." -- what a capped list left out. */
export function andMore(count: number): string | null {
  if (count <= 0) return null;
  return `And ${numberWords(count)} more.`;
}

/**
 * The crew card's headline, counting everyone with fewer EPISODES than the
 * viewer (`headline.episodes`) -- the number the ranking shows. A tie is not
 * out-watching. Null without a crew.
 */
export function crewHeadline(
  viewerEpisodes: number,
  crew: Pick<Payload["crew"][number], "episodes">[],
): string | null {
  if (crew.length === 0) return null;

  const beaten = crew.filter((member) => member.episodes < viewerEpisodes)
    .length;
  if (beaten === 0) return "You out-watched nobody. It is not a race.";
  if (beaten === crew.length) {
    return beaten === 1
      ? "You out-watched one person who was also trying"
      : `You out-watched ${numberWords(beaten)} people who were also trying`;
  }
  return `You out-watched ${numberWords(beaten)} of the ${numberWords(crew.length)} people who were also trying`;
}

/**
 * The compare card's headline, from the share of titles in common -- the
 * same share `overlapLine` states: under 20% is almost none, under 50% is
 * some, and half or more is mostly. Everyone compared shares a list with you.
 */
export function compareHeadline(
  peer: Pick<Payload["compare"][number], "onlyYou" | "both" | "onlyThem">,
): string | null {
  const total = peer.onlyYou + peer.both + peer.onlyThem;
  if (total === 0) return null;

  const share = peer.both / total;
  if (share >= 0.5) return "A shared list, and mostly shared taste";
  if (share >= 0.2) return "A shared list, and some shared taste";
  return "A shared list, and almost no shared taste";
}
