import { authedRoute } from "@/lib/api/route";
import { mapAllWithContentStatus } from "@/lib/content-status/service";
import { tmdbClient, TMDBSearchResult } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { searchContentSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/search - Search movies, TV shows, or both, with the user's
// watch status on each result
export const GET = authedRoute(
  tmdbApi.searchContent,
  searchContentSchemas,
  async ({ user, query }) => {
    let intermediateResults: TMDBSearchResult;

    switch (query.type) {
      case "movie":
        intermediateResults = await tmdbClient.searchMovies(
          query.q,
          query.page,
          query.year,
        );
        break;
      case "tv":
        intermediateResults = await tmdbClient.searchTVShows(
          query.q,
          query.page,
          query.year,
        );
        break;
      case "all":
        intermediateResults = await tmdbClient.searchMulti(query.q, query.page);
        break;
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
