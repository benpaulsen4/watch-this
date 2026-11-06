import { authedRoute } from "@/lib/api/route";
import { isTMDBHttpError, tmdbClient } from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getSeasonOrEpisodeSchemas } from "@/lib/tmdb/schemas";

const isNotFound = (error: unknown) =>
  isTMDBHttpError(error) && error.status === 404;

// GET /api/tmdb/episodes/[id] - A season with its episodes, or one episode
// when `episode` is given
export const GET = authedRoute(
  tmdbApi.getSeasonOrEpisode,
  getSeasonOrEpisodeSchemas,
  async ({ params, query }) => {
    if (query.episode !== undefined) {
      try {
        return {
          episode: await tmdbClient.getTVEpisodeDetails(
            params.id,
            query.season,
            query.episode,
          ),
        };
      } catch (error) {
        if (isNotFound(error)) return "episodeNotFound";
        throw error;
      }
    }

    try {
      return {
        season: await tmdbClient.getTVSeasonDetails(params.id, query.season),
      };
    } catch (error) {
      if (isNotFound(error)) return "seasonNotFound";
      throw error;
    }
  },
);
