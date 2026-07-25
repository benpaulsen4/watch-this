import { and, eq, or, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  activityFeed,
  ActivityType,
  ContentType,
  episodeWatchStatus,
  listCollaborators,
  listItems,
  lists,
  PermissionLevel,
  showSchedules,
  userContentStatus,
  users,
  WatchStatus,
  WatchStatusEnum,
} from "@/lib/db/schema";
import {
  DEFAULT_TIME_ZONE,
  getTimezoneDateKey,
  resolveTimeZone,
} from "@/lib/time";
import type { TMDBTVShowDetails } from "@/lib/tmdb/client";
import { tmdbClient } from "@/lib/tmdb/client";

import { syncStatusToCollaborators } from "../activity/activityUtils";

/** A Drizzle query executor: either the top-level `db` or a transaction handle. */
type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

type TVShowProgressState = {
  nextEpisodeDate: Date | null;
  shouldMarkCompleted: boolean;
};

export type EpisodeSelection = {
  seasonNumber: number;
  episodeNumber: number;
  watched: boolean;
};

/**
 * TMDB air dates are bare calendar days ("2026-07-21"). Parsing them with
 * `new Date()` pins them to UTC midnight, which is up to a day away from the
 * calendar day the viewer actually experienced (LOGIC-15). Keep bare dates as
 * calendar keys so they can be compared against the viewer's local day, and
 * return null for missing/unparseable values (LOGIC-11).
 *
 * A value that carries a time (or an offset) is a real instant, so it has to be
 * resolved in the *viewer's* zone: resolving it in UTC and then comparing the
 * result against a key built from the viewer's zone mixes two calendars in one
 * comparison, which is exactly the bug LOGIC-15 exists to fix.
 */
export function getAirDateKey(
  airDate: string | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
): string | null {
  if (!airDate) return null;

  const trimmed = airDate.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  return getTimezoneDateKey(parsed, timeZone);
}

/**
 * True only when the episode's air date is known and is on or before the
 * viewer's current local day. A missing or unparseable date counts as
 * not aired, so an episode with no air date can never be marked watched.
 */
export function hasAired(
  airDate: string | null | undefined,
  now: Date,
  timeZone: string,
): boolean {
  const airDateKey = getAirDateKey(airDate, timeZone);
  if (!airDateKey) return false;

  return airDateKey <= getTimezoneDateKey(now, timeZone);
}

/**
 * Load the user's configured timezone so date decisions in the episode paths
 * use the calendar the user actually experiences rather than server-local
 * time (DATA-10). Never throws — falls back to UTC.
 *
 * TODO(FOLLOW-UP): DATA-10 content-status watchedAt — the same threading is
 * still missing from `src/lib/content-status/service.ts`, which stamps its
 * `watchedAt` values from server-local `new Date()` without consulting the
 * user's timezone. That file is owned by a separate change.
 */
export async function getUserTimeZone(userId: string): Promise<string> {
  try {
    const rows = await db
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return resolveTimeZone(rows?.[0]?.timezone);
  } catch (error) {
    console.error("Error loading user timezone:", error);
    return DEFAULT_TIME_ZONE;
  }
}

function parseNextEpisodeDate(
  airDate: string | null | undefined,
): Date | null {
  if (!airDate) return null;

  const parsed = new Date(airDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function areDatesEqual(
  left: Date | null | undefined,
  right: Date | null | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;

  return left.getTime() === right.getTime();
}

async function getTVShowProgressState(
  userId: string,
  tmdbId: number,
  timeZone: string,
  preloadedShowDetails?: TMDBTVShowDetails,
): Promise<TVShowProgressState> {
  const showDetails =
    preloadedShowDetails ?? (await tmdbClient.getTVShowDetails(tmdbId));
  const nextEpisodeDate = parseNextEpisodeDate(
    showDetails.next_episode_to_air?.air_date,
  );
  const lastEpisodeToAir = showDetails.last_episode_to_air;

  if (!lastEpisodeToAir) {
    return {
      nextEpisodeDate,
      shouldMarkCompleted: nextEpisodeDate === null,
    };
  }

  const watchedEpisodes = await db
    .select({
      seasonNumber: episodeWatchStatus.seasonNumber,
      episodeNumber: episodeWatchStatus.episodeNumber,
    })
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, tmdbId),
        eq(episodeWatchStatus.watched, true),
      ),
    );

  const watchedEpisodeSet = new Set(
    watchedEpisodes.map(
      (episode) => `${episode.seasonNumber}-${episode.episodeNumber}`,
    ),
  );

  // LOGIC-01: TMDB files previews and pilot specials under season 0, so
  // `last_episode_to_air.season_number` can legitimately be 0. Building
  // 1..0 produces an empty season list, and an empty list is "fully watched"
  // vacuously — the show would flip to completed with nothing watched and
  // lose every schedule. Fall back to the season that actually contains the
  // last aired episode.
  const lastSeasonNumber = Math.max(lastEpisodeToAir.season_number, 0);
  const targetSeasonNumbers = Array.from(
    { length: lastSeasonNumber },
    (_, index) => index + 1,
  );
  if (!targetSeasonNumbers.length) {
    // Clamped, not raw: a negative `season_number` would otherwise slip past
    // the `Math.max` guard above and be fetched verbatim.
    targetSeasonNumbers.push(lastSeasonNumber);
  }

  const seasonDetailsList = await Promise.all(
    targetSeasonNumbers.map(async (seasonNumber) => ({
      seasonNumber,
      details: await tmdbClient.getTVSeasonDetails(tmdbId, seasonNumber),
    })),
  );

  const now = new Date();
  let airedEpisodeCount = 0;
  let unwatchedAiredEpisodeCount = 0;

  for (const { seasonNumber, details } of seasonDetailsList) {
    for (const episode of details.episodes ?? []) {
      // Unknown or future air dates cannot block completion.
      if (!hasAired(episode.air_date, now, timeZone)) continue;

      // TMDB can list episodes past the one it reports as last-aired.
      if (
        seasonNumber === lastEpisodeToAir.season_number &&
        episode.episode_number > lastEpisodeToAir.episode_number
      ) {
        continue;
      }

      airedEpisodeCount += 1;
      if (
        !watchedEpisodeSet.has(`${seasonNumber}-${episode.episode_number}`)
      ) {
        unwatchedAiredEpisodeCount += 1;
      }
    }
  }

  // Never conclude "fully watched" from an empty set of episodes — that is the
  // vacuous truth that LOGIC-01 turned into instant completion.
  const allAvailableEpisodesWatched =
    airedEpisodeCount > 0 && unwatchedAiredEpisodeCount === 0;

  if (!allAvailableEpisodesWatched) {
    return {
      nextEpisodeDate: null,
      shouldMarkCompleted: false,
    };
  }

  if (!nextEpisodeDate) {
    return {
      nextEpisodeDate: null,
      shouldMarkCompleted: true,
    };
  }

  const inOneMonth = new Date();
  inOneMonth.setMonth(inOneMonth.getMonth() + 1);

  return {
    nextEpisodeDate,
    shouldMarkCompleted: nextEpisodeDate > inOneMonth,
  };
}

/**
 * Resolve the sync-enabled lists this user may drive writes for, deduplicated
 * by list id. The join against `list_collaborators` fans out one row per
 * collaborator, so without this the caller repeats identical work N times
 * (DATA-05). Mirrors the `Map` approach in `src/lib/schedules/service.ts`.
 */
async function getSyncEnabledListsForUser(
  userId: string,
  tmdbId: number,
  executor: DbExecutor,
): Promise<Array<{ listId: string; ownerId: string }>> {
  const rows = await executor
    .select({
      listId: lists.id,
      ownerId: lists.ownerId,
    })
    .from(lists)
    .innerJoin(listItems, eq(listItems.listId, lists.id))
    .leftJoin(listCollaborators, eq(listCollaborators.listId, lists.id))
    .where(
      and(
        eq(lists.syncWatchStatus, true),
        eq(listItems.tmdbId, tmdbId),
        eq(listItems.contentType, ContentType.TV),
        // Only the owner or a COLLABORATOR (write-capable) may drive a sync;
        // a read-only viewer must not overwrite other members' episode
        // statuses or delete their schedules.
        or(
          eq(lists.ownerId, userId),
          and(
            eq(listCollaborators.userId, userId),
            eq(listCollaborators.permissionLevel, PermissionLevel.COLLABORATOR),
          ),
        ),
      ),
    );

  const uniqueLists = new Map<string, { listId: string; ownerId: string }>();
  for (const row of rows) {
    if (!uniqueLists.has(row.listId)) {
      uniqueLists.set(row.listId, {
        listId: row.listId,
        ownerId: row.ownerId,
      });
    }
  }

  return Array.from(uniqueLists.values());
}

function dedupeEpisodeSelections(
  episodes: EpisodeSelection[],
): EpisodeSelection[] {
  // A single upsert statement cannot touch the same conflict target twice,
  // and the last instruction for an episode is the one the user meant.
  const byKey = new Map<string, EpisodeSelection>();
  for (const episode of episodes) {
    byKey.set(`${episode.seasonNumber}-${episode.episodeNumber}`, episode);
  }

  return Array.from(byKey.values());
}

/**
 * Sync episode statuses to collaborators in shared lists.
 */
export async function syncEpisodeStatusesToCollaborators(
  userId: string,
  tmdbId: number,
  episodes: EpisodeSelection[],
  executor: DbExecutor = db,
): Promise<string[]> {
  const targetEpisodes = dedupeEpisodeSelections(episodes);
  if (targetEpisodes.length === 0) return [];

  try {
    const syncEnabledLists = await getSyncEnabledListsForUser(
      userId,
      tmdbId,
      executor,
    );

    const syncedCollaboratorIds = new Set<string>();

    // TODO(FOLLOW-UP): collaborators are written to without an opt-in/
    // acceptance step (see syncStatusToCollaborators and PR API-02 notes).

    for (const list of syncEnabledLists) {
      // Get all collaborators (including owner) for this list
      const collaborators = await executor
        .select({ userId: listCollaborators.userId })
        .from(listCollaborators)
        .where(eq(listCollaborators.listId, list.listId));

      // Add the owner to the collaborators list
      const allUsers = [
        ...collaborators.map((c) => c.userId),
        list.ownerId,
      ].filter((id) => id !== userId); // Exclude the user who made the update

      for (const collaboratorId of allUsers) {
        if (syncedCollaboratorIds.has(collaboratorId)) continue;

        const now = new Date();
        await executor
          .insert(episodeWatchStatus)
          .values(
            targetEpisodes.map((episode) => ({
              userId: collaboratorId,
              tmdbId,
              seasonNumber: episode.seasonNumber,
              episodeNumber: episode.episodeNumber,
              watched: episode.watched,
              watchedAt: episode.watched ? now : null,
            })),
          )
          .onConflictDoUpdate({
            target: [
              episodeWatchStatus.userId,
              episodeWatchStatus.tmdbId,
              episodeWatchStatus.seasonNumber,
              episodeWatchStatus.episodeNumber,
            ],
            set: {
              watched: sql`excluded.watched`,
              watchedAt: sql`excluded.watched_at`,
              updatedAt: now,
            },
          });

        syncedCollaboratorIds.add(collaboratorId);
      }
    }

    return Array.from(syncedCollaboratorIds);
  } catch (error) {
    console.error("Error syncing episode status to collaborators:", error);
    // Don't throw error to avoid breaking the main status update
    return [];
  }
}

/**
 * Sync a single episode's status to collaborators in shared lists.
 */
export async function syncEpisodeStatusToCollaborators(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean,
): Promise<string[]> {
  return syncEpisodeStatusesToCollaborators(userId, tmdbId, [
    { seasonNumber, episodeNumber, watched },
  ]);
}

/**
 * Update or create episode watch status
 */
export async function updateEpisodeWatchStatus(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean,
) {
  // Check if episode status already exists
  const existingStatus = await db
    .select()
    .from(episodeWatchStatus)
    .where(
      and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, tmdbId),
        eq(episodeWatchStatus.seasonNumber, seasonNumber),
        eq(episodeWatchStatus.episodeNumber, episodeNumber),
      ),
    )
    .limit(1);

  let result;
  if (existingStatus.length > 0) {
    // Update existing status
    [result] = await db
      .update(episodeWatchStatus)
      .set({
        watched,
        watchedAt: watched ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(episodeWatchStatus.userId, userId),
          eq(episodeWatchStatus.tmdbId, tmdbId),
          eq(episodeWatchStatus.seasonNumber, seasonNumber),
          eq(episodeWatchStatus.episodeNumber, episodeNumber),
        ),
      )
      .returning();
  } else {
    // Create new status
    [result] = await db
      .insert(episodeWatchStatus)
      .values({
        userId,
        tmdbId,
        seasonNumber,
        episodeNumber,
        watched,
        watchedAt: watched ? new Date() : null,
      })
      .returning();
  }

  return result;
}

/**
 * Create activity entry for episode progress
 */
export async function createEpisodeActivityEntry(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean,
  syncedCollaboratorIds: string[],
  episodeName?: string,
  options?: {
    showDetails?: TMDBTVShowDetails;
    episodeCount?: number;
    executor?: DbExecutor;
  },
) {
  try {
    const showDetails =
      options?.showDetails ?? (await tmdbClient.getTVShowDetails(tmdbId));
    const executor = options?.executor ?? db;

    await executor.insert(activityFeed).values({
      userId,
      activityType: ActivityType.EPISODE_PROGRESS,
      tmdbId,
      contentType: ContentType.TV,
      metadata: {
        seasonNumber,
        episodeNumber,
        watched,
        title: showDetails.name,
        posterPath: showDetails.poster_path,
        ...(episodeName && { episodeName }),
        ...(options?.episodeCount && options.episodeCount > 1
          ? { episodeCount: options.episodeCount }
          : {}),
      },
      collaborators: syncedCollaboratorIds,
      isCollaborative: syncedCollaboratorIds.length > 0,
    });
  } catch (activityError) {
    console.error("Error creating episode activity entry:", activityError);
    // Don't fail the main operation if activity creation fails
  }
}

/**
 * Update TV show content status based on episode progress
 */
export async function updateTVShowStatus(
  userId: string,
  tmdbId: number,
  _seasonNumber: number,
  _episodeNumber: number,
  watched: boolean,
  options?: {
    timeZone?: string;
    showDetails?: TMDBTVShowDetails;
  },
): Promise<WatchStatusEnum | null> {
  const timeZone = options?.timeZone ?? (await getUserTimeZone(userId));

  const contentStatus = await db
    .select()
    .from(userContentStatus)
    .where(
      and(
        eq(userContentStatus.userId, userId),
        eq(userContentStatus.tmdbId, tmdbId),
        eq(userContentStatus.contentType, ContentType.TV),
      ),
    )
    .limit(1);

  // LOGIC-02: un-marking an episode has to recompute the show status too,
  // otherwise a mis-clicked finale leaves the show stuck on `completed` with
  // its schedules already deleted and no UI path back. The only case an
  // unwatch must not act on is a show that has no status row at all — there
  // is nothing to downgrade and no reason to start tracking it.
  if (contentStatus.length === 0 && !watched) {
    return null;
  }

  let newStatus: WatchStatusEnum | null = null;
  const progressState = await getTVShowProgressState(
    userId,
    tmdbId,
    timeZone,
    options?.showDetails,
  );
  const existingStatus = contentStatus[0] ?? null;
  const shouldMarkCompleted = progressState.shouldMarkCompleted;

  if (contentStatus.length === 0) {
    await db.insert(userContentStatus).values({
      userId,
      tmdbId,
      contentType: ContentType.TV,
      status: shouldMarkCompleted ? WatchStatus.COMPLETED : WatchStatus.WATCHING,
      nextEpisodeDate: progressState.nextEpisodeDate,
    });
    newStatus = shouldMarkCompleted
      ? WatchStatus.COMPLETED
      : WatchStatus.WATCHING;
  } else if (shouldMarkCompleted) {
    if (existingStatus.status !== WatchStatus.COMPLETED) {
      await db
        .update(userContentStatus)
        .set({
          status: WatchStatus.COMPLETED,
          updatedAt: new Date(),
          nextEpisodeDate: progressState.nextEpisodeDate,
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, ContentType.TV),
          ),
        );
      newStatus = WatchStatus.COMPLETED;
    } else if (
      !areDatesEqual(existingStatus.nextEpisodeDate, progressState.nextEpisodeDate)
    ) {
      await db
        .update(userContentStatus)
        .set({
          nextEpisodeDate: progressState.nextEpisodeDate,
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, ContentType.TV),
          ),
        );
    }

    // TODO(FOLLOW-UP): LOGIC-06 — completing a show hard-deletes its
    // schedules, which is unrecoverable because `createSchedule` refuses
    // completed shows. These should be soft-disabled (a `disabled` /
    // `disabledAt` column) so re-opening a show restores its schedule.
    // That needs a schema change and is owned by a separate change.
    try {
      const deletedSchedules = await db
        .delete(showSchedules)
        .where(
          and(eq(showSchedules.userId, userId), eq(showSchedules.tmdbId, tmdbId)),
        )
        .returning();

      if (deletedSchedules.length > 0) {
        console.info(
          `Automatically removed ${deletedSchedules.length} schedule(s) for completed show ${tmdbId}`,
        );
      }
    } catch (error) {
      console.error("Error removing schedules for completed show:", error);
      // Don't fail the main operation if schedule cleanup fails
    }
  } else {
    const needsWatchingStatus = existingStatus.status !== WatchStatus.WATCHING;
    const needsNextEpisodeDateUpdate = !areDatesEqual(
      existingStatus.nextEpisodeDate,
      progressState.nextEpisodeDate,
    );

    if (needsWatchingStatus || needsNextEpisodeDateUpdate) {
      await db
        .update(userContentStatus)
        .set({
          ...(needsWatchingStatus
            ? {
                status: WatchStatus.WATCHING,
                updatedAt: new Date(),
              }
            : {}),
          nextEpisodeDate: progressState.nextEpisodeDate,
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, ContentType.TV),
          ),
        );
    }

    if (needsWatchingStatus) {
      newStatus = WatchStatus.WATCHING;
    }
  }

  // Sync status to collaborators if it changed
  if (newStatus) {
    await syncStatusToCollaborators(userId, tmdbId, ContentType.TV, newStatus);
  }

  return newStatus;
}

/**
 * Complete episode workflow: update status, sync to collaborators, create activity, update show status
 */
export async function completeEpisodeUpdate(
  userId: string,
  tmdbId: number,
  seasonNumber: number,
  episodeNumber: number,
  watched: boolean,
  episodeName?: string,
  options?: {
    skipShowStatus?: boolean;
    timeZone?: string;
  },
) {
  // Update episode status
  const episodeResult = await updateEpisodeWatchStatus(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched,
  );

  // Sync to collaborators
  const syncedCollaboratorIds = await syncEpisodeStatusToCollaborators(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched,
  );

  // Create activity entry
  await createEpisodeActivityEntry(
    userId,
    tmdbId,
    seasonNumber,
    episodeNumber,
    watched,
    syncedCollaboratorIds,
    episodeName,
  );

  // Update show status
  const newStatus = options?.skipShowStatus
    ? null
    : await updateTVShowStatus(
        userId,
        tmdbId,
        seasonNumber,
        episodeNumber,
        watched,
        { timeZone: options?.timeZone },
      );

  return {
    episode: episodeResult,
    newStatus,
    syncedCollaboratorIds,
  };
}

/**
 * Batch update multiple episodes.
 *
 * DATA-04: the show is fetched from TMDB once for the whole batch, every
 * episode row is written in a single upsert, one summary activity row is
 * emitted, and the writes run inside a transaction so a mid-batch failure
 * cannot leave half a season marked with a stale show status.
 */
export async function batchUpdateEpisodes(
  userId: string,
  tmdbId: number,
  episodes: EpisodeSelection[],
) {
  const targetEpisodes = dedupeEpisodeSelections(episodes);

  if (targetEpisodes.length === 0) {
    return {
      episodes: [],
      newStatus: null,
      syncedCollaboratorIds: [] as string[],
    };
  }

  const timeZone = await getUserTimeZone(userId);

  // Every episode in a batch belongs to the same show, so one TMDB round trip
  // covers the whole batch instead of one per episode. Fetched before the
  // transaction opens so a slow upstream call never holds a DB transaction.
  let showDetails: TMDBTVShowDetails | undefined;
  try {
    showDetails = await tmdbClient.getTVShowDetails(tmdbId);
  } catch (error) {
    console.error(
      "Error loading show details for batch episode update:",
      error,
    );
  }

  const now = new Date();
  const rows = targetEpisodes.map((episode) => ({
    userId,
    tmdbId,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    watched: episode.watched,
    watchedAt: episode.watched ? now : null,
  }));

  const anyWatched = targetEpisodes.some((episode) => episode.watched);
  const summaryEpisode =
    [...targetEpisodes].reverse().find((episode) => episode.watched === anyWatched) ??
    targetEpisodes[targetEpisodes.length - 1];

  const { updatedEpisodes, syncedCollaboratorIds } = await db.transaction(
    async (tx) => {
      const updated = await tx
        .insert(episodeWatchStatus)
        .values(rows)
        .onConflictDoUpdate({
          target: [
            episodeWatchStatus.userId,
            episodeWatchStatus.tmdbId,
            episodeWatchStatus.seasonNumber,
            episodeWatchStatus.episodeNumber,
          ],
          set: {
            watched: sql`excluded.watched`,
            watchedAt: sql`excluded.watched_at`,
            updatedAt: now,
          },
        })
        .returning();

      const synced = await syncEpisodeStatusesToCollaborators(
        userId,
        tmdbId,
        targetEpisodes,
        tx,
      );

      // One summary row per perceived action rather than one row per episode.
      await createEpisodeActivityEntry(
        userId,
        tmdbId,
        summaryEpisode.seasonNumber,
        summaryEpisode.episodeNumber,
        anyWatched,
        synced,
        undefined,
        {
          showDetails,
          episodeCount: targetEpisodes.length,
          executor: tx,
        },
      );

      return { updatedEpisodes: updated ?? [], syncedCollaboratorIds: synced };
    },
  );

  // LOGIC-02: recompute unconditionally. An all-unwatch batch ("reset season")
  // contains no watched episode, and skipping the recompute used to leave the
  // show stuck on `completed`.
  const finalStatus = await updateTVShowStatus(
    userId,
    tmdbId,
    summaryEpisode.seasonNumber,
    summaryEpisode.episodeNumber,
    anyWatched,
    { timeZone, showDetails },
  );

  return {
    episodes: updatedEpisodes,
    newStatus: finalStatus,
    syncedCollaboratorIds,
  };
}
