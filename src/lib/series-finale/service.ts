import { and, eq, gte, inArray, lt, not, or, sql } from "drizzle-orm";

import { db } from "../db";
import {
  episodeWatchStatus,
  listCollaborators,
  lists,
  seriesFinale,
  tmdbCache,
  userContentStatus,
  users,
} from "../db/schema";
import { tmdbClient } from "../tmdb/client";
import type { Period } from "./periods";
import { loadEpisodeRuntimes, summariseEpisodeRuntimes } from "./runtime";
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

  return peers.map((peer) => {
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
