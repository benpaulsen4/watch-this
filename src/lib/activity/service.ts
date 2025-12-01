import {
  db,
  activityFeed,
  users,
  lists,
  listCollaborators,
  showSchedules,
  userContentStatus,
  episodeWatchStatus,
} from "../db";
import type { WatchStatusEnum } from "../db";
import {
  eq,
  desc,
  and,
  or,
  inArray,
  lt,
  arrayContains,
  sql,
} from "drizzle-orm";
import { tmdbClient } from "../tmdb/client";
import type {
  ActivityTimelineResponse,
  ListActivityInput,
  ActivityItem,
  UpcomingActivity,
} from "./types";

export async function listActivityTimeline(
  userId: string,
  userTimezone: string,
  input: ListActivityInput
): Promise<ActivityTimelineResponse | "invalidCursor"> {
  const limit = Math.max(1, input.limit || 10);
  let cursorDate: Date | undefined;
  if (input.cursor) {
    const d = new Date(input.cursor);
    if (isNaN(d.getTime())) {
      return "invalidCursor";
    }
    cursorDate = d;
  }

  let whereConditions;
  if (cursorDate && input.type) {
    whereConditions = and(
      or(
        eq(activityFeed.userId, userId),
        arrayContains(activityFeed.collaborators, [userId])
      ),
      lt(activityFeed.createdAt, cursorDate),
      eq(activityFeed.activityType, input.type)
    );
  } else if (cursorDate) {
    whereConditions = and(
      or(
        eq(activityFeed.userId, userId),
        arrayContains(activityFeed.collaborators, [userId])
      ),
      lt(activityFeed.createdAt, cursorDate)
    );
  } else if (input.type) {
    whereConditions = and(
      or(
        eq(activityFeed.userId, userId),
        arrayContains(activityFeed.collaborators, [userId])
      ),
      eq(activityFeed.activityType, input.type)
    );
  } else {
    whereConditions = or(
      eq(activityFeed.userId, userId),
      arrayContains(activityFeed.collaborators, [userId])
    );
  }

  const userCollaborativeLists = await db
    .select({ listId: lists.id })
    .from(lists)
    .leftJoin(listCollaborators, eq(lists.id, listCollaborators.listId))
    .where(or(eq(lists.ownerId, userId), eq(listCollaborators.userId, userId)));

  const collaborativeListIds = userCollaborativeLists.map((l) => l.listId);

  if (collaborativeListIds.length > 0) {
    let collaborativeConditions = and(
      inArray(activityFeed.listId, collaborativeListIds),
      eq(activityFeed.isCollaborative, true)
    );
    if (cursorDate) {
      collaborativeConditions = and(
        collaborativeConditions,
        lt(activityFeed.createdAt, cursorDate)
      );
    }
    if (input.type) {
      collaborativeConditions = and(
        collaborativeConditions,
        eq(activityFeed.activityType, input.type)
      );
    }
    whereConditions = or(whereConditions, collaborativeConditions);
  }

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
    .leftJoin(users, eq(activityFeed.userId, users.id))
    .where(whereConditions)
    .orderBy(desc(activityFeed.createdAt))
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
      username: row.username || "",
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
    timeZone: userTimezone,
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

  const upcoming: UpcomingActivity[] = [];
  for (const row of upcomingRows) {
    const watchedToday = await db
      .select()
      .from(episodeWatchStatus)
      .where(
        and(
          eq(episodeWatchStatus.userId, userId),
          eq(episodeWatchStatus.tmdbId, row.tmdbId),
          eq(episodeWatchStatus.watched, true),
          sql`DATE(${episodeWatchStatus.watchedAt} AT TIME ZONE ${userTimezone}) = DATE(now() AT TIME ZONE ${userTimezone})`
        )
      );
    if (watchedToday.length > 0) continue;
    try {
      const details = await tmdbClient.getTVShowDetails(row.tmdbId);
      upcoming.push({
        ...(details as UpcomingActivity),
        scheduleId: row.scheduleId,
        watchStatus: row.status as WatchStatusEnum,
      });
    } catch {}
  }

  const nextCursor =
    hasMore && resultRows.length > 0
      ? resultRows[resultRows.length - 1].createdAt.toISOString()
      : null;

  return { activities, upcoming, hasMore, nextCursor };
}
