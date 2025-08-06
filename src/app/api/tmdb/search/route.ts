import { NextResponse } from "next/server";
import { tmdbClient } from "@/lib/tmdb/client";
import {
  withAuth,
  handleApiError,
  validatePagination,
  AuthenticatedRequest,
} from "@/lib/auth/api-middleware";

export const GET = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q");
    const type = searchParams.get("type") as "multi" | "movie" | "tv" | null;

    if (!query || query.trim().length === 0) {
      return NextResponse.json(
        { error: "Search query is required" },
        { status: 400 }
      );
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
        results = await tmdbClient.searchMovies(query.trim(), validatedPage);
        break;
      case "tv":
        results = await tmdbClient.searchTVShows(query.trim(), validatedPage);
        break;
      case "multi":
      default:
        results = await tmdbClient.searchMulti(query.trim(), validatedPage);
        break;
    }

    return NextResponse.json(results);
  } catch (error) {
    return handleApiError(error, "TMDB search");
  }
});
