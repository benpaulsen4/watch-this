import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { episodeWatchStatus } from "@/lib/db/schema";
import {
  withAuth,
  AuthenticatedRequest,
  handleApiError,
} from "@/lib/auth/api-middleware";
import { eq, and } from "drizzle-orm";
import { completeEpisodeUpdate, batchUpdateEpisodes } from "@/lib/episodes";

// GET /api/status/episodes - Get episode watch status for authenticated user
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const seasonNumber = searchParams.get("seasonNumber");
    const episodeNumber = searchParams.get("episodeNumber");

    if (!tmdbId) {
      return NextResponse.json(
        { error: "tmdbId is required" },
        { status: 400 }
      );
    }

    // Build query conditions
    const conditions = [
      eq(episodeWatchStatus.userId, userId),
      eq(episodeWatchStatus.tmdbId, parseInt(tmdbId)),
    ];

    // Filter by season if provided
    if (seasonNumber) {
      conditions.push(
        eq(episodeWatchStatus.seasonNumber, parseInt(seasonNumber))
      );
    }

    // Filter by specific episode if both season and episode are provided
    if (episodeNumber) {
      conditions.push(
        eq(episodeWatchStatus.episodeNumber, parseInt(episodeNumber))
      );
    }

    const episodes = await db
      .select()
      .from(episodeWatchStatus)
      .where(and(...conditions));

    return NextResponse.json({ episodes });
  } catch (error) {
    return handleApiError(error, "Get episode status");
  }
});

// POST /api/status/episodes - Mark episode as watched/unwatched
export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json();
    const { tmdbId, seasonNumber, episodeNumber, watched = true } = body;

    // Validation
    if (!tmdbId || seasonNumber === undefined || episodeNumber === undefined) {
      return NextResponse.json(
        { error: "tmdbId, seasonNumber, and episodeNumber are required" },
        { status: 400 }
      );
    }

    if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number") {
      return NextResponse.json(
        { error: "seasonNumber and episodeNumber must be numbers" },
        { status: 400 }
      );
    }

    if (seasonNumber < 0 || episodeNumber < 1) {
      return NextResponse.json(
        { error: "Invalid season or episode number" },
        { status: 400 }
      );
    }

    // Use the extracted utility function for the complete episode update workflow
    const { episode: result, newStatus } = await completeEpisodeUpdate(
      userId,
      tmdbId,
      seasonNumber,
      episodeNumber,
      watched
    );

    return NextResponse.json({ episode: result, newStatus }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Update episode status");
  }
});

// PUT /api/status/episodes/batch - Batch update multiple episodes
export const PUT = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const body = await request.json();
    const { tmdbId, episodes } = body;

    // Validation
    if (!tmdbId || !Array.isArray(episodes)) {
      return NextResponse.json(
        { error: "tmdbId and episodes array are required" },
        { status: 400 }
      );
    }

    if (episodes.length === 0) {
      return NextResponse.json(
        { error: "Episodes array cannot be empty" },
        { status: 400 }
      );
    }

    if (episodes.length > 100) {
      return NextResponse.json(
        { error: "Cannot update more than 100 episodes at once" },
        { status: 400 }
      );
    }

    // Validate each episode
    for (const episode of episodes) {
      if (
        typeof episode.seasonNumber !== "number" ||
        typeof episode.episodeNumber !== "number" ||
        typeof episode.watched !== "boolean"
      ) {
        return NextResponse.json(
          {
            error:
              "Each episode must have seasonNumber, episodeNumber, and watched properties",
          },
          { status: 400 }
        );
      }
    }

    const result = await batchUpdateEpisodes(userId, tmdbId, episodes);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "Batch update episode status");
  }
});

// DELETE /api/status/episodes - Remove episode watch status
export const DELETE = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id;
    const { searchParams } = new URL(request.url);
    const tmdbId = searchParams.get("tmdbId");
    const seasonNumber = searchParams.get("seasonNumber");
    const episodeNumber = searchParams.get("episodeNumber");

    if (!tmdbId) {
      return NextResponse.json(
        { error: "tmdbId is required" },
        { status: 400 }
      );
    }

    let deleteCondition = and(
      eq(episodeWatchStatus.userId, userId),
      eq(episodeWatchStatus.tmdbId, parseInt(tmdbId))
    );

    // If season and episode are specified, delete specific episode
    if (seasonNumber && episodeNumber) {
      deleteCondition = and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, parseInt(tmdbId)),
        eq(episodeWatchStatus.seasonNumber, parseInt(seasonNumber)),
        eq(episodeWatchStatus.episodeNumber, parseInt(episodeNumber))
      );
    }
    // If only season is specified, delete all episodes in that season
    else if (seasonNumber) {
      deleteCondition = and(
        eq(episodeWatchStatus.userId, userId),
        eq(episodeWatchStatus.tmdbId, parseInt(tmdbId)),
        eq(episodeWatchStatus.seasonNumber, parseInt(seasonNumber))
      );
    }
    // If neither is specified, delete all episodes for the show

    const deletedEpisodes = await db
      .delete(episodeWatchStatus)
      .where(deleteCondition)
      .returning();

    return NextResponse.json({
      message: `Removed ${deletedEpisodes.length} episode status(es) successfully`,
      deletedCount: deletedEpisodes.length,
    });
  } catch (error) {
    return handleApiError(error, "Delete episode status");
  }
});
