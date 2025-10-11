import { NextResponse } from "next/server";
import { tmdbClient } from "@/lib/tmdb/client";
import {
  withAuth,
  AuthenticatedRequest,
  handleApiError,
} from "@/lib/auth/api-middleware";

// GET /api/tmdb/episodes/[id] - Get TV show season or episode details
export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams, pathname } = new URL(request.url);
    // Extract ID from pathname: /api/tmdb/episodes/[id]
    const pathSegments = pathname.split("/");
    const tvId = parseInt(pathSegments[pathSegments.length - 1]);
    const seasonNumber = searchParams.get("season");
    const episodeNumber = searchParams.get("episode");

    // Validate TV show ID
    if (isNaN(tvId) || tvId <= 0) {
      return NextResponse.json(
        { error: "Invalid TV show ID" },
        { status: 400 },
      );
    }

    // If no season is specified, return error
    if (!seasonNumber) {
      return NextResponse.json(
        { error: "Season number is required" },
        { status: 400 },
      );
    }

    const season = parseInt(seasonNumber);
    if (isNaN(season) || season < 0) {
      return NextResponse.json(
        { error: "Invalid season number" },
        { status: 400 },
      );
    }

    // If episode number is provided, get specific episode details
    if (episodeNumber) {
      const episode = parseInt(episodeNumber);
      if (isNaN(episode) || episode < 1) {
        return NextResponse.json(
          { error: "Invalid episode number" },
          { status: 400 },
        );
      }

      try {
        const episodeDetails = await tmdbClient.getTVEpisodeDetails(
          tvId,
          season,
          episode,
        );
        return NextResponse.json({ episode: episodeDetails });
      } catch (error) {
        if (error instanceof Error && error.message.includes("404")) {
          return NextResponse.json(
            { error: "Episode not found" },
            { status: 404 },
          );
        }
        throw error;
      }
    }

    // Otherwise, get season details with all episodes
    try {
      const seasonDetails = await tmdbClient.getTVSeasonDetails(tvId, season);
      return NextResponse.json({ season: seasonDetails });
    } catch (error) {
      if (error instanceof Error && error.message.includes("404")) {
        return NextResponse.json(
          { error: "Season not found" },
          { status: 404 },
        );
      }
      throw error;
    }
  } catch (error) {
    return handleApiError(error, "Get TV episodes");
  }
});
