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
  /** Episodes ticked alone: a watched_at no other episode of the period shares (solo-ticks.ts partitionSoloTicks). */
  soloTicks: number;
  /** Solo ticks from local 21:00 on (aggregate.ts:609-614, buildRhythm). */
  lateSoloTicks: number;
  /** lateSoloTicks / soloTicks; null below SOLO_TICK_FLOOR (types.ts:24) solo ticks, when the app shows no share. */
  lateShare: number | null;
  /** Consenting collaborators kept by the cap, plus the viewer, as CrewRanking orders and ranks them. Empty without collaborators. */
  crew: { username: string; episodes: number; rank: number }[];
  /** How the crew was capped, and who the cap left out. */
  crewCapRule: string;
  crewCappedOut: string[];
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

// service.ts:224 and :275 -- ids sorted as strings, the first 8 kept, before
// any activity is loaded.
const CREW_LIMIT = 8;
const CREW_CAP_RULE =
  "service.ts loadCollaboratorIds: consenting collaborators (list owners and list collaborators, minus the viewer) " +
  `sorted by user id as strings, first ${CREW_LIMIT} kept, BEFORE activity is loaded -- so the cap drops by id, ` +
  "not by how much anyone watched (e2e_jon has the all-f id and is always the one left out of ava's crew)";

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

/** The first key, in sorted order, that has a tmdb_cache row, as its title (service.ts:439-448). */
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
      select watched_at from episode_watch_status
      where user_id = ${u} and watched and watched_at >= ${w.start} and watched_at < ${w.end}
      group by watched_at having count(*) = 1
    ) solo`;

  // --- Crew and compare --------------------------------------------------
  // service.ts:238-276: every list the viewer owns or joined; their owners and
  // collaborators who consent, minus the viewer; sorted by id; first 8.
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
  const keptIds = sortedIds.slice(0, CREW_LIMIT);
  const usernameOf = async (id: string) => {
    const [row] = await sql<{ username: string }[]>`select username from users where id = ${id}`;
    return row!.username;
  };
  const crewCappedOut = await Promise.all(sortedIds.slice(CREW_LIMIT).map(usernameOf));

  // Each kept collaborator counted in the VIEWER's window (service.ts:303-306, :346).
  const collaborators = [];
  for (const id of keptIds) {
    collaborators.push({
      id,
      username: await usernameOf(id),
      episodes: await episodeCount(id, w),
      topShowId: await topShowId(id, w),
    });
  }
  // Episodes descending, username by code unit (service.ts:380-384).
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
  // the viewer's -- nobody when the viewer has no top show card (service.ts:590-599, :824-826).
  const alsoTopFor = topShow === null ? [] : collaborators.filter((c) => c.topShowId === topId).map((c) => c.username);

  // Compare: completed and dropped scoped to the viewer's window on both
  // sides, planning unscoped (service.ts:359-375, :426-437, :450-467).
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
  // code unit (service.ts:472-476).
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
    crew,
    crewCapRule: CREW_CAP_RULE,
    crewCappedOut,
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
