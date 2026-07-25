import {
  and,
  arrayContains,
  desc,
  eq,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";

import {
  activityFeed,
  ContentType,
  db,
  episodeWatchStatus,
  listCollaborators,
  lists,
  showSchedules,
  userContentStatus,
  users,
} from "../db";
import { getTimezoneDateKey, resolveTimeZone } from "../time";
import { getAllCachedContent, getCachedContent } from "../tmdb/cache-utils";
import type {
  ActivityItem,
  ActivityTimelineResponse,
  ListActivityInput,
  UpcomingActivity,
} from "./types";

/**
 * `activity_feed.id` is a `uuid` column, and the cursor reaches this service
 * verbatim from a query param. Feeding an arbitrary string to `lt(id, ...)`
 * makes Postgres raise `22P02 invalid input syntax for type uuid`, which
 * surfaces as an unhandled 500 on an endpoint that already has a perfectly
 * good `invalidCursor` -> 400 path. Validate the shape here instead.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * LOGIC-14: pagination used a bare `createdAt` cursor with a strict `lt`.
 * Batch writes can land several rows in the same millisecond, so a page
 * boundary falling mid-tie silently dropped every remaining row at that
 * timestamp. The cursor is now compound — `<iso>|<id>` — with `id` acting as
 * the tiebreaker in both the predicate and the ordering. Bare-ISO cursors
 * minted by older clients still parse and keep the old strict-`lt` behaviour.
 */
function encodeCursor(createdAt: Date, id: string): string {
  return `${createdAt.toISOString()}|${id}`;
}

function decodeCursor(
  cursor: string,
): { createdAt: Date; id?: string } | "invalid" {
  const separatorIndex = cursor.lastIndexOf("|");
  const rawDate =
    separatorIndex === -1 ? cursor : cursor.slice(0, separatorIndex);
  const rawId =
    separatorIndex === -1 ? undefined : cursor.slice(separatorIndex + 1);

  const createdAt = new Date(rawDate);
  if (Number.isNaN(createdAt.getTime())) return "invalid";

  // A bare-ISO cursor (no separator) has no id half and stays legacy-shaped.
  // Anything else claiming to carry an id must actually carry a uuid.
  if (rawId === undefined) return { createdAt };
  if (!UUID_PATTERN.test(rawId)) return "invalid";

  return { createdAt, id: rawId };
}

export async function listActivityTimeline(
  userId: string,
  userTimezone: string,
  input: ListActivityInput
): Promise<ActivityTimelineResponse | "invalidCursor"> {
  const timeZone = resolveTimeZone(userTimezone);

  // Clamp both floor and ceiling so a caller cannot request an unbounded page.
  const limit = Math.min(Math.max(1, input.limit || 10), 100);
  let cursorDate: Date | undefined;
  let cursorId: string | undefined;
  if (input.cursor) {
    const decoded = decodeCursor(input.cursor);
    if (decoded === "invalid") {
      return "invalidCursor";
    }
    cursorDate = decoded.createdAt;
    cursorId = decoded.id;
  }

  const cursorCondition = cursorDate
    ? cursorId
      ? or(
          lt(activityFeed.createdAt, cursorDate),
          and(
            eq(activityFeed.createdAt, cursorDate),
            lt(activityFeed.id, cursorId)
          )
        )
      : lt(activityFeed.createdAt, cursorDate)
    : undefined;

  // DATA-08b: the set of lists the user can see is resolved by the database as
  // a subquery instead of being pulled into JS and fed back in as a literal
  // `inArray` list.
  const visibleListIds = db
    .select({ id: lists.id })
    .from(lists)
    .leftJoin(listCollaborators, eq(lists.id, listCollaborators.listId))
    .where(or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)));

  const whereConditions = and(
    or(
      eq(activityFeed.userId, userId),
      arrayContains(activityFeed.collaborators, [userId]),
      and(
        inArray(activityFeed.listId, visibleListIds),
        eq(activityFeed.isCollaborative, true)
      )
    ),
    cursorCondition,
    input.type ? eq(activityFeed.activityType, input.type) : undefined
  );

  const activitiesRows = await db
    .select({
      id: activityFeed.id,
      userId: activityFeed.userId,
      activityType: activityFeed.activityType,
      tmdbId: activityFeed.tmdbId,
      contentType: activityFeed.contentType,
      listId: activityFeed.listId,
      metadata: activityFeed.metadata,
      collaborators: activityFeed.collaborators,
      isCollaborative: activityFeed.isCollaborative,
      createdAt: activityFeed.createdAt,
      username: users.username,
      userProfilePicture: users.profilePictureUrl,
    })
    .from(activityFeed)
    // DATA-11: `activity_feed.user_id` is NOT NULL with a cascading FK, so the
    // user row always exists — an outer join only blocks planner reordering.
    .innerJoin(users, eq(activityFeed.userId, users.id))
    .where(whereConditions)
    .orderBy(desc(activityFeed.createdAt), desc(activityFeed.id))
    .limit(limit + 1);

  const hasMore = activitiesRows.length > limit;
  const resultRows = hasMore ? activitiesRows.slice(0, limit) : activitiesRows;

  const collaboratorIds = resultRows.flatMap((r) => r.collaborators ?? []);
  const allCollaborators = collaboratorIds.length
    ? await db
        .select({
          id: users.id,
          username: users.username,
          profilePictureUrl: users.profilePictureUrl,
        })
        .from(users)
        .where(inArray(users.id, collaboratorIds))
    : [];

  const activities: ActivityItem[] = resultRows.map((row) => ({
    id: row.id,
    activityType: row.activityType,
    user: {
      id: row.userId,
      username: row.username,
      profilePictureUrl: row.userProfilePicture ?? null,
    },
    metadata: (row.metadata ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
    contentType: row.contentType ?? undefined,
    tmdbId: row.tmdbId ?? undefined,
    listId: row.listId ?? undefined,
    isCollaborative: row.isCollaborative,
    collaborators: (row.collaborators ?? []).map((collaboratorId) => ({
      id: collaboratorId,
      username:
        allCollaborators.find((c) => c.id === collaboratorId)?.username || "",
      profilePictureUrl:
        allCollaborators.find((c) => c.id === collaboratorId)
          ?.profilePictureUrl ?? null,
    })),
  }));

  const dayNameFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  });
  const dayName = dayNameFormatter.format(new Date());
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const today = dayMap[dayName] ?? new Date().getDay();

  const upcomingRows = await db
    .select({
      tmdbId: showSchedules.tmdbId,
      scheduleId: showSchedules.id,
      status: userContentStatus.status,
      statusUpdatedAt: userContentStatus.updatedAt,
      nextEpisodeDate: userContentStatus.nextEpisodeDate,
    })
    .from(showSchedules)
    .innerJoin(
      userContentStatus,
      and(
        eq(showSchedules.userId, userContentStatus.userId),
        eq(showSchedules.tmdbId, userContentStatus.tmdbId),
        eq(userContentStatus.contentType, "tv")
      )
    )
    .where(
      and(eq(showSchedules.userId, userId), eq(showSchedules.dayOfWeek, today))
    );

  const todayKey = getTimezoneDateKey(new Date(), timeZone);
  const candidateUpcomingRows = upcomingRows.filter(
    (row) =>
      !row.nextEpisodeDate ||
      getTimezoneDateKey(row.nextEpisodeDate, timeZone) <= todayKey
  );

  let watchedTodayTmdbIds = new Set<number>();
  if (candidateUpcomingRows.length > 0) {
    const watchedTodayRows = await db
      .select()
      .from(episodeWatchStatus)
      .where(
        and(
          eq(episodeWatchStatus.userId, userId),
          inArray(
            episodeWatchStatus.tmdbId,
            candidateUpcomingRows.map((row) => row.tmdbId)
          ),
          eq(episodeWatchStatus.watched, true),
          sql`DATE(${episodeWatchStatus.watchedAt} AT TIME ZONE ${timeZone}) = DATE(now() AT TIME ZONE ${timeZone})`
        )
      );
    watchedTodayTmdbIds = new Set(
      watchedTodayRows.map((row) => row.tmdbId as number)
    );
  }

  const rowsToHydrate = candidateUpcomingRows.filter(
    (row) => !watchedTodayTmdbIds.has(row.tmdbId)
  );

  const upcoming: UpcomingActivity[] = [];
  if (rowsToHydrate.length > 0) {
    try {
      const detailsList = await getAllCachedContent(
        rowsToHydrate.map((row) => ({
          tmdbId: row.tmdbId,
          contentType: ContentType.TV,
        })),
        userId
      );

      detailsList.forEach((details, index) => {
        upcoming.push({
          ...details,
          scheduleId: rowsToHydrate[index].scheduleId,
        });
      });
    } catch {
      const fallbackDetails = await Promise.allSettled(
        rowsToHydrate.map((row) =>
          getCachedContent(row.tmdbId, ContentType.TV, userId)
        )
      );

      fallbackDetails.forEach((result, index) => {
        if (result.status !== "fulfilled") return;

        upcoming.push({
          ...result.value,
          scheduleId: rowsToHydrate[index].scheduleId,
        });
      });
    }
  }

  const nextCursor =
    hasMore && resultRows.length > 0
      ? encodeCursor(
          resultRows[resultRows.length - 1].createdAt,
          resultRows[resultRows.length - 1].id
        )
      : null;

  return { activities, upcoming, hasMore, nextCursor };
}
