import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  min,
  ne,
  not,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../db";
import {
  episodeWatchStatus,
  listCollaborators,
  listItems,
  lists,
  seriesFinale,
  tmdbCache,
  userContentStatus,
  users,
} from "../db/schema";
import { resolveTimeZone } from "../time";
import { tmdbClient } from "../tmdb/client";
import { buildPayload } from "./aggregate";
import { completedYearsBetween, localisePeriod, type Period } from "./periods";
import {
  ensureSeasonsCached,
  episodeKeyOf,
  loadEpisodeRuntimes,
  loadFilmRuntimes,
  type RuntimeLookup,
  type SeasonKey,
  summariseEpisodeRuntimes,
  summariseFilmRuntimes,
} from "./runtime";
import {
  type ComparePeer,
  type ContentStatusRow,
  type CrewMemberTotals,
  SERIES_FINALE_SCHEMA_VERSION,
  type SeriesFinalePayload,
  titleKey,
  type TitleMeta,
  type WatchedEpisodeRow,
} from "./types";

export interface LoadedRows {
  episodes: WatchedEpisodeRow[];
  statuses: ContentStatusRow[];
  titles: Map<string, TitleMeta>;
  genreNames: Map<number, string>;
}

/**
 * Load everything the aggregation engine needs for one user and period.
 *
 * `period` must already be localised (see `localisePeriod` in `./periods`) --
 * this function does not localise it. The caller reads the user's zone once
 * and localises once; a canonical UTC calendar year passed here would
 * silently mis-date the edges of the year for every non-UTC user.
 *
 * Statuses are loaded in full rather than filtered to the period: `buildShame`
 * reports films that have sat in "planning" for years, and those rows were
 * created long before the period started. The aggregators apply their own
 * period filters.
 */
export async function loadUserRows(
  userId: string,
  period: Period,
): Promise<LoadedRows> {
  const episodeRows = await db
    .select({
      tmdbId: episodeWatchStatus.tmdbId,
      seasonNumber: episodeWatchStatus.seasonNumber,
      episodeNumber: episodeWatchStatus.episodeNumber,
      watchedAt: episodeWatchStatus.watchedAt,
    })
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.watched, true),
        gte(episodeWatchStatus.watchedAt, period.start),
        lt(episodeWatchStatus.watchedAt, period.end),
      ),
    );

  const episodes: WatchedEpisodeRow[] = episodeRows
    // `watched_at` is nullable in the schema. A watched row without one cannot
    // be placed on the calendar, so it is dropped rather than dated to the
    // epoch. A type-guard filter (rather than a post-filter cast) is required
    // under `noUncheckedIndexedAccess`.
    .filter(
      (row): row is typeof row & { watchedAt: Date } => row.watchedAt !== null,
    )
    .map((row) => ({
      tmdbId: row.tmdbId,
      seasonNumber: row.seasonNumber,
      episodeNumber: row.episodeNumber,
      watchedAt: row.watchedAt,
    }));

  const statuses = (await db
    .select({
      tmdbId: userContentStatus.tmdbId,
      contentType: userContentStatus.contentType,
      status: userContentStatus.status,
      createdAt: userContentStatus.createdAt,
      updatedAt: userContentStatus.updatedAt,
    })
    .from(userContentStatus)
    .where(eq(userContentStatus.userId, userId))) as ContentStatusRow[];

  const referencedIds = Array.from(
    new Set([
      ...episodes.map((row) => row.tmdbId),
      ...statuses.map((row) => row.tmdbId),
    ]),
  );

  const titles = new Map<string, TitleMeta>();
  if (referencedIds.length > 0) {
    const titleRows = await db
      .select({
        tmdbId: tmdbCache.tmdbId,
        contentType: tmdbCache.contentType,
        title: tmdbCache.title,
        posterPath: tmdbCache.posterPath,
        genreIds: tmdbCache.genreIds,
        popularity: tmdbCache.popularity,
        runtime: tmdbCache.runtime,
      })
      .from(tmdbCache)
      .where(inArray(tmdbCache.tmdbId, referencedIds));

    for (const row of titleRows) {
      const contentType = row.contentType as "movie" | "tv";
      titles.set(titleKey(row.tmdbId, contentType), {
        tmdbId: row.tmdbId,
        contentType,
        title: row.title,
        posterPath: row.posterPath,
        genreIds: row.genreIds ?? [],
        // `popularity` is a Postgres numeric, which postgres-js returns as a
        // string. Every comparison downstream is numeric.
        popularity: Number(row.popularity),
        runtime: row.runtime,
      });
    }
  }

  return {
    episodes,
    statuses,
    titles,
    genreNames: await loadGenreNames(),
  };
}

/**
 * TMDB genre id to display name, across both movie and TV lists.
 *
 * Without this the genres card renders every slice as "Unknown" -- `genre_ids`
 * in `tmdb_cache` are numbers, and nothing else in the codebase resolves them
 * server-side.
 *
 * Best-effort: TMDB being unreachable during generation should cost the genre
 * labels, not the whole recap. An empty map degrades the card, and `buildGenres`
 * already falls back to "Unknown" per id.
 *
 * Memoised at module scope for the lifetime of the process: `loadUserRows` is
 * called once per crew member as well as for the viewer, so without this a
 * single generation would hit TMDB once per collaborator. Only a non-empty
 * successful result is cached -- an empty genre list is not a real TMDB
 * answer, and caching it would pin "Unknown" on every genre for the life of
 * the process. A failed load caches nothing either, so a transient error is
 * retried rather than permanently degrading the card.
 */
let genreNameCache: Map<number, string> | null = null;

export async function loadGenreNames(): Promise<Map<number, string>> {
  if (genreNameCache) return genreNameCache;

  try {
    const [movieGenres, tvGenres] = await Promise.all([
      tmdbClient.getMovieGenres(),
      tmdbClient.getTVGenres(),
    ]);

    const names = new Map(
      [...movieGenres.genres, ...tvGenres.genres].map((genre) => [
        genre.id,
        genre.name,
      ]),
    );

    if (names.size > 0) {
      genreNameCache = names;
    }

    return names;
  } catch (error) {
    console.error("Series Finale: failed to load TMDB genre names", error);
    return new Map();
  }
}

/** Exists for tests: resets the module-scope genre-name memo. */
export function clearGenreNameCache(): void {
  genreNameCache = null;
}

/**
 * Maximum people on the crew leaderboard.
 *
 * A user on many shared lists with many collaborators would otherwise fan out
 * into an unbounded number of per-peer queries at generation time. The mock
 * shows five; eight leaves room without letting it grow.
 */
export const CREW_LIMIT = 8;

/**
 * Everyone who shares a list with this user and has not withdrawn from crew
 * comparisons, sorted and capped at `CREW_LIMIT`.
 *
 * The `share_stats_with_collaborators` filter is the consent boundary. It lives
 * in the query rather than a later filter so there is no path that loads a
 * withdrawn user's data at all. The first query yields list ids only, so it
 * needs no consent check; both queries that yield a person do.
 *
 * Sorted before capping so the same eight people are chosen on every
 * regeneration, rather than whichever eight the queries returned first.
 */
export async function loadCollaboratorIds(userId: string): Promise<string[]> {
  const ownedOrJoined = await db
    .selectDistinct({ listId: lists.id })
    .from(lists)
    .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
    .where(or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)));

  const listIds = ownedOrJoined.map((row) => row.listId);
  if (listIds.length === 0) return [];

  const owners = await db
    .selectDistinct({ userId: lists.ownerId })
    .from(lists)
    .innerJoin(users, eq(users.id, lists.ownerId))
    .where(
      and(
        inArray(lists.id, listIds),
        eq(users.shareStatsWithCollaborators, true),
      ),
    );

  const collaborators = await db
    .selectDistinct({ userId: listCollaborators.userId })
    .from(listCollaborators)
    .innerJoin(users, eq(users.id, listCollaborators.userId))
    .where(
      and(
        inArray(listCollaborators.listId, listIds),
        eq(users.shareStatsWithCollaborators, true),
      ),
    );

  const ids = new Set<string>();
  for (const row of [...owners, ...collaborators]) {
    if (row.userId !== userId) ids.add(row.userId);
  }

  return Array.from(ids).sort().slice(0, CREW_LIMIT);
}

/**
 * Crew totals and compare keys for every consenting collaborator.
 *
 * `window` must be the viewer's LOCALISED period (`localisePeriod` in
 * `./periods`) -- the same window the viewer's own rows were loaded with -- so
 * "the same period" means the same instants on both sides of the comparison.
 *
 * One fan-out: each collaborator's rows are loaded once and both slices are
 * derived from that load. Usernames come from a single query that re-applies
 * the consent filter at the point names are read; anyone it does not return
 * (withdrawn or deleted since their id was resolved) is skipped entirely, with
 * no rows loaded for them.
 *
 * Hours come from the runtime cache only. This deliberately does not call
 * `ensureSeasonsCached`: that would be live TMDB fan-out on someone else's
 * behalf, and the launch backfill already covers the shared cache.
 */
export async function loadCollaboratorSlices(
  userId: string,
  window: Period,
): Promise<{ crew: CrewMemberTotals[]; peers: ComparePeer[] }> {
  const collaboratorIds = await loadCollaboratorIds(userId);
  if (collaboratorIds.length === 0) return { crew: [], peers: [] };

  const profiles = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(
      and(
        inArray(users.id, collaboratorIds),
        eq(users.shareStatsWithCollaborators, true),
      ),
    );
  const usernames = new Map(
    profiles.map((profile) => [profile.id, profile.username]),
  );

  const inWindow = (at: Date) => at >= window.start && at < window.end;

  const crew: CrewMemberTotals[] = [];
  const peers: ComparePeer[] = [];

  for (const collaboratorId of collaboratorIds) {
    const username = usernames.get(collaboratorId);
    if (username === undefined) continue;

    const rows = await loadUserRows(collaboratorId, window);

    const lookup = await loadEpisodeRuntimes(rows.episodes);
    const { minutes } = summariseEpisodeRuntimes(rows.episodes, lookup);

    crew.push({
      userId: collaboratorId,
      username,
      episodes: rows.episodes.length,
      hours: Math.round(minutes / 60),
      topShowTmdbId: mostWatchedShow(rows.episodes),
    });

    // Completed and dropped are scoped to the window, like the viewer's side
    // in `buildCompare`, so the split compares one year against one year.
    // Planning is a present-tense list and stays unscoped on both sides.
    const keysWhere = (status: string, scoped: boolean) =>
      rows.statuses
        .filter(
          (row) => row.status === status && (!scoped || inWindow(row.updatedAt)),
        )
        .map((row) => titleKey(row.tmdbId, row.contentType));

    peers.push({
      userId: collaboratorId,
      username,
      completedKeys: keysWhere("completed", true),
      planningKeys: keysWhere("planning", false),
      droppedKeys: keysWhere("dropped", true),
    });
  }

  // Ties by username, compared by code unit rather than locale, so a
  // regeneration cannot reorder the leaderboard.
  crew.sort(
    (a, b) =>
      b.episodes - a.episodes ||
      (a.username < b.username ? -1 : a.username > b.username ? 1 : 0),
  );

  return { crew, peers };
}

/**
 * A collaborator's most-watched show, for the "also number one for" line on
 * the viewer's top-show card.
 *
 * A tie resolves to the lower tmdbId, matching `buildTopShow` in
 * `./aggregate`: the two ids are compared to fill `alsoTopFor`, so their
 * tie-breaks must agree.
 */
function mostWatchedShow(episodes: WatchedEpisodeRow[]): number | null {
  const counts = new Map<number, number>();
  for (const episode of episodes) {
    counts.set(episode.tmdbId, (counts.get(episode.tmdbId) ?? 0) + 1);
  }

  let topId: number | null = null;
  let topCount = 0;
  for (const [tmdbId, count] of counts) {
    if (
      count > topCount ||
      (count === topCount && topId !== null && tmdbId < topId)
    ) {
      topId = tmdbId;
      topCount = count;
    }
  }

  return topId;
}

/**
 * Set arithmetic between the viewer's completed titles and each peer's.
 *
 * Completed and dropped are scoped to `window` on the viewer's side here and
 * on the peer's side in `loadCollaboratorSlices`; planning is unscoped on
 * both.
 *
 * The two "fun fact" fields hold a display title, not a title key -- a
 * snapshot freezes them, and no renderer can do anything with `"tv:3"`. Both
 * candidate sets are drawn from the viewer's own statuses, so the viewer's
 * title map covers them; candidates are walked in sorted key order and the
 * first that resolves wins, so the pick is stable across regenerations.
 *
 * Rows are ordered by `both` descending, then username.
 */
export function buildCompare(
  mine: Pick<LoadedRows, "statuses" | "titles">,
  peers: ComparePeer[],
  window: Period,
): SeriesFinalePayload["compare"] {
  const inWindow = (at: Date) => at >= window.start && at < window.end;

  const myKeysWhere = (status: string, scoped: boolean) =>
    new Set(
      mine.statuses
        .filter(
          (row) => row.status === status && (!scoped || inWindow(row.updatedAt)),
        )
        .map((row) => titleKey(row.tmdbId, row.contentType)),
    );

  const myCompleted = myKeysWhere("completed", true);
  const myDropped = myKeysWhere("dropped", true);
  const myPlanning = myKeysWhere("planning", false);

  const firstTitle = (candidates: string[], mineOf: Set<string>) => {
    const matches = Array.from(new Set(candidates))
      .filter((key) => mineOf.has(key))
      .sort();
    for (const key of matches) {
      const meta = mine.titles.get(key);
      if (meta) return meta.title;
    }
    return null;
  };

  const rows = peers.map((peer) => {
    const theirCompleted = new Set(peer.completedKeys);

    let both = 0;
    for (const key of myCompleted) {
      if (theirCompleted.has(key)) both += 1;
    }

    return {
      userId: peer.userId,
      username: peer.username,
      onlyYou: myCompleted.size - both,
      both,
      onlyThem: theirCompleted.size - both,
      theyFinishedYouDropped: firstTitle(peer.completedKeys, myDropped),
      bothPlanningNeitherStarted: firstTitle(peer.planningKeys, myPlanning),
    };
  });

  // Most titles in common first, ties by username compared by code unit, so
  // `compare[0]` means "the person you overlap with most" and a regeneration
  // cannot reorder the list.
  return rows.sort(
    (a, b) =>
      b.both - a.both ||
      (a.username < b.username ? -1 : a.username > b.username ? 1 : 0),
  );
}

/**
 * Minimum qualifying snapshots before a percentile is reported.
 *
 * Generation is lazy, so the first user to generate has no cohort at all.
 * Below this, "top 4% of everyone on WatchThis" would describe a handful of
 * people, so the line is dropped rather than shown with a weak number behind it.
 */
export const PERCENTILE_COHORT_MINIMUM = 10;

/**
 * How closely a snapshot's period length must match the target's to join the
 * cohort.
 *
 * The cohort spans periods -- a year is a year, and restricting to one period
 * starves it for no benefit. But the seasonal cut on the roadmap would
 * otherwise pool three-month totals with twelve-month ones and make the figure
 * meaningless. Inert while every period is a calendar year.
 */
export const PERCENTILE_LENGTH_TOLERANCE = 0.1;

/**
 * Where `minutes` falls in `cohortMinutes`, as a "top N%" figure. Lower is
 * better: 1 means the top one percent.
 */
export function percentileOf(
  minutes: number,
  cohortMinutes: number[],
): number | null {
  if (cohortMinutes.length < PERCENTILE_COHORT_MINIMUM) return null;

  const below = cohortMinutes.filter((value) => value < minutes).length;
  const share = below / cohortMinutes.length;

  // Clamp to 1 so a top scorer reads "top 1%" rather than "top 0%".
  return Math.max(1, Math.round((1 - share) * 100));
}

/**
 * Headline minutes from every snapshot of a comparable period length, across
 * all periods, excluding the generating user's own snapshot of this exact
 * period.
 *
 * `period` must be the CANONICAL period -- the UTC calendar year from
 * `calendarYearPeriod`, not a localised window. The length guard below
 * compares it against the stored `period_start`/`period_end`, which are
 * themselves canonical; handing this a localised period would compare
 * localised bounds against canonical ones and mis-measure the length for
 * every non-UTC user.
 *
 * Only the computed minutes figure is selected, never the payload -- pulling
 * every snapshot's full jsonb (crew, timelines, shame lists...) across the
 * whole table to read one number apiece does not scale with the table.
 *
 * The exclusion is a `where` clause, not a post-filter: a regeneration would
 * otherwise rank the user against their own previous snapshot of the same
 * year. Their OTHER years stay in the cohort -- a year is a year, regardless
 * of whose it is.
 *
 * Thin snapshots (`payload.thin`) are left out -- ruling F4, reversible by
 * deleting that one clause. The list route generates every available year,
 * including dormant gap years and churned users' years at or near zero
 * minutes; left in, they would inflate every active user's "top N%", and that
 * figure is frozen at generation. The cohort is people who actually watched
 * that year.
 */
export async function loadCohortMinutes(
  period: Period,
  excludeUserId: string,
): Promise<number[]> {
  const targetLength = period.end.getTime() - period.start.getTime();

  const rows = await db
    .select({
      minutes: sql<number | null>`(${seriesFinale.payload}->'headline'->>'minutes')::int`,
      periodStart: seriesFinale.periodStart,
      periodEnd: seriesFinale.periodEnd,
    })
    .from(seriesFinale)
    .where(
      and(
        eq(seriesFinale.schemaVersion, SERIES_FINALE_SCHEMA_VERSION),
        sql`${seriesFinale.payload}->>'thin' IS DISTINCT FROM 'true'`,
        not(
          and(
            eq(seriesFinale.userId, excludeUserId),
            eq(seriesFinale.periodStart, period.start),
            eq(seriesFinale.periodEnd, period.end),
          )!,
        ),
      ),
    );

  return rows
    .filter((row) => {
      const length = row.periodEnd.getTime() - row.periodStart.getTime();
      return (
        Math.abs(length - targetLength) / targetLength <=
        PERCENTILE_LENGTH_TOLERANCE
      );
    })
    .map((row) => row.minutes)
    .filter((minutes): minutes is number => minutes !== null);
}

/**
 * Crew members whose most-watched show of the period is `topShowTmdbId`, by
 * username, for the "also number one for" line on the viewer's top-show card.
 *
 * A viewer with no top show gets nobody -- not every crew member who also has
 * none.
 */
export function alsoTopForOf(
  crew: CrewMemberTotals[],
  topShowTmdbId: number | null,
): string[] {
  if (topShowTmdbId === null) return [];

  return crew
    .filter((member) => member.topShowTmdbId === topShowTmdbId)
    .map((member) => member.username);
}

/**
 * Title keys on every list the user shares with someone else: lists they own
 * that have a collaborator, and lists they were invited onto. The engine
 * intersects these with the period's completions for the group-watcher
 * archetype.
 *
 * Both directions matter. Owner-only would count everything on a list the
 * user joined as solo watching, understating exactly the users the archetype
 * is for. Each joined row pairs an owner with a collaborator, and requiring
 * the two to differ keeps a list that only "shares" with its own owner out.
 */
export async function loadCollaborativeTitleKeys(
  userId: string,
): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({
      tmdbId: listItems.tmdbId,
      contentType: listItems.contentType,
    })
    .from(listItems)
    .innerJoin(lists, eq(lists.id, listItems.listId))
    .innerJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
    .where(
      and(
        or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)),
        ne(listCollaborators.userId, lists.ownerId),
      ),
    );

  return new Set(
    rows.map((row) => titleKey(row.tmdbId, row.contentType as "movie" | "tv")),
  );
}

/**
 * The user's earliest recorded activity: the first watched episode or the
 * first status row, whichever came first. Null for a user with neither.
 *
 * `min` skips null `watched_at` values, so an undated watched row cannot pull
 * the first year back to the epoch.
 */
export async function loadFirstActivity(userId: string): Promise<Date | null> {
  const [firstWatch] = await db
    .select({ first: min(episodeWatchStatus.watchedAt) })
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.watched, true),
      ),
    );

  const [firstStatus] = await db
    .select({ first: min(userContentStatus.createdAt) })
    .from(userContentStatus)
    .where(eq(userContentStatus.userId, userId));

  const candidates = [firstWatch?.first, firstStatus?.first].filter(
    (at): at is Date => at != null,
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((earliest, at) => (at < earliest ? at : earliest));
}

/**
 * The user's zone, and the instant their recaps start from: the LATER of their
 * first activity and their account's creation. `start` is null for a user with
 * no activity at all. Read once per public call, never per step, and the one
 * source of availability for both `getOrGenerateSnapshot`'s gate and
 * `listAvailableSnapshots` -- two gates that disagreed would list a year the
 * payload route then refuses, or serve one the list never offers.
 *
 * Why the account floor (ruling F1): imports stamp history with whatever dates
 * the source had, and the SeriesGuide converter uses each episode's AIR date.
 * An importer whose history includes Friends would otherwise have a first
 * activity in 1994 and get ~30 recaps of air dates presented as watches, each
 * frozen into the percentile cohort. The cost is that someone who imported
 * genuine watch timestamps from another tracker gets no recaps for the years
 * before they joined.
 *
 * A user who joined first and watched later still starts at their first
 * watch; there is nothing to recap before it.
 */
async function loadRecapStart(
  userId: string,
): Promise<{ zone: string; start: Date | null }> {
  const [user] = await db
    .select({ timezone: users.timezone, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const zone = resolveTimeZone(user?.timezone);

  const firstActivity = await loadFirstActivity(userId);
  if (firstActivity === null) return { zone, start: null };

  const joinedAt = user?.createdAt;
  return {
    zone,
    start: joinedAt && joinedAt > firstActivity ? joinedAt : firstActivity,
  };
}

/** The user's zone, validated. Read once per public call, never per step. */
async function loadTimeZone(userId: string): Promise<string> {
  const [user] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return resolveTimeZone(user?.timezone);
}

/**
 * Compute and freeze a recap for one user and period.
 *
 * `period` is the CANONICAL period (`calendarYearPeriod`): it is the row's
 * identity and the cohort's argument. Everything the user lived -- their rows,
 * the completed-film filter, their collaborators' slices and the compare sets
 * -- is loaded over the period localised to their zone, so the frozen
 * `payload.period` records the local bounds while the row is keyed by the
 * canonical ones.
 *
 * Idempotent on `(user_id, period_start, period_end)` -- regenerating replaces
 * the row. Nothing else may write to `series_finale`; a read path that
 * recomputes would defeat the entire point of snapshotting.
 *
 * Does not check that the period is over or that the user was active in it;
 * `getOrGenerateSnapshot` is the gated entry point.
 */
export async function generateSnapshot(
  userId: string,
  period: Period,
  now: Date = new Date(),
): Promise<SeriesFinalePayload> {
  return generateInZone(userId, period, await loadTimeZone(userId), now);
}

/**
 * The distinct (show, season) pairs holding at least one episode with NO entry
 * in `lookup`. An entry whose runtime is null is not missing: it means TMDB
 * was asked and does not know, and asking again will not change that (see
 * `RuntimeLookup`).
 */
function seasonsMissingFrom(
  episodes: WatchedEpisodeRow[],
  lookup: RuntimeLookup,
): SeasonKey[] {
  const missing = new Map<string, SeasonKey>();
  for (const episode of episodes) {
    if (lookup.has(episodeKeyOf(episode))) continue;
    missing.set(`${episode.tmdbId}:${episode.seasonNumber}`, {
      tmdbId: episode.tmdbId,
      seasonNumber: episode.seasonNumber,
    });
  }

  return Array.from(missing.values());
}

async function generateInZone(
  userId: string,
  period: Period,
  zone: string,
  now: Date,
): Promise<SeriesFinalePayload> {
  const window = localisePeriod(period, zone);

  const rows = await loadUserRows(userId, window);

  // Only seasons with a watched episode the cache has never heard of are
  // handed to TMDB. A cached season is never refetched here, however old its
  // fetch record: the spec says generation does not block on live fetches for
  // seasons already recorded, and a heavy user's year spans hundreds of
  // seasons at 250 ms apiece. Keeping cached seasons fresh is the backfill's
  // job, not a user-facing request's.
  let episodeRuntimeLookup = await loadEpisodeRuntimes(rows.episodes);
  const uncachedSeasons = seasonsMissingFrom(rows.episodes, episodeRuntimeLookup);
  if (uncachedSeasons.length > 0) {
    const { fetched } = await ensureSeasonsCached(uncachedSeasons);
    if (fetched > 0) {
      episodeRuntimeLookup = await loadEpisodeRuntimes(rows.episodes);
    }
  }

  const episodeMinutes = summariseEpisodeRuntimes(
    rows.episodes,
    episodeRuntimeLookup,
  );

  const completedFilmIds = rows.statuses
    .filter(
      (row) =>
        row.contentType === "movie" &&
        row.status === "completed" &&
        row.updatedAt >= window.start &&
        row.updatedAt < window.end,
    )
    .map((row) => row.tmdbId);
  const filmRuntimeLookup = await loadFilmRuntimes(completedFilmIds);
  const filmMinutes = summariseFilmRuntimes(completedFilmIds, filmRuntimeLookup);

  const { crew, peers } = await loadCollaboratorSlices(userId, window);
  const collaborativeCompletedKeys = await loadCollaborativeTitleKeys(userId);
  const cohortMinutes = await loadCohortMinutes(period, userId);

  const draft = buildPayload(
    {
      period: window,
      timeZone: zone,
      episodes: rows.episodes,
      statuses: rows.statuses,
      titles: rows.titles,
      genreNames: rows.genreNames,
      episodeMinutes,
      filmMinutes,
      episodeRuntimeLookup,
      collaborativeCompletedKeys,
      crew,
      peers,
      percentile: null,
    },
    now,
  );

  // The engine owns the minutes total, so the percentile is ranked against the
  // figure it produced rather than a second sum computed here.
  const payload: SeriesFinalePayload = {
    ...draft,
    headline: {
      ...draft.headline,
      percentile: percentileOf(draft.headline.minutes, cohortMinutes),
    },
    // The pure engine cannot know about other users, so the cross-user line on
    // the top-show card is filled here.
    topShow: draft.topShow
      ? { ...draft.topShow, alsoTopFor: alsoTopForOf(crew, draft.topShow.tmdbId) }
      : null,
    compare: buildCompare(rows, peers, window),
  };

  await db
    .insert(seriesFinale)
    .values({
      userId,
      periodStart: period.start,
      periodEnd: period.end,
      periodLabel: period.label,
      payload,
      schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
      generatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        seriesFinale.userId,
        seriesFinale.periodStart,
        seriesFinale.periodEnd,
      ],
      set: {
        periodLabel: period.label,
        payload,
        schemaVersion: SERIES_FINALE_SCHEMA_VERSION,
        generatedAt: now,
      },
    });

  return payload;
}

/**
 * Read a stored snapshot, generating one only if absent or written against an
 * older payload shape -- and then only for a period the user can have a recap
 * of. Null means "no such recap", and every caller has to say what that looks
 * like.
 *
 * `period` is the canonical period. A stored row at the current schema
 * version is returned without any availability check: it is already a fact.
 * Otherwise the period must be one of the user's completed years since their
 * recaps start (`loadRecapStart`), judged in their own zone -- anything else would freeze an empty 1950 into the
 * percentile cohort, or freeze a year that has not yet ended where they live.
 */
export async function getOrGenerateSnapshot(
  userId: string,
  period: Period,
  now: Date = new Date(),
): Promise<SeriesFinalePayload | null> {
  const [existing] = await db
    .select({
      payload: seriesFinale.payload,
      schemaVersion: seriesFinale.schemaVersion,
    })
    .from(seriesFinale)
    .where(
      and(
        eq(seriesFinale.userId, userId),
        eq(seriesFinale.periodStart, period.start),
        eq(seriesFinale.periodEnd, period.end),
      ),
    )
    .limit(1);

  if (existing && existing.schemaVersion === SERIES_FINALE_SCHEMA_VERSION) {
    return withholdWithdrawnCollaborators(
      existing.payload as SeriesFinalePayload,
    );
  }

  const { zone, start } = await loadRecapStart(userId);
  if (start === null) return null;

  const available = completedYearsBetween(start, now, zone).some(
    (candidate) =>
      candidate.start.getTime() === period.start.getTime() &&
      candidate.end.getTime() === period.end.getTime(),
  );
  if (!available) return null;

  return generateInZone(userId, period, zone, now);
}

/**
 * Remove, from a frozen payload, every collaborator who has since withdrawn
 * from crew comparisons or no longer exists.
 *
 * This is not a recompute, and it does not breach "no read path may
 * recompute". It only ever REMOVES other people's data, applying privacy rule
 * 1 -- a standing rule -- at the moment of reading. The viewer's own numbers
 * are returned exactly as frozen: headline, top show, rhythm and the rest are
 * untouched, including crew-derived facts about the viewer, because those
 * describe the viewer's year. Without this, withdrawing would withdraw nothing
 * already written, and a collaborator's name and totals would sit in other
 * people's recaps forever.
 *
 * One query over the ids present, and none at all when there are none.
 * `alsoTopFor` holds usernames, so it keeps only the names of crew members
 * that survived -- the frozen crew carries the id/username pairs that were
 * true when it was written.
 */
async function withholdWithdrawnCollaborators(
  payload: SeriesFinalePayload,
): Promise<SeriesFinalePayload> {
  const ids = Array.from(
    new Set([
      ...payload.crew.map((member) => member.userId),
      ...payload.compare.map((row) => row.userId),
    ]),
  );
  if (ids.length === 0) return payload;

  const consenting = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(inArray(users.id, ids), eq(users.shareStatsWithCollaborators, true)),
    );
  const kept = new Set(consenting.map((row) => row.id));

  const crew = payload.crew.filter((member) => kept.has(member.userId));
  const keptNames = new Set(crew.map((member) => member.username));

  return {
    ...payload,
    crew,
    compare: payload.compare.filter((row) => kept.has(row.userId)),
    topShow: payload.topShow
      ? {
          ...payload.topShow,
          alsoTopFor: payload.topShow.alsoTopFor.filter((name) =>
            keptNames.has(name),
          ),
        }
      : null,
  };
}

/**
 * How long `listAvailableSnapshots` keeps generating older missing years in
 * one request (ruling F2). The newest missing year is always generated; older
 * ones only while the request has spent less than this. The rest catch up on
 * later loads, so a long-history user's archive fills over a few dashboard
 * visits instead of one very slow one.
 */
export const LIST_GENERATION_BUDGET_MS = 5000;

/**
 * In-flight listings, keyed by user id, so concurrent calls for one user in
 * this process share one run instead of each generating the same years.
 *
 * This does NOT dedupe across processes: two serverless instances serving the
 * same user will both generate. What keeps that correct is the upsert on
 * `(user_id, period_start, period_end)` in `generateInZone` -- the second
 * write replaces the first. This map only saves the duplicated work within
 * one process.
 */
const inFlightListings = new Map<string, ReturnType<typeof listSnapshots>>();

/**
 * Every period available to the user -- from where their recaps start (see
 * `loadRecapStart`) through the last completed year in their own zone --
 * generating snapshots that are missing or were written against an older
 * payload shape, then returning the listing.
 *
 * This is the route the dashboard banner and profile rows read (plan 4's only
 * entry point into the feature), and nothing else generates a snapshot except
 * opening a recap page. Without this, no user would ever see a recap: the
 * banner would have nothing to show and nothing to click. So this list
 * generates rather than reporting only what already happens to exist.
 *
 * Generation runs sequentially, newest first, and never in parallel -- each
 * generation fans out to TMDB and to up to eight collaborators, and running
 * several at once would multiply that fan-out against the same rate limits
 * for one request.
 *
 * Per-request work is bounded: the newest missing year is always generated,
 * older ones only within `LIST_GENERATION_BUDGET_MS`, so the listing can come
 * back without some older years that a later call will fill in. Concurrent
 * calls for the same user share one run (see `inFlightListings`).
 *
 * `clock` measures the budget and nothing else, and is injectable so tests
 * can move time deterministically. `now` still decides which years are over.
 */
export function listAvailableSnapshots(
  userId: string,
  now: Date = new Date(),
  clock: () => number = Date.now,
): ReturnType<typeof listSnapshots> {
  const pending = inFlightListings.get(userId);
  if (pending) return pending;

  const listing = generateAndList(userId, now, clock).finally(() => {
    inFlightListings.delete(userId);
  });
  inFlightListings.set(userId, listing);
  return listing;
}

async function generateAndList(
  userId: string,
  now: Date,
  clock: () => number,
): ReturnType<typeof listSnapshots> {
  const { zone, start } = await loadRecapStart(userId);
  if (start === null) return listSnapshots(userId);

  const available = completedYearsBetween(start, now, zone);

  const stored = await db
    .select({
      periodStart: seriesFinale.periodStart,
      periodEnd: seriesFinale.periodEnd,
      schemaVersion: seriesFinale.schemaVersion,
    })
    .from(seriesFinale)
    .where(eq(seriesFinale.userId, userId));

  const startedAt = clock();
  let generated = 0;

  for (const period of available) {
    const row = stored.find(
      (candidate) =>
        candidate.periodStart.getTime() === period.start.getTime() &&
        candidate.periodEnd.getTime() === period.end.getTime(),
    );
    if (row && row.schemaVersion >= SERIES_FINALE_SCHEMA_VERSION) continue;

    if (generated > 0 && clock() - startedAt >= LIST_GENERATION_BUDGET_MS) {
      break;
    }

    await generateInZone(userId, period, zone, now);
    generated += 1;
  }

  return listSnapshots(userId);
}

/** Every generated period for a user, newest first. */
export async function listSnapshots(userId: string): Promise<
  {
    label: string;
    generatedAt: Date;
    dismissedAt: Date | null;
    headline: SeriesFinalePayload["headline"];
  }[]
> {
  const rows = await db
    .select({
      periodLabel: seriesFinale.periodLabel,
      generatedAt: seriesFinale.generatedAt,
      dismissedAt: seriesFinale.dismissedAt,
      payload: seriesFinale.payload,
    })
    .from(seriesFinale)
    .where(eq(seriesFinale.userId, userId))
    .orderBy(desc(seriesFinale.periodStart));

  return rows.map((row) => ({
    label: row.periodLabel,
    generatedAt: row.generatedAt,
    dismissedAt: row.dismissedAt,
    headline: (row.payload as SeriesFinalePayload).headline,
  }));
}
