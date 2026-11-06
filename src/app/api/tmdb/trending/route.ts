import { authedRoute } from "@/lib/api/route";
import { mapAllWithContentStatus } from "@/lib/content-status/service";
import { tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getTrendingSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/trending - Trending content with the user's watch status
export const GET = authedRoute(
  tmdbApi.getTrending,
  getTrendingSchemas,
  async ({ user, query }) => {
    const intermediateResults = await tmdbClient.getTrending(
      query.media_type,
      query.time_window,
    );

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
