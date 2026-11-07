import { authedRoute } from "@/lib/api/route";
import { mapAllWithContentStatus } from "@/lib/content-status/service";
import { tmdbClient, TMDBSearchResult } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { discoverContentSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/discover - Browse movies, TV shows, or both, with the user's
// watch status on each result
export const GET = authedRoute(
  tmdbApi.discoverContent,
  discoverContentSchemas,
  async ({ user, query }) => {
    const params = {
      page: query.page,
      genre: query.genre,
      year: query.year,
      sortBy: query.sort_by,
    };

    let intermediateResults: TMDBSearchResult;

    if (query.type === "movie") {
      intermediateResults = await tmdbClient.discoverMovies(params);
    } else if (query.type === "tv") {
      intermediateResults = await tmdbClient.discoverTVShows(params);
    } else {
      const [movies, tvShows] = await Promise.all([
        tmdbClient.discoverMovies(params),
        tmdbClient.discoverTVShows(params),
      ]);
      const combinedDiscover = [...movies.results, ...tvShows.results].sort(
        (a, b) => b.popularity - a.popularity,
      );

      intermediateResults = {
        page: query.page,
        results: combinedDiscover,
        total_pages: movies.total_pages + tvShows.total_pages,
        total_results: movies.total_results + tvShows.total_results,
      };
    }

    return {
      page: intermediateResults.page,
      results:
        intermediateResults.results?.length > 0
          ? await mapAllWithContentStatus(intermediateResults.results, user.id)
          : [],
      totalPages: intermediateResults.total_pages,
      totalResults: intermediateResults.total_results,
    };
  },
);
