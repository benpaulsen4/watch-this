// Turns a declarative PersonaSpec into watch-history rows. Pure and
// deterministic: every draw comes from a PRNG seeded by (username, year), so
// the same cast always produces the same database.
//
// How a year is laid out, in the persona's own zone:
// - Fixed days first: the big day (all solo ticks, 13:00-23:30), one solo tick
//   on each streak day with the day either side left empty, and the zone-edge
//   extras at their exact local times.
// - The rest ("free" episodes) are split across weekdays by `weekdayWeights`.
//   Every weekday gets about the same number of active dates, so a heavy
//   weekday means bigger sittings rather than more of them -- which is what
//   makes a Sunday-heavy persona a Sunday marathoner, not a daily one.
// - Each free day is split into solo ticks and batches of 2-6 rows sharing one
//   timestamp, steering towards `soloShare`; solo ticks are then marked late
//   (21:00+) or not to hit `lateShareOfSolo` across the whole year.
// - 31 December never gets free episodes, film completions or show outcomes, so
//   a UTC persona's year holds the same rows whether it is read in UTC or in a
//   Brisbane viewer's window (crew counts use the viewer's window).
// - Episodes are dealt to the slots in time order, each show walking its real
//   seasons from the catalogue, so every (season, episode) exists on TMDB and
//   none repeats across years.
import type { CatalogueEntry } from "./catalogue";
import type { PersonaSpec, YearSpec } from "./personas";
import { mulberry32, seedFrom } from "./prng";

export interface EpisodeRow {
  tmdbId: number;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: Date;
}

export interface StatusRow {
  tmdbId: number;
  contentType: "tv" | "movie";
  status: "planning" | "watching" | "completed" | "dropped";
  createdAt: Date;
  updatedAt: Date;
}

export interface GeneratedRows {
  episodes: EpisodeRow[];
  statuses: StatusRow[];
}

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
const ZONE_OFFSET_MINUTES: Record<PersonaSpec["timezone"], number> = { UTC: 0, "Australia/Brisbane": 600 };

const BIG_DAY_FIRST_MINUTE = 13 * 60;
const BIG_DAY_LAST_MINUTE = 23 * 60 + 30;
const LATE_FIRST_MINUTE = 21 * 60;
const DAY_FIRST_MINUTE = 8 * 60;
const DAY_LAST_MINUTE = 24 * 60 - 1;
const FILM_FIRST_MINUTE = 19 * 60;
const FILM_LAST_MINUTE = 22 * 60 + 59;
const MAX_BATCH = 6;

type Rng = () => number;

const randomInt = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));

function shuffled<T>(rng: Rng, items: T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(rng, 0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const dayNumber = (dateKey: string) => Date.parse(`${dateKey}T00:00:00Z`) / DAY_MS;
const dateKeyOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);
const addDays = (dateKey: string, days: number) => dateKeyOf(dayNumber(dateKey) + days);
/** 0 = Sunday, matching `weekdayWeights`. */
const weekdayOf = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`).getUTCDay();

/** Local wall-clock time in the persona's zone, as a UTC instant. */
function localInstant(offsetMinutes: number, dateKey: string, minuteOfDay: number, second = 0): Date {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + (minuteOfDay - offsetMinutes) * MINUTE_MS + second * 1000);
}

function parseLocalDateTime(value: string): { dateKey: string; minute: number } {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`localDateTime must be YYYY-MM-DDTHH:MM, got "${value}"`);
  return { dateKey: match[1]!, minute: Number(match[2]) * 60 + Number(match[3]) };
}

/** Distributes `total` over `weights` by largest remainder, so the parts sum exactly. */
function apportion(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new Error("weekdayWeights must have a positive total");
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  const order = exact.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  let left = total - parts.reduce((a, b) => a + b, 0);
  for (const [, i] of order) {
    if (left === 0) break;
    parts[i] = (parts[i] ?? 0) + 1;
    left -= 1;
  }
  return parts;
}

/** Batch sizes of 2-6 summing to `total` (never 1). */
function batchSizes(rng: Rng, total: number): number[] {
  if (total === 1) throw new Error("cannot batch a single episode");
  const sizes: number[] = [];
  let left = total;
  while (left > 0) {
    if (left <= MAX_BATCH) {
      sizes.push(left);
      break;
    }
    let size = randomInt(rng, 2, MAX_BATCH);
    if (left - size === 1) size = size === MAX_BATCH ? size - 1 : size + 1;
    sizes.push(size);
    left -= size;
  }
  return sizes;
}

function pickMinute(rng: Rng, used: Set<number>, lo: number, hi: number): number {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const minute = randomInt(rng, lo, hi);
    if (!used.has(minute)) {
      used.add(minute);
      return minute;
    }
  }
  throw new Error(`no free minute left between ${lo} and ${hi}`);
}

/** One timestamp: a solo tick (size 1) or a batch sharing it. */
interface Slot {
  at: Date;
  size: number;
}

interface ExtraRow {
  key: string;
  season: number;
  episode: number;
  at: Date;
}

/** The slots one YearSpec produces, before episodes are dealt into them. */
function layOutYear(persona: PersonaSpec, year: number, spec: YearSpec, rng: Rng): { slots: Slot[]; extras: ExtraRow[] } {
  const where = `${persona.username} ${year}`;
  const offset = ZONE_OFFSET_MINUTES[persona.timezone];
  const firstDay = `${year}-01-01`;
  const lastDay = `${year}-12-31`;
  const inYear = (dateKey: string) => dateKey >= firstDay && dateKey <= lastDay;

  const sequential = spec.shows.reduce((sum, show) => sum + show.episodes, 0);
  const extras = (spec.extraEpisodes ?? []).map((extra) => {
    const { dateKey, minute } = parseLocalDateTime(extra.localDateTime);
    return { ...extra, minute, at: localInstant(offset, dateKey, minute) };
  });
  const bigDay = spec.bigDay;
  const streak = spec.streak;
  if (bigDay && !inYear(bigDay.date)) throw new Error(`${where}: big day ${bigDay.date} is outside the year`);
  const streakDays = streak ? Array.from({ length: streak.days }, (_, i) => addDays(streak.start, i)) : [];
  if (streakDays.some((day) => !inYear(day))) throw new Error(`${where}: streak leaves the year`);

  // Solo ticks the fixed days already spend, and what is left for free days.
  const soloTarget = Math.round((sequential + extras.length) * spec.soloShare);
  const fixedSolo = (bigDay?.episodes ?? 0) + streakDays.length + extras.length;
  const freeEpisodes = sequential - (bigDay?.episodes ?? 0) - streakDays.length;
  if (freeEpisodes < 0) throw new Error(`${where}: the big day and streak need more episodes than the shows provide`);
  let soloLeft = soloTarget - fixedSolo;
  if (soloLeft < 0) throw new Error(`${where}: soloShare ${spec.soloShare} is below the solo ticks the big day, streak and extras need`);

  // Free days: from the account's creation to 30 December, minus the fixed
  // days and the empty days either side of the streak.
  const reserved = new Set([
    ...(bigDay ? [bigDay.date] : []),
    ...streakDays,
    ...(streak ? [addDays(streak.start, -1), addDays(streak.start, streak.days)] : []),
  ]);
  const start = persona.createdAt > firstDay ? persona.createdAt : firstDay;
  const eligibleByWeekday: string[][] = Array.from({ length: 7 }, () => []);
  for (let day = dayNumber(start); day < dayNumber(lastDay); day += 1) {
    const key = dateKeyOf(day);
    if (!reserved.has(key)) eligibleByWeekday[weekdayOf(key)]!.push(key);
  }

  // Apportioned in pairs, so no weekday is left holding a lone episode that
  // could only ever be a solo tick; an odd one out joins the heaviest weekday.
  const perWeekday = apportion(Math.floor(freeEpisodes / 2), spec.weekdayWeights).map((pairs) => pairs * 2);
  if (freeEpisodes % 2 === 1) {
    const heaviest = spec.weekdayWeights.indexOf(Math.max(...spec.weekdayWeights));
    perWeekday[heaviest] = (perWeekday[heaviest] ?? 0) + 1;
  }
  const activeDaysPerWeekday = Math.ceil(freeEpisodes / 14);
  const freeDays: { date: string; count: number }[] = [];
  perWeekday.forEach((episodes, weekday) => {
    if (episodes === 0) return;
    const eligible = eligibleByWeekday[weekday]!;
    const active = Math.min(eligible.length, Math.max(1, Math.min(activeDaysPerWeekday, Math.floor(episodes / 2))));
    if (active === 0) throw new Error(`${where}: weekday ${weekday} has episodes but no eligible dates`);
    shuffled(rng, eligible)
      .slice(0, active)
      .forEach((date, i) => {
        freeDays.push({ date, count: Math.floor(episodes / active) + (i < episodes % active ? 1 : 0) });
      });
  });
  if (bigDay && freeDays.some((day) => day.count >= bigDay.episodes)) {
    throw new Error(`${where}: an ordinary day would match the big day; lower the weights' peak or raise the big day`);
  }

  // Split each free day into solo ticks and batches, steering towards soloShare.
  let freeLeft = freeEpisodes;
  const days: { date: string; solo: number; batches: number[] }[] = [];
  for (const day of shuffled(rng, freeDays)) {
    let solo = freeLeft > 0 ? Math.round((day.count * soloLeft) / freeLeft) : 0;
    solo = Math.max(0, Math.min(solo, day.count, soloLeft));
    // A batch of one is a solo tick in disguise; move one row either way.
    if (day.count - solo === 1) solo = solo + 1 <= soloLeft ? solo + 1 : solo - 1;
    if (solo < 0) throw new Error(`${where}: a day with one episode must be a solo tick, but soloShare leaves none`);
    days.push({ date: day.date, solo, batches: batchSizes(rng, day.count - solo) });
    soloLeft -= solo;
    freeLeft -= day.count;
  }
  for (const date of streakDays) days.push({ date, solo: 1, batches: [] });

  // Late solo ticks: the year's target, less those the fixed times already give.
  const bigDayMinutes = bigDay
    ? Array.from({ length: bigDay.episodes }, (_, i) =>
        bigDay.episodes === 1
          ? BIG_DAY_FIRST_MINUTE
          : Math.round(BIG_DAY_FIRST_MINUTE + (i * (BIG_DAY_LAST_MINUTE - BIG_DAY_FIRST_MINUTE)) / (bigDay.episodes - 1)),
      )
    : [];
  const freeSolo = days.reduce((sum, day) => sum + day.solo, 0);
  const allSolo = freeSolo + bigDayMinutes.length + extras.length;
  const fixedLate = [...bigDayMinutes, ...extras.map((extra) => extra.minute)].filter((m) => m >= LATE_FIRST_MINUTE).length;
  const lateTarget = Math.round(allSolo * spec.lateShareOfSolo);
  const freeLate = Math.max(0, Math.min(freeSolo, lateTarget - fixedLate));
  const lateFlags = shuffled(
    rng,
    Array.from({ length: freeSolo }, (_, i) => i < freeLate),
  );

  const slots: Slot[] = bigDay
    ? bigDayMinutes.map((minute) => ({ at: localInstant(offset, bigDay.date, minute), size: 1 }))
    : [];
  let flag = 0;
  for (const day of days) {
    const used = new Set<number>();
    for (let i = 0; i < day.solo; i += 1) {
      const late = lateFlags[flag++] ?? false;
      const minute = late
        ? pickMinute(rng, used, LATE_FIRST_MINUTE, DAY_LAST_MINUTE)
        : pickMinute(rng, used, DAY_FIRST_MINUTE, LATE_FIRST_MINUTE - 1);
      slots.push({ at: localInstant(offset, day.date, minute, randomInt(rng, 0, 59)), size: 1 });
    }
    for (const size of day.batches) {
      const minute = pickMinute(rng, used, DAY_FIRST_MINUTE, DAY_LAST_MINUTE);
      slots.push({ at: localInstant(offset, day.date, minute, randomInt(rng, 0, 59)), size });
    }
  }

  return { slots, extras: extras.map(({ key, season, episode, at }) => ({ key, season, episode, at })) };
}

function entryFor(catalogue: Map<string, CatalogueEntry>, key: string, type: "tv" | "movie" | undefined, where: string): CatalogueEntry {
  const entry = catalogue.get(key);
  if (!entry) throw new Error(`${where}: "${key}" is not in the catalogue`);
  if (type && entry.type !== type) throw new Error(`${where}: "${key}" is a ${entry.type}, not a ${type}`);
  return entry;
}

export function generate(persona: PersonaSpec, catalogue: Map<string, CatalogueEntry>): GeneratedRows {
  const offset = ZONE_OFFSET_MINUTES[persona.timezone];
  const years = Object.keys(persona.years)
    .map(Number)
    .sort((a, b) => a - b);

  // Zone-edge episodes are claimed up front, so a show's sequential walk skips
  // them whichever year reaches that point first.
  const claimed = new Set<string>();
  for (const year of years) {
    for (const extra of persona.years[year]!.extraEpisodes ?? []) {
      const entry = entryFor(catalogue, extra.key, "tv", `${persona.username} ${year}`);
      const season = entry.seasons?.find((s) => s.season === extra.season);
      if (!season || extra.episode < 1 || extra.episode > season.episodes) {
        throw new Error(`${persona.username}: ${extra.key} S${extra.season}E${extra.episode} has not aired`);
      }
      claimed.add(`${extra.key}:${extra.season}:${extra.episode}`);
    }
  }

  const cursors = new Map<string, { season: number; episode: number }[]>();
  const nextEpisode = (key: string, where: string) => {
    let queue = cursors.get(key);
    if (!queue) {
      const entry = entryFor(catalogue, key, "tv", where);
      queue = (entry.seasons ?? []).flatMap((s) =>
        Array.from({ length: s.episodes }, (_, i) => ({ season: s.season, episode: i + 1 })).filter(
          (e) => !claimed.has(`${key}:${e.season}:${e.episode}`),
        ),
      );
      cursors.set(key, queue);
    }
    const next = queue.shift();
    if (!next) throw new Error(`${where}: asks for more episodes of "${key}" than have aired`);
    return next;
  };

  const episodes: (EpisodeRow & { key: string; year: number })[] = [];
  const statuses: (StatusRow & { key: string })[] = [];
  const createdAtMidnight = localInstant(offset, persona.createdAt, 0);
  const showOutcome = new Map<string, { year: number; outcome: StatusRow["status"]; outcomeOn?: string }>();

  for (const year of years) {
    const spec = persona.years[year]!;
    const where = `${persona.username} ${year}`;
    const rng = mulberry32(seedFrom(persona.username, year));
    const { slots, extras } = layOutYear(persona, year, spec, rng);

    // Deal the year's show episodes into the slots in time order.
    const deck = shuffled(
      rng,
      spec.shows.flatMap((show) => {
        entryFor(catalogue, show.key, "tv", where);
        return Array.from({ length: show.episodes }, () => show.key);
      }),
    );
    let dealt = 0;
    for (const slot of slots.sort((a, b) => a.at.getTime() - b.at.getTime())) {
      for (let i = 0; i < slot.size; i += 1) {
        const key = deck[dealt++]!;
        const { season, episode } = nextEpisode(key, where);
        const tmdbId = catalogue.get(key)!.tmdbId;
        episodes.push({ key, year, tmdbId, seasonNumber: season, episodeNumber: episode, watchedAt: slot.at });
      }
    }
    for (const extra of extras) {
      const tmdbId = catalogue.get(extra.key)!.tmdbId;
      episodes.push({ key: extra.key, year, tmdbId, seasonNumber: extra.season, episodeNumber: extra.episode, watchedAt: extra.at });
    }

    for (const show of spec.shows) {
      showOutcome.set(show.key, { year, outcome: show.outcome ?? "watching", outcomeOn: show.outcomeOn });
    }

    // Films: completed or dropped on `on`, else on a seeded evening of the year.
    const filmDays: string[] = [];
    const firstFilmDay = persona.createdAt > `${year}-01-01` ? persona.createdAt : `${year}-01-01`;
    for (let day = dayNumber(firstFilmDay); day < dayNumber(`${year}-12-31`); day += 1) filmDays.push(dateKeyOf(day));
    for (const film of spec.films) {
      const entry = entryFor(catalogue, film.key, "movie", where);
      // The type already says so; this catches a spec built from untyped data.
      if (film.outcome !== "completed") throw new Error(`${where}: film "${film.key}" can only be completed, not ${String(film.outcome)}`);
      const date = film.on ?? filmDays[randomInt(rng, 0, filmDays.length - 1)]!;
      const updatedAt = localInstant(offset, date, randomInt(rng, FILM_FIRST_MINUTE, FILM_LAST_MINUTE));
      const addedAt = new Date(updatedAt.getTime() - randomInt(rng, 1, 60) * DAY_MS);
      statuses.push({
        key: film.key,
        tmdbId: entry.tmdbId,
        contentType: "movie",
        status: film.outcome,
        createdAt: addedAt < createdAtMidnight ? createdAtMidnight : addedAt,
        updatedAt,
      });
    }
  }

  // One status per show, from the last year that lists it: dated on
  // `outcomeOn`, else by that year's last episode; created at its first episode.
  for (const [key, { year, outcome, outcomeOn }] of showOutcome) {
    const where = `${persona.username} ${year}`;
    const watched = episodes.filter((row) => row.key === key);
    const thatYear = watched.filter((row) => row.year === year && row.watchedAt < localInstant(offset, `${year + 1}-01-01`, 0));
    const last = Math.max(...thatYear.map((row) => row.watchedAt.getTime()));
    if (!outcomeOn && thatYear.length === 0) throw new Error(`${where}: "${key}" has no episodes that year, so it needs outcomeOn`);
    const updatedAt = outcomeOn ? localInstant(offset, outcomeOn, 12 * 60) : new Date(last);
    const first = Math.min(...watched.map((row) => row.watchedAt.getTime()), updatedAt.getTime());
    statuses.push({ key, tmdbId: catalogue.get(key)!.tmdbId, contentType: "tv", status: outcome, createdAt: new Date(first), updatedAt });
  }

  for (const plan of persona.planning ?? []) {
    const entry = entryFor(catalogue, plan.key, undefined, persona.username);
    const addedAt = localInstant(offset, plan.addedOn, 0);
    statuses.push({ key: plan.key, tmdbId: entry.tmdbId, contentType: entry.type, status: "planning", createdAt: addedAt, updatedAt: addedAt });
  }

  const seen = new Set<string>();
  for (const status of statuses) {
    if (seen.has(status.key)) throw new Error(`${persona.username}: "${status.key}" has more than one status`);
    seen.add(status.key);
  }

  // Every slot must be its own instant: two solo ticks sharing one would read
  // as a batch, and a batch merging with another would exceed six rows. A
  // slot's rows share one Date object, so objects count slots.
  const slotCount = new Set(episodes.map((row) => row.watchedAt)).size;
  const instantCount = new Set(episodes.map((row) => row.watchedAt.getTime())).size;
  if (instantCount !== slotCount) throw new Error(`${persona.username}: two slots landed on the same instant`);

  const ordered = episodes
    .map(({ tmdbId, seasonNumber, episodeNumber, watchedAt }) => ({ tmdbId, seasonNumber, episodeNumber, watchedAt }))
    .sort(
      (a, b) =>
        a.watchedAt.getTime() - b.watchedAt.getTime() ||
        a.tmdbId - b.tmdbId ||
        a.seasonNumber - b.seasonNumber ||
        a.episodeNumber - b.episodeNumber,
    );

  return {
    episodes: ordered,
    statuses: statuses.map(({ tmdbId, contentType, status, createdAt, updatedAt }) => ({ tmdbId, contentType, status, createdAt, updatedAt })),
  };
}
