import { authedRoute } from "@/lib/api/route";
import {
  tmdbClient,
  TMDBMovieCastMember,
  TMDBTVAggregateCastMember,
} from "@/lib/tmdb/client";
import * as tmdbApi from "@/lib/tmdb/contract";
import { getCreditsSchemas } from "@/lib/tmdb/schemas";

// GET /api/tmdb/credits - Cast for a movie or TV show
export const GET = authedRoute(
  tmdbApi.getCredits,
  getCreditsSchemas,
  async ({ query }) => {
    if (query.type === "movie") {
      const credits = await tmdbClient.getMovieCredits(query.id);
      const cast = (credits.cast as TMDBMovieCastMember[]).map((c) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profile_path: c.profile_path,
      }));
      return { cast };
    }

    const credits = await tmdbClient.getTVAggregateCredits(query.id);
    const cast = (credits.cast as TMDBTVAggregateCastMember[]).map((c) => ({
      id: c.id,
      name: c.name,
      character: c.roles?.[0]?.character ?? null,
      profile_path: c.profile_path,
    }));
    return { cast };
  },
);
