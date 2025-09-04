import { NextResponse } from "next/server";
import { tmdbClient } from "@/lib/tmdb/client";
import {
  withAuth,
  handleApiError,
  validatePagination,
  AuthenticatedRequest,
} from "@/lib/auth/api-middleware";
import { enrichWithContentStatus } from "@/lib/tmdb/contentUtils";

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

    let results;

    switch (type) {
      case "movie":
        results = await tmdbClient.searchMovies(
          query.trim(),
          validatedPage,
          year ? parseInt(year) : undefined
        );
        break;
      case "tv":
        results = await tmdbClient.searchTVShows(
          query.trim(),
          validatedPage,
          year ? parseInt(year) : undefined
        );
        break;
      case "all":
      default:
        results = await tmdbClient.searchMulti(query.trim(), validatedPage);
        break;
    }

    // Enrich results with watch status
    if (results.results && results.results.length > 0) {
      const enrichedResults = await Promise.all(
        results.results.map(async (item) => {
          return await enrichWithContentStatus(item, request.user.id);
        })
      );

      results.results = enrichedResults;
    }

    return NextResponse.json(results);
  } catch (error) {
    return handleApiError(error, "TMDB search");
  }
});
