import { NextResponse } from "next/server";
import { tmdbClient, TMDBSearchResult } from "@/lib/tmdb/client";
import {
  withAuth,
  handleApiError,
  validatePagination,
  AuthenticatedRequest,
} from "@/lib/auth/api-middleware";
import {
  mapAllWithContentStatus,
  mapWithContentStatus,
} from "@/lib/content-status/service";
import {
  TMDBContent,
  TMDBContentSearchResult,
} from "@/lib/content-status/types";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const type = searchParams.get("type") as "all" | "movie" | "tv" | null;
    const year = searchParams.get("year");

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
    }
    if (year) {
      const yearNum = parseInt(year);
      if (!type || type === "all") {
        return NextResponse.json(
          { error: "Year cannot be used with multi search" },
          { status: 400 }
        );
      }
      if (
        isNaN(yearNum) ||
        yearNum < 1900 ||
        yearNum > new Date().getFullYear() + 5
      ) {
        return NextResponse.json(
          { error: "Year must be between 1900 and next 5 years" },
          { status: 400 }
        );
      }
    }

    const { page: validatedPage, error: pageError } = validatePagination(
      searchParams.get("page")
    );
    if (pageError) {
      return pageError;
    }

    let intermediateResults: TMDBSearchResult;

    switch (type) {
      case "movie":
        intermediateResults = await tmdbClient.searchMovies(
          query.trim(),
          validatedPage,
          year ? parseInt(year) : undefined
        );
        break;
      case "tv":
        intermediateResults = await tmdbClient.searchTVShows(
          query.trim(),
          validatedPage,
          year ? parseInt(year) : undefined
        );
        break;
      case "all":
      default:
        intermediateResults = await tmdbClient.searchMulti(
          query.trim(),
          validatedPage
        );
        break;
    }

    const finalResults: TMDBContentSearchResult = {
      page: intermediateResults.page,
      results: [],
      totalPages: intermediateResults.total_pages,
      totalResults: intermediateResults.total_results,
    };

    // Enrich results with watch status
    if (intermediateResults.results && intermediateResults.results.length > 0) {
      finalResults.results = await mapAllWithContentStatus(
        intermediateResults.results,
        request.user.id
      );
    }

    return NextResponse.json(finalResults);
  } catch (error) {
    return handleApiError(error, "TMDB search");
  }
});
