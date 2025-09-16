import { NextResponse } from "next/server";
import { and, eq, desc } from "drizzle-orm";
import {
  withAuth,
  AuthenticatedRequest,
  handleApiError,
} from "@/lib/auth/api-middleware";
import { db } from "@/lib/db";
import { episodeWatchStatus } from "@/lib/db/schema";
import { tmdbClient } from "@/lib/tmdb/client";
import {
  syncEpisodeStatusToCollaborators,
  createEpisodeActivityEntry,
  updateTVShowStatus,
} from "@/lib/episodes";

// POST /api/status/episodes/next - Mark the next available episode as watched
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json();
    const { tmdbId } = body;

    // Validation
    if (!tmdbId || typeof tmdbId !== "number") {
      return NextResponse.json(
        { error: "tmdbId is required and must be a number" },
        { status: 400 }
      );
    }

    // Validate that the TV show exists
    try {
      await tmdbClient.getTVShowDetails(tmdbId);
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return NextResponse.json(
          { error: "TV show not found" },
          { status: 404 }
        );
      }
      throw error;
    }

    // Get user's current episode watch history for this show
    const watchedEpisodes = await db
      .select()
      .from(episodeWatchStatus)
      .where(
        and(
          eq(episodeWatchStatus.userId, userId),
          eq(episodeWatchStatus.tmdbId, tmdbId),
          eq(episodeWatchStatus.watched, true)
        )
      )
      .orderBy(
        desc(episodeWatchStatus.seasonNumber),
        desc(episodeWatchStatus.episodeNumber)
      );

    // Determine the next episode to watch
    let nextSeasonNumber = 1;
    let nextEpisodeNumber = 1;

    if (watchedEpisodes.length > 0) {
      // Find the most recent watched episode
      const lastWatched = watchedEpisodes[0];

      // Get season details to check episode count
      let seasonDetails;
      try {
        seasonDetails = await tmdbClient.getTVSeasonDetails(
          tmdbId,
          lastWatched.seasonNumber
        );
      } catch {
        return NextResponse.json(
          { error: "Failed to get season details" },
          { status: 500 }
        );
      }

      // Check if there's a next episode in the same season
      if (lastWatched.episodeNumber < seasonDetails.episodes.length) {
        nextSeasonNumber = lastWatched.seasonNumber;
        nextEpisodeNumber = lastWatched.episodeNumber + 1;
      } else {
        // Move to next season
        nextSeasonNumber = lastWatched.seasonNumber + 1;
        nextEpisodeNumber = 1;
      }
    }

    // Validate that the next episode exists and has aired
    let nextEpisodeDetails;
    try {
      nextEpisodeDetails = await tmdbClient.getTVEpisodeDetails(
        tmdbId,
        nextSeasonNumber,
        nextEpisodeNumber
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return NextResponse.json(
          { error: "No next episode available. You're all caught up!" },
          { status: 400 }
        );
      }
      throw error;
    }

    // Check if the episode has aired
    const airDate = new Date(nextEpisodeDetails.air_date);
    const now = new Date();

    if (airDate > now) {
      return NextResponse.json(
        {
          error: `Next episode hasn't aired yet. Check back on ${airDate.toLocaleDateString()}.`,
          nextAirDate: nextEpisodeDetails.air_date,
        },
        { status: 400 }
      );
    }

    // Check if episode is already marked as watched
    const existingStatus = await db
      .select()
      .from(episodeWatchStatus)
      .where(
        and(
          eq(episodeWatchStatus.userId, userId),
          eq(episodeWatchStatus.tmdbId, tmdbId),
          eq(episodeWatchStatus.seasonNumber, nextSeasonNumber),
          eq(episodeWatchStatus.episodeNumber, nextEpisodeNumber)
        )
      )
      .limit(1);

    let result;
    if (existingStatus.length > 0) {
      // Update existing status to watched
      [result] = await db
        .update(episodeWatchStatus)
        .set({
          watched: true,
          watchedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(episodeWatchStatus.userId, userId),
            eq(episodeWatchStatus.tmdbId, tmdbId),
            eq(episodeWatchStatus.seasonNumber, nextSeasonNumber),
            eq(episodeWatchStatus.episodeNumber, nextEpisodeNumber)
          )
        )
        .returning();
    } else {
      // Create new episode status
      [result] = await db
        .insert(episodeWatchStatus)
        .values({
          userId,
          tmdbId,
          seasonNumber: nextSeasonNumber,
          episodeNumber: nextEpisodeNumber,
          watched: true,
          watchedAt: new Date(),
        })
        .returning();
    }

    // Sync episode status to collaborators
    const syncedCollaboratorIds = await syncEpisodeStatusToCollaborators(
      userId,
      tmdbId,
      nextSeasonNumber,
      nextEpisodeNumber,
      true
    );

    // Create activity entry for episode progress
    await createEpisodeActivityEntry(
      userId,
      tmdbId,
      nextSeasonNumber,
      nextEpisodeNumber,
      true,
      syncedCollaboratorIds,
      nextEpisodeDetails.name
    );

    // Auto-update show status based on episode progress
    const newStatus = await updateTVShowStatus(
      userId,
      tmdbId,
      nextSeasonNumber,
      nextEpisodeNumber,
      true
    );

    return NextResponse.json(
      {
        episode: result,
        newStatus,
        episodeDetails: {
          seasonNumber: nextSeasonNumber,
          episodeNumber: nextEpisodeNumber,
          name: nextEpisodeDetails.name,
          airDate: nextEpisodeDetails.air_date,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, "Mark next episode as watched");
  }
});
