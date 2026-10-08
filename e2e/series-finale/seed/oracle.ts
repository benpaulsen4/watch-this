#!/usr/bin/env tsx
// What each recap must show, computed independently of the app's engine:
// plain SQL over the seeded tables plus the spec's statistic definitions
// (docs/superpowers/specs/2026-08-31-series-finale-design.md, "Aggregation
// rules, per card"). Nothing here imports src/lib/series-finale -- where the
// spec leaves a rounding, tie-break or ordering open, the rule was read from
// aggregate.ts / service.ts / the renderer once and is cited at the line that
// matches it. Local dates come from Postgres' own `AT TIME ZONE`, not the
// app's Intl formatting, so zone handling is checked rather than copied.
//
// The percentile is not predicted: it depends on the cohort at the moment of
// generation, so it is recorded as null and the specs check presence/absence.
//
// Run through `npm run e2e:oracle` (run.ts spawns this with buildE2eEnv()).
// Writes artifacts/oracle.json and prints ava's 2025 block. Specs read the
// JSON; importing this module (for `OracleYear`) runs nothing.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import postgres from "postgres";

import { ARTIFACTS_DIR, assertE2eDatabaseUrl } from "../env/test-env";
import { PERSONAS } from "./personas";

export interface OracleYear {
  available: boolean;
  thin: boolean;
  episodes: number;
  /**
   * Episodes had the year been bucketed in UTC rather than the user's zone. A
   * precondition, not a statistic: for ava (Brisbane) it must differ from
   * `episodes`, or the zone-edge episodes cancel out and a UTC-bucketing app
   * would pass every count check.
   */
  episodesIfUtcWindow: number;
  /** Known minutes: episodes watched plus films completed in the period. */
  minutes: number;
  /** Math.round(minutes / 60), as the headline and the hero show it (aggregate.ts:831, RecapClient.tsx:324). */
  hours: number;
  titlesCompleted: number;
  /** Films completed in the period: `finished.films`, the hero sentence's "and N films" (aggregate.ts:80-89). */
  filmsCompleted: number;
  titlesDropped: number;
  namedDropped: string[];
  topShow: string | null;
  topShowLastWatched: string | null; // "YYYY-MM-DD", local
  niche: string | null;
  stillPlanning: string[]; // titles, created before period end
  unknownRuntime: number;
  bigDay: { date: string; episodes: number } | null;
  longestStreak: number;
  /** Episodes plus completed films per local month, January first (aggregate.ts:130-170 buildMonths). */
  months: number[];
  /** Episodes per local weekday, Monday first (aggregate.ts:588-617 buildRhythm; time.ts:97-105 WEEKDAY_TO_INDEX). */
  weekdayCounts: number[];
  /** The first weekday (Monday = 0) with the most episodes; null with none (aggregate.ts:605-607). */
  topWeekday: number | null;
  /** Episodes ticked alone: no other row at the same instant, and no other episode of the same show within 2 minutes either side (solo-ticks.ts partitionSoloTicks). */
  soloTicks: number;
  /** Solo ticks from local 21:00 on (aggregate.ts:609-614, buildRhythm). */
  lateSoloTicks: number;
  /** lateSoloTicks / soloTicks; null below SOLO_TICK_FLOOR (types.ts:24) solo ticks, when the app shows no share. */
  lateShare: number | null;
  /** The user's zone: every local bucket here, and the payload's period.timezone. */
  timezone: string;
  /**
   * The biggest day's solo ticks in time order, each as its local "HH:MM",
   * the show's cached title (null when uncached) and its episode code
   * ("S2E03"); null below SOLO_TICK_FLOOR solo ticks in the period
   * (aggregate.ts:545-615 buildBigDay; :177-179 episodeCode).
   */
  bigDayTimeline: { time: string; title: string | null; episode: string }[] | null;
  /** Solo ticks per local hour, midnight first; null below SOLO_TICK_FLOOR (aggregate.ts:618-661 buildRhythm). */
  hourCounts: number[] | null;
  /**
   * The busiest three consecutive hours of hourCounts, wrapping midnight, the
   * earliest start on a tie (archetype.ts:66-89 busiestWindow, RITUAL_WINDOW_HOURS):
   * the nightly ritualist's clock. Null with no hourCounts.
   */
  busiestWindow: { start: number; count: number } | null;
  /**
   * The genre on most finished titles, by TITLE share: titles completed in the
   * period with cached metadata carrying the genre, over those titles
   * (aggregate.ts:439-465 topGenreByTitles). `names` holds every genre tied at
   * the top -- the engine keeps the first it meets, which is query order --
   * named as TMDB names them (GENRE_NAMES). Null with no such title.
   */
  topGenre: { names: string[]; share: number } | null;
  /**
   * Titles completed in the period that sit on a shared list (a list with a
   * collaborator besides its owner, the user owning or collaborating on it),
   * over titles completed; null with none completed (aggregate.ts:829-837,
   * service.ts:670-691 loadCollaborativeTitleKeys).
   */
  sharedListShare: number | null;
  /** Consenting collaborators kept by the cap, plus the viewer, as CrewRanking orders and ranks them. Empty without collaborators. */
  crew: { username: string; episodes: number; rank: number }[];
  /** How the crew was capped, and who the cap left out. */
  crewCapRule: string;
  crewCappedOut: string[];
  /**
   * The consenting collaborators the cap keeps, most active first: the 8 with
   * most episodes in the viewer's window, a tie to the username by code unit,
   * then the id (service.ts mostActiveCollaborators). Finding F3 (fixed)
   * compares the crew the app stored for e2e_jon with this.
   */
  crewTopByActivity: string[];
  /** Per crew member, keys in the order the compare rows render. */
  compare: Record<
    string,
    { onlyYou: number; both: number; onlyThem: number; theyFinishedYouDropped: string | null; bothPlanning: string | null }
  >;
  alsoTopFor: string[];
  /** Not predicted (depends on the cohort at generation time); specs test presence/absence. */
  percentile: null;
}

export type Oracle = Record<string, Record<string, OracleYear>>;

/** Completed years under test. Today is 2026-09-26, so 2025 is the newest. */
const YEARS = [2023, 2024, 2025];
const LAST_COMPLETED_YEAR = 2025;

// types.ts:27-28 -- THIN_YEAR_EPISODES and THIN_YEAR_TITLES; thin is below
// BOTH (aggregate.ts:857-858).
const THIN_YEAR_EPISODES = 10;
const THIN_YEAR_TITLES = 5;

// types.ts:24 -- below this many solo ticks the late share is null.
const SOLO_TICK_FLOOR = 50;

// solo-ticks.ts BATCH_GAP_MS -- a show's ticks this close together are a batch.
const BATCH_GAP_SECONDS = 120;

// service.ts:227 CREW_LIMIT; :301-314 mostActiveCollaborators -- every
// consenting collaborator ranked by episodes in the viewer's window (the
// grouped left join at :363-394), then username by code unit, then id; the
// first 8 kept (finding F3, fixed: the cap once went by user id).
const CREW_LIMIT = 8;
const CREW_CAP_RULE =
  "service.ts mostActiveCollaborators: consenting collaborators (list owners and list collaborators, minus the viewer) " +
  `ranked by episodes in the viewer's window, then username by code unit, then id; the first ${CREW_LIMIT} kept -- ` +
  "so the cap leaves out the least active, whatever their ids (e2e_jon, with nothing in 2025, is the one left out of ava's crew)";

// archetype.ts:66 RITUAL_WINDOW_HOURS.
const RITUAL_WINDOW_HOURS = 3;

/**
 * TMDB's genre names by id, the movie list then the TV list (service.ts
 * loadGenreNames merges them in that order; the ids they share have the same
 * name in both). Static here so the oracle needs no TMDB call; an id missing
 * from it reads "Unknown", as the app's does.
 */
const GENRE_NAMES: Record<number, string> = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Science Fiction",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
  10759: "Action & Adventure",
  10762: "Kids",
  10763: "News",
  10764: "Reality",
  10765: "Sci-Fi & Fantasy",
  10766: "Soap",
  10767: "Talk",
  10768: "War & Politics",
};

/** archetype.ts busiestWindow: the busiest `size` consecutive hours, wrapping midnight, the earliest start on a tie. */
function busiestWindowOf(hourCounts: number[], size: number): { start: number; count: number } {
  let best = { start: 0, count: 0 };
  for (let start = 0; start < 24; start += 1) {
    let count = 0;
    for (let offset = 0; offset < size; offset += 1) count += hourCounts[(start + offset) % 24] ?? 0;
    if (count > best.count) best = { start, count };
  }
  return best;
}

/** aggregate.ts:177-179 episodeCode: "S2E03", the season unpadded and the episode to two digits. */
function episodeCodeOf(season: number, episode: number): string {
  return `S${season}E${String(episode).padStart(2, "0")}`;
}

// Connected in `main`, after the DATABASE_URL guard.
let sql: postgres.Sql;

/** Code-unit order, as service.ts compares usernames (:380-384, :472-476). */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

interface Window {
  zone: string;
  start: Date;
  end: Date;
}

async function windowOf(zone: string, year: number): Promise<Window> {
  // Local midnight of 1 January in the user's zone, each side (the spec's
  // "every date bucket is computed in the user's timezone").
  const [row] = await sql<{ start: Date; end: Date }[]>`
    select (make_timestamp(${year}, 1, 1, 0, 0, 0) at time zone ${zone}) as start,
           (make_timestamp(${year + 1}, 1, 1, 0, 0, 0) at time zone ${zone}) as "end"`;
  return { zone, start: row!.start, end: row!.end };
}

/**
 * The window's solo ticks, as a query fragment: rows sharing their instant
 * with no other row, whose neighbours in time *of the same show* are both more
 * than BATCH_GAP_SECONDS away. A show's batch is caught whether its rows share
 * one instant or arrived one write at a time; different shows ticked close
 * together stay solo (solo-ticks.ts partitionSoloTicks).
 */
function soloTicksOf(userId: string, w: Window) {
  return sql`
    select watched_at, tmdb_id, season_number, episode_number from (
      select watched_at, tmdb_id, season_number, episode_number,
             count(*) over (partition by watched_at) as sharing,
             lag(watched_at) over (partition by tmdb_id order by watched_at) as prev,
             lead(watched_at) over (partition by tmdb_id order by watched_at) as next
      from episode_watch_status
      where user_id = ${userId} and watched and watched_at >= ${w.start} and watched_at < ${w.end}
    ) ticks
    where sharing = 1
      and (prev is null or watched_at - prev > ${BATCH_GAP_SECONDS} * interval '1 second')
      and (next is null or next - watched_at > ${BATCH_GAP_SECONDS} * interval '1 second')`;
}

/** Episodes watched in the window: count and top show, per user. */
async function episodeCount(userId: string, w: Window): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    select count(*)::int as n from episode_watch_status
    where user_id = ${userId} and watched and watched_at >= ${w.start} and watched_at < ${w.end}`;
  return row!.n;
}

/** Most-watched show id in the window; a tie goes to the lower tmdb id (aggregate.ts:236-252). */
async function topShowId(userId: string, w: Window): Promise<number | null> {
  const [row] = await sql<{ tmdb_id: number }[]>`
    select tmdb_id from episode_watch_status
    where user_id = ${userId} and watched and watched_at >= ${w.start} and watched_at < ${w.end}
    group by tmdb_id order by count(*) desc, tmdb_id asc limit 1`;
  return row?.tmdb_id ?? null;
}

/** Title keys ("tv:123", types.ts:265) of a status, optionally scoped to the window by updated_at. */
async function statusKeys(userId: string, status: string, w: Window | null): Promise<string[]> {
  const rows = await sql<{ key: string }[]>`
    select content_type || ':' || tmdb_id as key from user_content_status
    where user_id = ${userId} and status = ${status}
      ${w ? sql`and updated_at >= ${w.start} and updated_at < ${w.end}` : sql``}`;
  return rows.map((row) => row.key);
}

/** The first key, in sorted order, that has a tmdb_cache row, as its title (service.ts:496-505 buildCompare firstTitle). */
async function firstCachedTitle(keys: string[]): Promise<string | null> {
  for (const key of Array.from(new Set(keys)).sort()) {
    const [type, id] = key.split(":");
    const [row] = await sql<{ title: string }[]>`
      select title from tmdb_cache where tmdb_id = ${Number(id)} and content_type = ${type!}`;
    if (row) return row.title;
  }
  return null;
}

async function recapStart(userId: string): Promise<Date | null> {
  // service.ts:685-703 -- the later of first activity (first watched episode or
  // first status row) and the account's creation; null with no activity.
  const [row] = await sql<{ first: Date | null; created: Date }[]>`
    select least(
             (select min(watched_at) from episode_watch_status where user_id = ${userId} and watched),
             (select min(created_at) from user_content_status where user_id = ${userId})
           ) as first,
           (select created_at from users where id = ${userId}) as created`;
  if (!row?.first) return null;
  return row.created > row.first ? row.created : row.first;
}

async function oracleYear(user: { id: string; username: string; timezone: string }, year: number): Promise<OracleYear> {
  const w = await windowOf(user.timezone, year);
  const u = user.id;

  // Available: a completed year, from the recap start's local year on
  // (periods.ts completedYearsBetween).
  const start = await recapStart(u);
  let available = false;
  if (start && year <= LAST_COMPLETED_YEAR) {
    const [row] = await sql<{ y: number }[]>`select extract(year from (${start}::timestamptz at time zone ${w.zone}))::int as y`;
    available = row!.y <= year;
  }

  // Episodes, their minutes and unknown runtimes. A runtime counts only when
  // positive; null, zero or no row at all is unknown (runtime-math.ts:43-55).
  const [eps] = await sql<{ n: number; minutes: number; unknown: number }[]>`
    select count(*)::int as n,
           coalesce(sum(r.runtime) filter (where r.runtime > 0), 0)::int as minutes,
           (count(*) filter (where r.runtime is null or r.runtime <= 0))::int as unknown
    from episode_watch_status e
    left join tmdb_episode_runtime r
      on r.tmdb_id = e.tmdb_id and r.season_number = e.season_number and r.episode_number = e.episode_number
    where e.user_id = ${u} and e.watched and e.watched_at >= ${w.start} and e.watched_at < ${w.end}`;

  // Completed films in the period, dated by updated_at; runtime from the movie
  // cache row (runtime.ts loadFilmRuntimes), same positive-only rule.
  const [films] = await sql<{ n: number; minutes: number; unknown: number }[]>`
    select count(*)::int as n,
           coalesce(sum(c.runtime) filter (where c.runtime > 0), 0)::int as minutes,
           (count(*) filter (where c.runtime is null or c.runtime <= 0))::int as unknown
    from user_content_status s
    left join tmdb_cache c on c.tmdb_id = s.tmdb_id and c.content_type = 'movie'
    where s.user_id = ${u} and s.content_type = 'movie' and s.status = 'completed'
      and s.updated_at >= ${w.start} and s.updated_at < ${w.end}`;

  const [counts] = await sql<{ completed: number; dropped: number }[]>`
    select (count(*) filter (where status = 'completed'))::int as completed,
           (count(*) filter (where status = 'dropped'))::int as dropped
    from user_content_status
    where user_id = ${u} and updated_at >= ${w.start} and updated_at < ${w.end}`;

  // Dropped titles that can be named: those with cached metadata, by tmdb id
  // (aggregate.ts:684-705).
  const namedDropped = await sql<{ title: string }[]>`
    select c.title from user_content_status s
    join tmdb_cache c on c.tmdb_id = s.tmdb_id and c.content_type = s.content_type
    where s.user_id = ${u} and s.status = 'dropped' and s.updated_at >= ${w.start} and s.updated_at < ${w.end}
    order by s.tmdb_id`;

  // Top show: null when it has no cached metadata rather than the runner-up
  // (aggregate.ts:275-276); last watched is its latest watch, local date.
  const topId = await topShowId(u, w);
  let topShow: string | null = null;
  let topShowLastWatched: string | null = null;
  if (topId !== null) {
    const [row] = await sql<{ title: string | null; last: string }[]>`
      select (select title from tmdb_cache where tmdb_id = ${topId} and content_type = 'tv') as title,
             to_char(max(watched_at) at time zone ${w.zone}, 'YYYY-MM-DD') as last
      from episode_watch_status
      where user_id = ${u} and watched and tmdb_id = ${topId} and watched_at >= ${w.start} and watched_at < ${w.end}`;
    if (row?.title) {
      topShow = row.title;
      topShowLastWatched = row.last;
    }
  }

  // Niche: the least popular completed film with cached metadata. The engine
  // keeps the first of equal minimums in query order (aggregate.ts:318-320),
  // which is undefined, so a tie is reported rather than guessed.
  const nicheRows = await sql<{ title: string; popularity: string }[]>`
    select c.title, c.popularity from user_content_status s
    join tmdb_cache c on c.tmdb_id = s.tmdb_id and c.content_type = 'movie'
    where s.user_id = ${u} and s.content_type = 'movie' and s.status = 'completed'
      and s.updated_at >= ${w.start} and s.updated_at < ${w.end}
    order by c.popularity asc, s.tmdb_id asc limit 2`;
  if (nicheRows.length === 2 && nicheRows[0]!.popularity === nicheRows[1]!.popularity) {
    console.warn(`[oracle] ${user.username} ${year}: niche tie at popularity ${nicheRows[0]!.popularity}; the engine's pick is order-dependent`);
  }
  const niche = nicheRows[0]?.title ?? null;

  // Still planning: films in planning created before the period's end, with
  // cached metadata, longest-waiting first, then tmdb id (aggregate.ts:713-744).
  const stillPlanning = await sql<{ title: string }[]>`
    select c.title from user_content_status s
    join tmdb_cache c on c.tmdb_id = s.tmdb_id and c.content_type = 'movie'
    where s.user_id = ${u} and s.status = 'planning' and s.content_type = 'movie' and s.created_at < ${w.end}
    order by floor(extract(epoch from (now() - s.created_at)) / 86400) desc, s.tmdb_id asc`;

  // Big day: the local date with most episodes, a tie to the earlier date
  // (aggregate.ts:538-540).
  const [bigDay] = await sql<{ date: string; episodes: number }[]>`
    select to_char(watched_at at time zone ${w.zone}, 'YYYY-MM-DD') as date, count(*)::int as episodes
    from episode_watch_status
    where user_id = ${u} and watched and watched_at >= ${w.start} and watched_at < ${w.end}
    group by 1 order by 2 desc, 1 asc limit 1`;

  // Longest run of consecutive local dates with an episode (gaps and islands).
  const [streak] = await sql<{ days: number | null }[]>`
    with days as (
      select distinct (watched_at at time zone ${w.zone})::date as d from episode_watch_status
      where user_id = ${u} and watched and watched_at >= ${w.start} and watched_at < ${w.end}
    ), islands as (
      select d - (row_number() over (order by d))::int as island from days
    )
    select max(n)::int as days from (select count(*) as n from islands group by island) runs`;

  // The same count over the year's UTC window: see `episodesIfUtcWindow`.
  const utc = await windowOf("UTC", year);
  const episodesIfUtcWindow = await episodeCount(u, utc);

  // Months: episodes by watched_at and completed films by updated_at, in the
  // user's zone; the window already confines both to the year.
  const monthRows = await sql<{ m: number; n: number }[]>`
    select m, count(*)::int as n from (
      select extract(month from watched_at at time zone ${w.zone})::int as m from episode_watch_status
      where user_id = ${u} and watched and watched_at >= ${w.start} and watched_at < ${w.end}
      union all
      select extract(month from updated_at at time zone ${w.zone})::int as m from user_content_status
      where user_id = ${u} and content_type = 'movie' and status = 'completed'
        and updated_at >= ${w.start} and updated_at < ${w.end}
    ) rows group by m`;
  const months = Array.from({ length: 12 }, (_, i) => monthRows.find((row) => row.m === i + 1)?.n ?? 0);

  // Weekdays, Monday first: isodow is 1 (Monday) to 7 (Sunday).
  const weekdayRows = await sql<{ d: number; n: number }[]>`
    select extract(isodow from watched_at at time zone ${w.zone})::int as d, count(*)::int as n from episode_watch_status
    where user_id = ${u} and watched and watched_at >= ${w.start} and watched_at < ${w.end}
    group by d`;
  const weekdayCounts = Array.from({ length: 7 }, (_, i) => weekdayRows.find((row) => row.d === i + 1)?.n ?? 0);
  const weekdayPeak = Math.max(...weekdayCounts);
  const topWeekday = weekdayPeak === 0 ? null : weekdayCounts.indexOf(weekdayPeak);

  // Solo ticks, and those from local 21:00 on.
  const [ticks] = await sql<{ solo: number; late: number }[]>`
    select count(*)::int as solo,
           (count(*) filter (where extract(hour from watched_at at time zone ${w.zone}) >= 21))::int as late
    from (
      ${soloTicksOf(u, w)}
    ) solo`;

  // Solo ticks by local hour, the busiest three hours of them, and the
  // biggest day's solo ticks in time order -- all null below the floor.
  const hourRows = await sql<{ h: number; n: number }[]>`
    select extract(hour from watched_at at time zone ${w.zone})::int as h, count(*)::int as n from (
      ${soloTicksOf(u, w)}
    ) solo group by h`;
  const hourCounts =
    ticks!.solo >= SOLO_TICK_FLOOR ? Array.from({ length: 24 }, (_, h) => hourRows.find((row) => row.h === h)?.n ?? 0) : null;
  let bigDayTimeline: OracleYear["bigDayTimeline"] = null;
  if (bigDay && ticks!.solo >= SOLO_TICK_FLOOR) {
    const points = await sql<{ time: string; title: string | null; season: number; episode: number }[]>`
      select to_char(e.watched_at at time zone ${w.zone}, 'HH24:MI') as time, c.title,
             e.season_number as season, e.episode_number as episode
      from (${soloTicksOf(u, w)}) e
      left join tmdb_cache c on c.tmdb_id = e.tmdb_id and c.content_type = 'tv'
      where to_char(e.watched_at at time zone ${w.zone}, 'YYYY-MM-DD') = ${bigDay.date}
      order by e.watched_at`;
    bigDayTimeline = points.map((p) => ({ time: p.time, title: p.title, episode: episodeCodeOf(p.season, p.episode) }));
  }

  // The top genre by titles: completed titles of the period with cached
  // metadata, each genre counted once per title, over those titles.
  const genreRows = await sql<{ titles: number; genre: number | null; n: number }[]>`
    with done as (
      select distinct c.tmdb_id, c.content_type, c.genre_ids from user_content_status s
      join tmdb_cache c on c.tmdb_id = s.tmdb_id and c.content_type = s.content_type
      where s.user_id = ${u} and s.status = 'completed' and s.updated_at >= ${w.start} and s.updated_at < ${w.end}
    )
    select (select count(*)::int from done) as titles, g.genre, count(distinct (done.tmdb_id, done.content_type))::int as n
    from done left join lateral unnest(done.genre_ids) as g(genre) on true
    group by g.genre`;
  const known = genreRows[0]?.titles ?? 0;
  const perGenre = genreRows.filter((row) => row.genre !== null);
  const topCount = Math.max(0, ...perGenre.map((row) => row.n));
  const topGenre =
    known === 0 || topCount === 0
      ? null
      : {
          names: perGenre
            .filter((row) => row.n === topCount)
            .map((row) => GENRE_NAMES[row.genre!] ?? "Unknown")
            .sort(),
          share: topCount / known,
        };

  // Titles completed in the period that are on a shared list.
  const [shared] = await sql<{ n: number }[]>`
    select count(*)::int as n from user_content_status s
    where s.user_id = ${u} and s.status = 'completed' and s.updated_at >= ${w.start} and s.updated_at < ${w.end}
      and exists (
        select 1 from list_items li
        join lists l on l.id = li.list_id
        join list_collaborators lc on lc.list_id = l.id
        where li.tmdb_id = s.tmdb_id and li.content_type = s.content_type
          and (l.owner_id = ${u} or lc.user_id = ${u}) and lc.user_id <> l.owner_id
      )`;

  // --- Crew and compare --------------------------------------------------
  // service.ts:243-281 loadCollaboratorIds: every list the viewer owns or
  // joined; their owners and collaborators who consent, minus the viewer --
  // uncapped; the cap by activity follows (service.ts:363-401).
  const people = await sql<{ id: string }[]>`
    with mine as (
      select l.id from lists l left join list_collaborators lc on lc.list_id = l.id
      where l.owner_id = ${u} or lc.user_id = ${u}
    )
    select distinct p.id::text as id from (
      select owner_id as id from lists where id in (select id from mine)
      union
      select user_id as id from list_collaborators where list_id in (select id from mine)
    ) p join users on users.id = p.id
    where users.share_stats_with_collaborators and p.id <> ${u}`;
  const sortedIds = people.map((row) => row.id).sort();
  const usernameOf = async (id: string) => {
    const [row] = await sql<{ username: string }[]>`select username from users where id = ${id}`;
    return row!.username;
  };
  // Every candidate with their episodes in the viewer's window, ranked as
  // mostActiveCollaborators ranks them (service.ts:301-314).
  const everyone: { id: string; username: string; episodes: number }[] = [];
  for (const id of sortedIds) everyone.push({ id, username: await usernameOf(id), episodes: await episodeCount(id, w) });
  const ranked = everyone.sort(
    (a, b) => b.episodes - a.episodes || byCodeUnit(a.username, b.username) || byCodeUnit(a.id, b.id),
  );
  const keptIds = ranked.slice(0, CREW_LIMIT).map((person) => person.id);
  const crewCappedOut = ranked.slice(CREW_LIMIT).map((person) => person.username);
  const crewTopByActivity = ranked.slice(0, CREW_LIMIT).map((person) => person.username);

  // Each kept collaborator counted in the VIEWER's window (service.ts:363-433 loadCollaboratorSlices).
  const collaborators = [];
  for (const id of keptIds) {
    collaborators.push({
      id,
      username: await usernameOf(id),
      episodes: await episodeCount(id, w),
      topShowId: await topShowId(id, w),
    });
  }
  // Episodes descending, username by code unit (service.ts:436-442).
  collaborators.sort((a, b) => b.episodes - a.episodes || byCodeUnit(a.username, b.username));

  // The viewer joins the ranking only when there is a crew (RecapClient.tsx:194);
  // viewer first on a tie, competition ranking (CrewRanking.tsx sort + rank).
  const crewRows =
    collaborators.length === 0
      ? []
      : [{ username: user.username, episodes: eps!.n, isViewer: true }, ...collaborators.map((c) => ({ ...c, isViewer: false }))].sort(
          (a, b) => b.episodes - a.episodes || Number(b.isViewer) - Number(a.isViewer),
        );
  const crew = crewRows.map((row) => ({
    username: row.username,
    episodes: row.episodes,
    rank: 1 + crewRows.filter((other) => other.episodes > row.episodes).length,
  }));

  // alsoTopFor: kept collaborators, in crew order, whose most-watched show is
  // the viewer's -- nobody when the viewer has no top show card (service.ts:648-657 alsoTopForOf, :883).
  const alsoTopFor = topShow === null ? [] : collaborators.filter((c) => c.topShowId === topId).map((c) => c.username);

  // Compare: completed and dropped scoped to the viewer's window on both
  // sides, planning unscoped (service.ts:417-432, :477-529 buildCompare).
  const myCompleted = new Set(await statusKeys(u, "completed", w));
  const myDropped = new Set(await statusKeys(u, "dropped", w));
  const myPlanning = new Set(await statusKeys(u, "planning", null));
  const compareRows = [];
  for (const c of collaborators) {
    const theirCompleted = await statusKeys(c.id, "completed", w);
    const theirPlanning = await statusKeys(c.id, "planning", null);
    const theirSet = new Set(theirCompleted);
    const both = Array.from(myCompleted).filter((key) => theirSet.has(key)).length;
    compareRows.push({
      username: c.username,
      onlyYou: myCompleted.size - both,
      both,
      onlyThem: theirSet.size - both,
      theyFinishedYouDropped: await firstCachedTitle(theirCompleted.filter((key) => myDropped.has(key))),
      bothPlanning: await firstCachedTitle(theirPlanning.filter((key) => myPlanning.has(key))),
    });
  }
  // Keys in the service's row order: most in common first, then username by
  // code unit (service.ts:530-537).
  compareRows.sort((a, b) => b.both - a.both || byCodeUnit(a.username, b.username));
  const compare: OracleYear["compare"] = Object.fromEntries(compareRows.map(({ username, ...row }) => [username, row]));

  const titlesCompleted = counts!.completed;
  const minutes = eps!.minutes + films!.minutes;
  return {
    available,
    thin: eps!.n < THIN_YEAR_EPISODES && titlesCompleted < THIN_YEAR_TITLES,
    episodes: eps!.n,
    episodesIfUtcWindow,
    minutes,
    hours: Math.round(minutes / 60),
    titlesCompleted,
    filmsCompleted: films!.n,
    titlesDropped: counts!.dropped,
    namedDropped: namedDropped.map((row) => row.title),
    topShow,
    topShowLastWatched,
    niche,
    stillPlanning: stillPlanning.map((row) => row.title),
    unknownRuntime: eps!.unknown + films!.unknown,
    bigDay: bigDay ?? null,
    longestStreak: streak?.days ?? 0,
    months,
    weekdayCounts,
    topWeekday,
    soloTicks: ticks!.solo,
    lateSoloTicks: ticks!.late,
    lateShare: ticks!.solo >= SOLO_TICK_FLOOR ? ticks!.late / ticks!.solo : null,
    timezone: w.zone,
    bigDayTimeline,
    hourCounts,
    busiestWindow: hourCounts ? busiestWindowOf(hourCounts, RITUAL_WINDOW_HOURS) : null,
    topGenre,
    sharedListShare: counts!.completed === 0 ? null : shared!.n / counts!.completed,
    crew,
    crewCapRule: CREW_CAP_RULE,
    crewCappedOut,
    crewTopByActivity,
    compare,
    alsoTopFor,
    percentile: null,
  };
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? "";
  assertE2eDatabaseUrl(url);
  sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

  const oracle: Oracle = {};
  for (const persona of PERSONAS) {
    const [user] = await sql<{ id: string; username: string; timezone: string }[]>`
      select id::text as id, username, timezone from users where username = ${persona.username}`;
    if (!user) throw new Error(`${persona.username} is not in the e2e database; run the seed first`);
    oracle[user.username] = {};
    for (const year of YEARS) oracle[user.username]![String(year)] = await oracleYear(user, year);
  }

  mkdirSync(ARTIFACTS_DIR, { recursive: true });
  const path = join(ARTIFACTS_DIR, "oracle.json");
  writeFileSync(path, `${JSON.stringify(oracle, null, 2)}\n`);
  console.log(`[oracle] ${Object.keys(oracle).length} users x ${YEARS.length} years -> ${path}`);
  console.log("[oracle] e2e_ava 2025:");
  console.log(JSON.stringify(oracle.e2e_ava?.["2025"], null, 2));
}

if (process.argv[1]?.endsWith("oracle.ts")) {
  main()
    .then(async () => {
      await sql.end();
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      await sql?.end({ timeout: 1 });
      process.exit(1);
    });
}
