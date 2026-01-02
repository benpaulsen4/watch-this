import { NextResponse } from "next/server";
import { tmdbClient, TMDBSearchItem } from "@/lib/tmdb/client";
import {
  withAuth,
  handleApiError,
  AuthenticatedRequest,
} from "@/lib/auth/api-middleware";
import { mapWithContentStatus } from "@/lib/content-status/service";
import { TMDBContentSearchResult } from "@/lib/content-status/types";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const mediaType = searchParams.get("media_type") as
      | "all"
      | "movie"
      | "tv"
      | null;
    const timeWindow = searchParams.get("time_window") as "day" | "week" | null;

    const validMediaTypes = ["all", "movie", "tv"];
    const validTimeWindows = ["day", "week"];

    if (mediaType && !validMediaTypes.includes(mediaType)) {
      return NextResponse.json(
        { error: 'Media type must be "all", "movie", or "tv"' },
        { status: 400 }
      );
    }

    if (timeWindow && !validTimeWindows.includes(timeWindow)) {
      return NextResponse.json(
        { error: 'Time window must be "day" or "week"' },
        { status: 400 }
      );
    }

    const intermediateResults = await tmdbClient.getTrending(
      mediaType || "all",
      timeWindow || "week"
    );

    const finalResults: TMDBContentSearchResult = {
      page: intermediateResults.page,
      results: [],
      totalPages: intermediateResults.total_pages,
      totalResults: intermediateResults.total_results,
    };

    // Enrich results with watch status
    if (intermediateResults.results && intermediateResults.results.length > 0) {
      const enrichedResults = await Promise.all(
        intermediateResults.results.map(async (item) => {
          return await mapWithContentStatus(item, request.user.id);
        })
      );

      finalResults.results = enrichedResults;
    }

    return NextResponse.json(finalResults);
  } catch (error) {
    return handleApiError(error, "TMDB trending");
  }
});
