import { NextResponse } from "next/server";
import { withAuth, AuthenticatedRequest } from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import {
  activityFeed,
  users,
  lists,
  listCollaborators,
  showSchedules,
  userContentStatus,
  episodeWatchStatus,
} from "@/lib/db/schema";
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
import { tmdbClient } from "@/lib/tmdb/client";

// GET /api/activity - Get paginated activity timeline
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "10");
    const cursor = searchParams.get("cursor"); // ISO timestamp for cursor-based pagination
    const type = searchParams.get("type"); // Optional filter by activity type

    // Build the query conditions
    let whereConditions;

    if (cursor && type) {
      whereConditions = and(
        or(
          eq(activityFeed.userId, request.user.id),
          arrayContains(activityFeed.collaborators, [request.user.id])
        ),
        lt(activityFeed.createdAt, new Date(cursor)),
        eq(activityFeed.activityType, type)
      );
    } else if (cursor) {
      whereConditions = and(
        or(
          eq(activityFeed.userId, request.user.id),
          arrayContains(activityFeed.collaborators, [request.user.id])
        ),
        lt(activityFeed.createdAt, new Date(cursor))
      );
    } else if (type) {
      whereConditions = and(
        or(
          eq(activityFeed.userId, request.user.id),
          arrayContains(activityFeed.collaborators, [request.user.id])
        ),
        eq(activityFeed.activityType, type)
      );
    } else {
      whereConditions = or(
        eq(activityFeed.userId, request.user.id),
        arrayContains(activityFeed.collaborators, [request.user.id])
      );
    }

    // Get user's collaborative lists to include collaborative activities
    const userCollaborativeLists = await db
      .select({ listId: lists.id })
      .from(lists)
      .leftJoin(listCollaborators, eq(lists.id, listCollaborators.listId))
      .where(
        or(
          eq(lists.ownerId, request.user.id),
          eq(listCollaborators.userId, request.user.id)
        )
      );

    const collaborativeListIds = userCollaborativeLists.map((l) => l.listId);

    // Include activities from collaborative lists
    if (collaborativeListIds.length > 0) {
      let collaborativeConditions = and(
        inArray(activityFeed.listId, collaborativeListIds),
        eq(activityFeed.isCollaborative, true)
      );

      if (cursor) {
        collaborativeConditions = and(
          collaborativeConditions,
          lt(activityFeed.createdAt, new Date(cursor))
        );
      }

      if (type) {
        collaborativeConditions = and(
          collaborativeConditions,
          eq(activityFeed.activityType, type)
        );
      }

      whereConditions = or(whereConditions, collaborativeConditions);
    }

    const activities = await db
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
      .limit(limit + 1); // Fetch one extra to determine if there are more

    const hasMore = activities.length > limit;
    const resultActivities = hasMore ? activities.slice(0, limit) : activities;

    const allCollaborators = await db
      .select({
        id: users.id,
        username: users.username,
        profilePictureUrl: users.profilePictureUrl,
      })
      .from(users)
      .where(
        inArray(
          users.id,
          resultActivities.flatMap((activity) => activity.collaborators ?? [])
        )
      );

    const nextCursor =
      hasMore && resultActivities.length > 0
        ? resultActivities[resultActivities.length - 1].createdAt.toISOString()
        : null;

    // Get upcoming activities (scheduled shows for today)
    const today = new Date().getDay(); // 0 = Sunday, 1 = Monday, etc.

    const upcomingActivities = await db
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
        and(
          eq(showSchedules.userId, request.user.id),
          eq(showSchedules.dayOfWeek, today)
        )
      );

    // For each scheduled show, find the next episode to watch
    const upcomingWithEpisodes = await Promise.all(
      upcomingActivities.map(async (activity) => {
        // Check if there are any episodes watched today to filter out
        const watchedToday = await db
          .select()
          .from(episodeWatchStatus)
          .where(
            and(
              eq(episodeWatchStatus.userId, request.user.id),
              eq(episodeWatchStatus.tmdbId, activity.tmdbId),
              eq(episodeWatchStatus.watched, true),
              sql`DATE(${episodeWatchStatus.watchedAt}) = CURRENT_DATE`
            )
          );

        // If episodes were watched today, skip this show
        if (watchedToday.length > 0) {
          return null;
        }

        // Get show details from TMDB
        const showDetails = await tmdbClient.getTVShowDetails(activity.tmdbId);
        const { name, poster_path } = showDetails;

        return {
          tmdbId: activity.tmdbId,
          scheduleId: activity.scheduleId,
          status: activity.status,
          title: name,
          posterPath: poster_path,
        };
      })
    );

    return NextResponse.json({
      activities: resultActivities.map((activity) => ({
        id: activity.id,
        activityType: activity.activityType,
        user: {
          id: activity.userId,
          username: activity.username,
          profilePictureUrl: activity.userProfilePicture,
        },
        metadata: activity.metadata,
        createdAt: activity.createdAt,
        contentType: activity.contentType,
        tmdbId: activity.tmdbId,
        listId: activity.listId,
        isCollaborative: activity.isCollaborative,
        collaborators: activity.collaborators?.map((collaboratorId) => ({
          id: collaboratorId,
          username: allCollaborators.find((c) => c.id === collaboratorId)
            ?.username,
          profilePictureUrl: allCollaborators.find(
            (c) => c.id === collaboratorId
          )?.profilePictureUrl,
        })),
      })),
      upcoming: upcomingWithEpisodes
        .filter((upcoming) => upcoming !== null)
        .map((upcoming) => ({
          tmdbId: upcoming.tmdbId,
          scheduleId: upcoming.scheduleId,
          status: upcoming.status,
          title: upcoming.title,
          posterPath: upcoming.posterPath,
        })),
      hasMore,
      nextCursor,
    });
  } catch (error) {
    console.error("Error fetching activity timeline:", error);
    return NextResponse.json(
      { error: "Failed to fetch activity timeline" },
      { status: 500 }
    );
  }
});
