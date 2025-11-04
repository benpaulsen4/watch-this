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
    const type = searchParams.get("type") as "movie" | "tv";
    const genre = searchParams.get("genre");
    const year = searchParams.get("year");
    const sortBy = searchParams.get("sort_by");

    if (type && !["movie", "tv"].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "movie" or "tv"' },
        { status: 400 },
      );
    }

    const { page: validatedPage, error: pageError } = validatePagination(
      searchParams.get("page"),
    );
    if (pageError) {
      return pageError;
    }

    const params: {
      page?: number;
      genre?: number;
      year?: number;
      sortBy?: string;
    } = {
      page: validatedPage,
    };

    if (genre) {
      const genreId = parseInt(genre);
      if (!isNaN(genreId) && genreId > 0) {
        params.genre = genreId;
      }
    }

    if (year) {
      const yearNum = parseInt(year);
      if (
        !isNaN(yearNum) &&
        yearNum >= 1900 &&
        yearNum <= new Date().getFullYear() + 5
      ) {
        params.year = yearNum;
      }
    }

    if (sortBy) {
      const validSortOptions = [
        "popularity.desc",
        "popularity.asc",
        "vote_average.desc",
        "vote_average.asc",
        "release_date.desc",
        "release_date.asc",
        "first_air_date.desc",
        "first_air_date.asc",
      ];

      if (validSortOptions.includes(sortBy)) {
        params.sortBy = sortBy;
      }
    }

    let results;

    if (type === "movie") {
      results = await tmdbClient.discoverMovies(params);
    } else if (type === "tv") {
      results = await tmdbClient.discoverTVShows(params);
    } else {
      const [movies, tvShows] = await Promise.all([
        tmdbClient.discoverMovies(params),
        tmdbClient.discoverTVShows(params),
      ]);
      const combinedDiscover = [...movies.results, ...tvShows.results].sort(
        (a, b) => b.popularity - a.popularity,
      );

      results = {
        page: validatedPage,
        results: combinedDiscover,
        total_pages: movies.total_pages + tvShows.total_pages,
        total_results: movies.total_results + tvShows.total_results,
      };
    }

    // Enrich results with watch status
    if (results.results && results.results.length > 0) {
      const enrichedResults = await Promise.all(
        results.results.map(async (item) => {
          return await enrichWithContentStatus(item, request.user.id);
        }),
      );

      results.results = enrichedResults;
    }

    return NextResponse.json(results);
  } catch (error) {
    return handleApiError(error, "TMDB discover");
  }
});
