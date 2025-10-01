import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  userContentStatus,
  ContentType,
  ContentTypeEnum,
  MovieWatchStatus,
  MovieWatchStatusEnum,
  TVWatchStatus,
  TVWatchStatusEnum,
  activityFeed,
  ActivityType,
  showSchedules,
} from "@/lib/db/schema";
import {
  withAuth,
  AuthenticatedRequest,
  handleApiError,
} from "@/lib/auth/api-middleware";
import { eq, and } from "drizzle-orm";
import { syncStatusToCollaborators } from "@/lib/activity/sync-utils";
import { tmdbClient, TMDBMovie, TMDBTVShow } from "@/lib";

// Helper function to remove schedules when a show is completed or dropped
async function removeSchedulesForCompletedOrDroppedShow(
  userId: string,
  tmdbId: number,
  contentType: string,
  status: string
) {
  // Only remove schedules for TV shows that are completed or dropped
  if (contentType === ContentType.TV && (status === "completed" || status === "dropped")) {
    try {
      const deletedSchedules = await db
        .delete(showSchedules)
        .where(
          and(
            eq(showSchedules.userId, userId),
            eq(showSchedules.tmdbId, tmdbId)
          )
        )
        .returning();
      
      if (deletedSchedules.length > 0) {
        console.log(`Automatically removed ${deletedSchedules.length} schedule(s) for ${status} show ${tmdbId}`);
      }
    } catch (error) {
      console.error("Error removing schedules for completed/dropped show:", error);
      // Don't fail the main operation if schedule cleanup fails
    }
  }
}

// GET /api/status/content - Get content watch status for authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const contentType = searchParams.get("contentType");

    if (!tmdbId || !contentType) {
      return NextResponse.json(
        { error: "tmdbId and contentType are required" },
        { status: 400 }
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    const status = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, parseInt(tmdbId)),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);

    return NextResponse.json({
      status: status[0] || null,
    });
  } catch (error) {
    return handleApiError(error, "Get content status");
  }
});

// POST /api/status/content - Create or update content watch status
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = (await request.json()) as {
      tmdbId: number;
      contentType: string;
      status: string;
    };
    const { tmdbId, contentType, status } = body;

    // Validation
    if (!tmdbId || !contentType || !status) {
      return NextResponse.json(
        { error: "tmdbId, contentType, and status are required" },
        { status: 400 }
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    // Validate status based on content type
    if (contentType === ContentType.MOVIE) {
      if (
        !Object.values(MovieWatchStatus).includes(
          status as MovieWatchStatusEnum
        )
      ) {
        return NextResponse.json(
          { error: "Invalid movie status. Must be 'planning' or 'completed'" },
          { status: 400 }
        );
      }
    } else if (contentType === ContentType.TV) {
      if (!Object.values(TVWatchStatus).includes(status as TVWatchStatusEnum)) {
        return NextResponse.json(
          {
            error:
              "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'",
          },
          { status: 400 }
        );
      }
    }

    // Check if status already exists
    const existingStatus = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, tmdbId),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);

    let result;
    if (existingStatus.length > 0) {
      // Update existing status
      [result] = await db
        .update(userContentStatus)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(userContentStatus.userId, userId),
            eq(userContentStatus.tmdbId, tmdbId),
            eq(userContentStatus.contentType, contentType)
          )
        )
        .returning();
    } else {
      // Create new status
      [result] = await db
        .insert(userContentStatus)
        .values({
          userId,
          tmdbId,
          contentType,
          status,
        })
        .returning();
    }

    // Remove schedules if show is completed or dropped
    await removeSchedulesForCompletedOrDroppedShow(userId, tmdbId, contentType, status);

    // Sync status to collaborators if applicable
    const syncedCollaboratorIds = await syncStatusToCollaborators(
      userId,
      tmdbId,
      contentType,
      status
    );

    // Create activity entry
    try {
      // Get content details from TMDB
      const contentDetails =
        contentType === ContentType.MOVIE
          ? await tmdbClient.getMovieDetails(tmdbId)
          : await tmdbClient.getTVShowDetails(tmdbId);

      await db.insert(activityFeed).values({
        userId,
        activityType: ActivityType.STATUS_CHANGED,
        tmdbId,
        contentType,
        metadata: {
          status,
          title:
            (contentDetails as TMDBMovie)?.title ??
            (contentDetails as TMDBTVShow)?.name,
          posterPath: contentDetails.poster_path,
        },
        collaborators: syncedCollaboratorIds,
        isCollaborative: syncedCollaboratorIds.length > 0,
      });
    } catch (activityError) {
      console.error("Error creating activity entry:", activityError);
      // Don't fail the main operation if activity creation fails
    }

    return NextResponse.json({ status: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Create/update content status");
  }
});

// PUT /api/status/content - Update existing content watch status
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = (await request.json()) as {
      tmdbId: number;
      contentType: string;
      status?: string;
    };
    const { tmdbId, contentType, status } = body;

    // Validation
    if (!tmdbId || !contentType) {
      return NextResponse.json(
        { error: "tmdbId and contentType are required" },
        { status: 400 }
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status) {
      if (contentType === ContentType.MOVIE) {
        if (
          !Object.values(MovieWatchStatus).includes(
            status as MovieWatchStatusEnum
          )
        ) {
          return NextResponse.json(
            {
              error: "Invalid movie status. Must be 'planning' or 'completed'",
            },
            { status: 400 }
          );
        }
      } else if (contentType === ContentType.TV) {
        if (
          !Object.values(TVWatchStatus).includes(status as TVWatchStatusEnum)
        ) {
          return NextResponse.json(
            {
              error:
                "Invalid TV status. Must be 'planning', 'watching', 'paused', 'completed', or 'dropped'",
            },
            { status: 400 }
          );
        }
      }
    }

    // Check if status exists
    const existingStatus = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, tmdbId),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);

    if (existingStatus.length === 0) {
      return NextResponse.json(
        { error: "Content status not found" },
        { status: 404 }
      );
    }

    // Build update object with only provided fields
    const updateData: {
      updatedAt: Date;
      status?: string;
    } = {
      updatedAt: new Date(),
    };

    if (status !== undefined) updateData.status = status;

    const [result] = await db
      .update(userContentStatus)
      .set(updateData)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, tmdbId),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .returning();

    // Remove schedules if show is completed or dropped
    if (status !== undefined) {
      await removeSchedulesForCompletedOrDroppedShow(userId, tmdbId, contentType, status);
    }

    // Sync status to collaborators if applicable
    if (status !== undefined) {
      const syncedCollaboratorIds = await syncStatusToCollaborators(
        userId,
        tmdbId,
        contentType,
        status
      );

      // Create activity entry
      try {
        // Get content details from TMDB
        const contentDetails =
          contentType === ContentType.MOVIE
            ? await tmdbClient.getMovieDetails(tmdbId)
            : await tmdbClient.getTVShowDetails(tmdbId);

        await db.insert(activityFeed).values({
          userId,
          activityType: ActivityType.STATUS_CHANGED,
          tmdbId,
          contentType,
          metadata: {
            status,
            title:
              (contentDetails as TMDBMovie)?.title ??
              (contentDetails as TMDBTVShow)?.name,
            posterPath: contentDetails.poster_path,
          },
          collaborators: syncedCollaboratorIds,
          isCollaborative: syncedCollaboratorIds.length > 0,
        });
      } catch (activityError) {
        console.error("Error creating activity entry:", activityError);
        // Don't fail the main operation if activity creation fails
      }
    }

    return NextResponse.json({ status: result });
  } catch (error) {
    return handleApiError(error, "Update content status");
  }
});

// DELETE /api/status/content - Remove content watch status
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const contentType = searchParams.get("contentType");

    if (!tmdbId || !contentType) {
      return NextResponse.json(
        { error: "tmdbId and contentType are required" },
        { status: 400 }
      );
    }

    if (!Object.values(ContentType).includes(contentType as ContentTypeEnum)) {
      return NextResponse.json(
        { error: "Invalid content type. Must be 'movie' or 'tv'" },
        { status: 400 }
      );
    }

    // Check if status exists
    const existingStatus = await db
      .select()
      .from(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, parseInt(tmdbId)),
          eq(userContentStatus.contentType, contentType)
        )
      )
      .limit(1);

    if (existingStatus.length === 0) {
      return NextResponse.json(
        { error: "Content status not found" },
        { status: 404 }
      );
    }

    await db
      .delete(userContentStatus)
      .where(
        and(
          eq(userContentStatus.userId, userId),
          eq(userContentStatus.tmdbId, parseInt(tmdbId)),
          eq(userContentStatus.contentType, contentType)
        )
      );

    return NextResponse.json({
      message: "Content status removed successfully",
    });
  } catch (error) {
    return handleApiError(error, "Delete content status");
  }
});
