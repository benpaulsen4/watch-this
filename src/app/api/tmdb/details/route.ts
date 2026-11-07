import { authedRoute } from "@/lib/api/route";
import { isTMDBHttpError, tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getContentDetailsSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/details - Movie or TV show details
export const GET = authedRoute(
  tmdbApi.getContentDetails,
  getContentDetailsSchemas,
  async ({ query }) => {
    try {
      return query.type === "movie"
        ? await tmdbClient.getMovieDetails(query.id)
        : await tmdbClient.getTVShowDetails(query.id);
    } catch (error) {
      if (isTMDBHttpError(error) && error.status === 404) return "notFound";
      throw error;
    }
  },
);
