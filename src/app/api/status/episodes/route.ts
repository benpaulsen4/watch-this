import { NextResponse } from "next/server";

import {
  AuthenticatedRequest,
  handleApiError,
  withAuth,
} from "@/lib/auth/api-middleware";
import {
  batchUpdateEpisodeStatuses,
  deleteEpisodeStatuses,
  listEpisodeStatuses,
  updateEpisodeStatus,
} from "@/lib/episodes/service";
import type { BatchUpdateEpisodesInputItem } from "@/lib/episodes/types";

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
        { status: 400 },
      );
    }

    const result = await listEpisodeStatuses(
      userId,
      parseInt(tmdbId),
      seasonNumber ? parseInt(seasonNumber) : undefined,
      episodeNumber ? parseInt(episodeNumber) : undefined,
    );
    return NextResponse.json(result);
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
        { status: 400 },
      );
    }

    if (typeof seasonNumber !== "number" || typeof episodeNumber !== "number") {
      return NextResponse.json(
        { error: "seasonNumber and episodeNumber must be numbers" },
        { status: 400 },
      );
    }

    if (seasonNumber < 0 || episodeNumber < 1) {
      return NextResponse.json(
        { error: "Invalid season or episode number" },
        { status: 400 },
      );
    }

    const result = await updateEpisodeStatus(userId, {
      tmdbId,
      seasonNumber,
      episodeNumber,
      watched,
    });
    return NextResponse.json(result, { status: 201 });
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
        { status: 400 },
      );
    }

    if (episodes.length === 0) {
      return NextResponse.json(
        { error: "Episodes array cannot be empty" },
        { status: 400 },
      );
    }

    if (episodes.length > 100) {
      return NextResponse.json(
        { error: "Cannot update more than 100 episodes at once" },
        { status: 400 },
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
          { status: 400 },
        );
      }
    }

    const result = await batchUpdateEpisodeStatuses(
      userId,
      tmdbId,
      episodes as BatchUpdateEpisodesInputItem[],
    );
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
        { status: 400 },
      );
    }

    const { deletedCount } = await deleteEpisodeStatuses(
      userId,
      parseInt(tmdbId),
      seasonNumber ? parseInt(seasonNumber) : undefined,
      episodeNumber ? parseInt(episodeNumber) : undefined,
    );
    return NextResponse.json({
      message: `Removed ${deletedCount} episode status(es) successfully`,
      deletedCount,
    });
  } catch (error) {
    return handleApiError(error, "Delete episode status");
  }
});
